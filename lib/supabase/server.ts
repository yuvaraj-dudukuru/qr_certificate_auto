import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// Server-only Supabase client. Uses the service-role key, which bypasses RLS.
// MUST NEVER be imported into a client component or shipped to the browser.

let cached: SupabaseClient | null = null;

function readEnv(name: string): string {
  const value = process.env[name];
  if (!value || value.length === 0) {
    throw new Error(`Missing required env: ${name}`);
  }
  return value;
}

function normalizeSupabaseUrl(raw: string): string {
  // The Project URL is the bare origin (e.g. https://<ref>.supabase.co).
  // It's easy to paste the REST URL (`.../rest/v1`) or leave a trailing slash —
  // both produce "Invalid path specified in request URL" from the edge router.
  // Normalize to origin only so the SDK can append `/rest/v1/...` cleanly.
  try {
    return new URL(raw).origin;
  } catch {
    throw new Error(`NEXT_PUBLIC_SUPABASE_URL is not a valid URL: ${raw}`);
  }
}

export function getServiceSupabase(): SupabaseClient {
  if (cached) return cached;
  const url = normalizeSupabaseUrl(readEnv('NEXT_PUBLIC_SUPABASE_URL'));
  const serviceKey = readEnv('SUPABASE_SERVICE_ROLE_KEY');
  cached = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { 'x-fraylon-svc': 'verify' } },
  });
  return cached;
}
