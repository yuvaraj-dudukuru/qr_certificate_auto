import { NextResponse } from 'next/server';
import { z } from 'zod';
import { isAdminEmail } from '@/lib/admin-allowlist';
import { isValidCertNumber } from '@/lib/cert-number';
import { createSupabaseRouteClient } from '@/lib/supabase/route';
import { getServiceSupabase } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const revokeSchema = z.object({
  certNumber: z.string().min(1).max(64).refine(isValidCertNumber, 'invalid cert_number format'),
  reason: z.string().trim().min(1, 'reason required').max(500),
});

export async function POST(request: Request): Promise<Response> {
  const supabase = createSupabaseRouteClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  if (!isAdminEmail(user.email)) {
    return NextResponse.json({ error: 'not authorized' }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 });
  }
  const parsed = revokeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid body', issues: parsed.error.issues },
      { status: 400 },
    );
  }

  // Service-role write to bypass RLS. Update only certs that are currently
  // active — re-revoking already-revoked rows would clobber the original
  // reason/timestamp.
  const svc = getServiceSupabase();
  const { data, error } = await svc
    .from('certificates')
    .update({
      status:        'revoked',
      revoke_reason: parsed.data.reason,
      revoked_at:    new Date().toISOString(),
    })
    .eq('cert_number', parsed.data.certNumber)
    .eq('status', 'active')
    .select('cert_number')
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: `revoke failed: ${error.message}` }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json(
      { error: 'cert not found or already revoked' },
      { status: 404 },
    );
  }

  return NextResponse.json({ ok: true, certNumber: data.cert_number });
}
