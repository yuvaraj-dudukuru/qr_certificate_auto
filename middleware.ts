import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { isAdminEmail } from '@/lib/admin-allowlist';

// Gates /admin/* and /api/admin/*. Also refreshes the Supabase session
// cookies on every request so server components see a fresh user.
//
// Two-stage rejection:
//   - Not signed in → redirect to /login?next=<original-path>
//   - Signed in but email not in ADMIN_EMAIL_ALLOWLIST → 403 (no redirect
//     loop; user is authed, just not authorized).

export async function middleware(request: NextRequest) {
  const response = NextResponse.next({ request: { headers: request.headers } });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          response.cookies.set({ name, value, ...options });
        },
        remove(name: string, options: CookieOptions) {
          response.cookies.set({ name, value: '', ...options });
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const isAdminRoute = path.startsWith('/admin') || path.startsWith('/api/admin');
  if (!isAdminRoute) return response;

  if (!user) {
    if (path.startsWith('/api/')) {
      return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
    }
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = '/login';
    loginUrl.search = `?next=${encodeURIComponent(path)}`;
    return NextResponse.redirect(loginUrl);
  }

  if (!isAdminEmail(user.email)) {
    if (path.startsWith('/api/')) {
      return NextResponse.json({ error: 'not authorized' }, { status: 403 });
    }
    return new NextResponse('Forbidden — your account is not on the admin allowlist.', {
      status: 403,
      headers: { 'Content-Type': 'text/plain' },
    });
  }

  return response;
}

// Match every path except static assets so session refresh stays current,
// but only the /admin and /api/admin matchers actually enforce auth (the
// handler short-circuits all other paths).
export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|webp|ico|woff2?)$).*)'],
};
