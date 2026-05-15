import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { CERT_TYPES, type CertType } from '@/lib/cert-number';
import { issueCertificate } from '@/lib/issue-cert';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 180; // Vercel: allow up to 3min for cold-start Puppeteer

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

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
  notes: z.string().max(2000).optional().nullable(),
});

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

function stageToHttp(stage: 'allocate' | 'db_insert' | 'qr' | 'puppeteer' | 'storage'): number {
  switch (stage) {
    case 'puppeteer':
    case 'storage':
      return 502; // upstream failure, retryable
    default:
      return 500;
  }
}

export async function POST(request: Request): Promise<Response> {
  const auth = checkBearerAuth(request.headers.get('authorization'));
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: 401 });

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

  const result = await issueCertificate(parsed.data);
  if (!result.ok) {
    return NextResponse.json(
      { stage: result.stage, certNumber: result.certNumber, error: result.message },
      { status: stageToHttp(result.stage) },
    );
  }

  // Buffer doesn't satisfy BodyInit in Next.js's strict lib.dom typings;
  // Uint8Array view is zero-copy + a single cast.
  const pdfBody = new Uint8Array(result.pdf.buffer, result.pdf.byteOffset, result.pdf.byteLength);
  return new Response(pdfBody as unknown as BodyInit, {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${result.certNumber}.pdf"`,
      'Cache-Control': 'no-store',
      'X-Cert-Number': result.certNumber,
      'X-Cert-Signed-Url': result.signedUrl,
      'X-Cert-Signed-Url-Expires': result.expiresAt,
    },
  });
}
