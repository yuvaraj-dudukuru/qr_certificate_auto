// Server-side allowlist enforcement for admin auth.
//
// Source of truth is the ADMIN_EMAIL_ALLOWLIST env var (comma-separated).
// Emails are lower-cased before comparison so casing differences between
// Supabase (which stores lower-case) and the env var don't cause silent
// access denials.

function parseAllowlist(raw: string | undefined): readonly string[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s.length > 0);
}

export function getAdminAllowlist(): readonly string[] {
  return parseAllowlist(process.env.ADMIN_EMAIL_ALLOWLIST);
}

export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return getAdminAllowlist().includes(email.trim().toLowerCase());
}
