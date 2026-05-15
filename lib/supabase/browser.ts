'use client';

import { createBrowserClient } from '@supabase/ssr';

// Anon-key client used by client components for sign-in / sign-out flows.
// Never use this on the server, and never expose the service-role key here.
export function createSupabaseBrowserClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
