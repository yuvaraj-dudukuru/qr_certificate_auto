import { cookies } from 'next/headers';
import { createServerClient, type CookieOptions } from '@supabase/ssr';

// Auth-aware Supabase client for Next.js route handlers and server
// components. Reads + writes the session cookies via next/headers.
// Uses the anon key — RLS / auth applies. For service-role bypass use
// getServiceSupabase() from ./server.
export function createSupabaseRouteClient() {
  const cookieStore = cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value, ...options });
          } catch {
            // cookies().set() throws when called from a Server Component
            // (it's read-only there). Route handlers + Server Actions are
            // fine — the middleware refreshes the session in those paths.
          }
        },
        remove(name: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value: '', ...options });
          } catch {
            // see above
          }
        },
      },
    },
  );
}
