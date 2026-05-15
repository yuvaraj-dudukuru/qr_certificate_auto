import { NextResponse } from 'next/server';
import { z } from 'zod';
import { isAdminEmail } from '@/lib/admin-allowlist';
import { CERT_TYPES, type CertType } from '@/lib/cert-number';
import { issueCertificate } from '@/lib/issue-cert';
import { createSupabaseRouteClient } from '@/lib/supabase/route';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 180;

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// Stricter than /api/issue's schema: end > start is enforced here because
// the admin UI is the primary surface and we want clear errors. The CLI
// schema stays permissive on purpose (legacy / scripted callers).
const adminIssueBodySchema = z
  .object({
    type: z.enum(CERT_TYPES as readonly [CertType, ...CertType[]]),
    recipientName: z.string().trim().min(1, 'recipient name required').max(200),
    recipientEmail: z
      .string()
      .trim()
      .max(254)
      .email('invalid email')
      .optional()
      .or(z.literal('').transform(() => undefined)),
    program: z.string().trim().min(1, 'program required').max(200),
    duration: z.string().trim().min(1, 'duration required').max(100),
    startDate: z.string().regex(ISO_DATE_RE, 'expected YYYY-MM-DD'),
    endDate: z.string().regex(ISO_DATE_RE, 'expected YYYY-MM-DD'),
    issueDate: z.string().regex(ISO_DATE_RE, 'expected YYYY-MM-DD').optional(),
    notes: z
      .string()
      .max(2000)
      .optional()
      .or(z.literal('').transform(() => undefined)),
  })
  .refine((d) => d.endDate > d.startDate, {
    message: 'end date must be after start date',
    path: ['endDate'],
  });

function stageToHttp(stage: 'allocate' | 'db_insert' | 'qr' | 'puppeteer' | 'storage'): number {
  return stage === 'puppeteer' || stage === 'storage' ? 502 : 500;
}

export async function POST(request: Request): Promise<Response> {
  // Middleware has already gated this route — but defense in depth, the
  // route itself re-verifies the session + allowlist in case middleware
  // config is later changed.
  const supabase = createSupabaseRouteClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  if (!isAdminEmail(user.email)) {
    return NextResponse.json({ error: 'not authorized' }, { status: 403 });
  }

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 });
  }
  const parsed = adminIssueBodySchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid body', issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const result = await issueCertificate({
    type: parsed.data.type,
    recipientName: parsed.data.recipientName,
    recipientEmail: parsed.data.recipientEmail,
    program: parsed.data.program,
    duration: parsed.data.duration,
    startDate: parsed.data.startDate,
    endDate: parsed.data.endDate,
    issueDate: parsed.data.issueDate,
    notes: parsed.data.notes,
  });

  if (!result.ok) {
    return NextResponse.json(
      { stage: result.stage, certNumber: result.certNumber, error: result.message },
      { status: stageToHttp(result.stage) },
    );
  }

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
