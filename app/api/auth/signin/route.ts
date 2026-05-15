import { NextResponse } from 'next/server';
import { z } from 'zod';
import { isAdminEmail } from '@/lib/admin-allowlist';
import { createSupabaseRouteClient } from '@/lib/supabase/route';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const SAFE_NEXT_RE = /^\/[A-Za-z0-9/_\-?&=.]*$/;

const signInSchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(1).max(200),
  next: z.string().max(512).optional(),
});

function safeNext(raw: string | undefined): string {
  if (!raw) return '/admin';
  if (!SAFE_NEXT_RE.test(raw)) return '/admin';
  // never redirect to login/auth routes; would loop or escape the gate
  if (raw.startsWith('/login') || raw.startsWith('/api/auth')) return '/admin';
  return raw;
}

export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid JSON body' }, { status: 400 });
  }
  const parsed = signInSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'invalid email or password format' }, { status: 400 });
  }
  const { email, password } = parsed.data;
  const next = safeNext(parsed.data.next);

  const supabase = createSupabaseRouteClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error || !data.user) {
    // Generic message — don't leak whether the email exists.
    return NextResponse.json(
      { ok: false, error: 'Invalid email or password.' },
      { status: 401 },
    );
  }

  if (!isAdminEmail(data.user.email)) {
    // Authed but not allowlisted. Sign out immediately so the session
    // cookie doesn't persist (otherwise the user is "signed in but locked
    // out" — confusing).
    await supabase.auth.signOut();
    return NextResponse.json(
      { ok: false, error: 'Your account is not on the admin allowlist.' },
      { status: 403 },
    );
  }

  return NextResponse.json({ ok: true, redirectTo: next });
}
