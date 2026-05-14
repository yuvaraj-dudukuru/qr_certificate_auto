import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { CERT_TYPES, formatCertNumber, type CertType } from '@/lib/cert-number';
import { formatLongDate } from '@/lib/date-format';
import { signCert } from '@/lib/hmac';
import { renderCertPdfViaService } from '@/lib/puppeteer-client';
import { generateCertQr } from '@/lib/qr';
import { uploadCertPdf } from '@/lib/storage';
import { getServiceSupabase } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 180; // Vercel: allow up to 3min for cold-start Puppeteer

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const CURRENT_YEAR = () => new Date().getUTCFullYear();
const TODAY_ISO = () => new Date().toISOString().slice(0, 10);

const issueBodySchema = z.object({
  type: z.enum(CERT_TYPES as readonly [CertType, ...CertType[]]),
  year: z.number().int().min(2024).max(2099).optional(),
  recipientName: z.string().trim().min(1).max(200),
  recipientEmail: z.string().email().max(254).optional().nullable(),
  program: z.string().trim().min(1).max(200),
  duration: z.string().trim().min(1).max(100),
  startDate: z.string().regex(ISO_DATE_RE, 'expected YYYY-MM-DD'),
  endDate: z.string().regex(ISO_DATE_RE, 'expected YYYY-MM-DD'),
  issueDate: z.string().regex(ISO_DATE_RE, 'expected YYYY-MM-DD').optional(),
});

type IssueBody = z.infer<typeof issueBodySchema>;

function checkBearerAuth(authHeader: string | null): { ok: true } | { ok: false; reason: string } {
  const expected = process.env.ISSUE_BEARER_TOKEN;
  if (!expected || expected.length < 16) {
    return { ok: false, reason: 'server misconfigured: ISSUE_BEARER_TOKEN missing or too short' };
  }
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return { ok: false, reason: 'missing bearer token' };
  }
  const provided = authHeader.slice('Bearer '.length).trim();
  const a = Buffer.from(provided, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { ok: false, reason: 'invalid token' };
  }
  return { ok: true };
}

async function allocateCertNumber(type: CertType, year: number): Promise<string> {
  const supabase = getServiceSupabase();
  const { data, error } = await supabase.rpc('next_cert_seq', {
    p_cert_type: type,
    p_year: year,
  });
  if (error) {
    throw new Error(`next_cert_seq failed for (${type}, ${year}): ${error.message}`);
  }
  const seq = typeof data === 'number' ? data : Number(data);
  if (!Number.isInteger(seq) || seq < 1) {
    throw new Error(`next_cert_seq returned non-integer: ${JSON.stringify(data)}`);
  }
  return formatCertNumber({ type, year, seq });
}

async function insertCertRow(
  certNumber: string,
  body: IssueBody,
  issueDate: string,
  signatureHash: string,
): Promise<void> {
  const supabase = getServiceSupabase();
  const { error } = await supabase.from('certificates').insert({
    cert_number:     certNumber,
    cert_type:       body.type,
    recipient_name:  body.recipientName,
    recipient_email: body.recipientEmail ?? null,
    program:         body.program,
    duration:        body.duration,
    start_date:      body.startDate,
    end_date:        body.endDate,
    issue_date:      issueDate,
    signature_hash:  signatureHash,
    status:          'active',
  });
  if (error) {
    throw new Error(`insert certificate row failed for ${certNumber}: ${error.message}`);
  }
}

export async function POST(request: Request): Promise<Response> {
  const auth = checkBearerAuth(request.headers.get('authorization'));
  if (!auth.ok) {
    return NextResponse.json({ error: auth.reason }, { status: 401 });
  }

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 });
  }
  const parsed = issueBodySchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid body', issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const body = parsed.data;
  const year = body.year ?? CURRENT_YEAR();
  const issueDate = body.issueDate ?? TODAY_ISO();

  let certNumber: string;
  try {
    certNumber = await allocateCertNumber(body.type, year);
  } catch (err) {
    return NextResponse.json(
      { stage: 'allocate', error: String((err as Error).message ?? err) },
      { status: 500 },
    );
  }

  const signatureHash = signCert({
    certNumber,
    recipientName: body.recipientName,
    program: body.program,
    startDate: body.startDate,
    endDate: body.endDate,
    issueDate,
  });

  try {
    await insertCertRow(certNumber, body, issueDate, signatureHash);
  } catch (err) {
    return NextResponse.json(
      { stage: 'db_insert', certNumber, error: String((err as Error).message ?? err) },
      { status: 500 },
    );
  }

  // From here on, the cert row exists. Any subsequent failure returns an
  // error but the row stays in place — caller can retry via a future
  // regenerate endpoint without re-allocating a sequence number.

  let qrPngBase64: string;
  try {
    const qr = await generateCertQr(certNumber);
    qrPngBase64 = qr.pngBase64;
  } catch (err) {
    return NextResponse.json(
      { stage: 'qr', certNumber, error: String((err as Error).message ?? err) },
      { status: 500 },
    );
  }

  let pdf: Buffer;
  try {
    pdf = await renderCertPdfViaService({
      certNumber,
      recipientName: body.recipientName,
      startDateLabel: formatLongDate(body.startDate),
      endDateLabel:   formatLongDate(body.endDate),
      issueDateLabel: formatLongDate(issueDate),
      qrPngBase64,
    });
  } catch (err) {
    return NextResponse.json(
      { stage: 'puppeteer', certNumber, error: String((err as Error).message ?? err) },
      { status: 502 },
    );
  }

  let upload;
  try {
    upload = await uploadCertPdf(certNumber, pdf);
  } catch (err) {
    return NextResponse.json(
      { stage: 'storage', certNumber, error: String((err as Error).message ?? err) },
      { status: 502 },
    );
  }

  // Node Buffer / Uint8Array don't structurally match Next.js's BodyInit
  // type (lib.dom narrows it weirdly), but at runtime Uint8Array IS a valid
  // Response body. Zero-copy view over the same memory + a single cast.
  const pdfBody = new Uint8Array(pdf.buffer, pdf.byteOffset, pdf.byteLength);
  return new Response(pdfBody as unknown as BodyInit, {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${certNumber}.pdf"`,
      'Cache-Control': 'no-store',
      'X-Cert-Number': certNumber,
      'X-Cert-Signed-Url': upload.signedUrl,
      'X-Cert-Signed-Url-Expires': upload.expiresAt,
    },
  });
}
