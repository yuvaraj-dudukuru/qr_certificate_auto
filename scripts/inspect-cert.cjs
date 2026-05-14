// Read-only inspector for a single cert row + signature reconciliation.
// Run with:  node --env-file=.env.local scripts/inspect-cert.cjs <cert_number>

const { createHmac } = require('node:crypto');
const { createClient } = require('@supabase/supabase-js');

const SECRET = process.env.CERT_SIGNING_SECRET;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const target = process.argv[2] || 'FRY-INT-2026-00001';

if (!SECRET || !SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing env (CERT_SIGNING_SECRET / NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY).');
  process.exit(1);
}

const supabase = createClient(new URL(SUPABASE_URL).origin, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

(async () => {
  const { data, error } = await supabase
    .from('certificates')
    .select(
      'cert_number,cert_type,recipient_name,program,duration,start_date,end_date,issue_date,issued_by,signature_hash,status,revoke_reason,revoked_at',
    )
    .eq('cert_number', target)
    .maybeSingle();
  if (error) {
    console.error('lookup failed:', error.message);
    process.exit(1);
  }
  if (!data) {
    console.log(`no row for ${target}`);
    process.exit(0);
  }

  const canonical = [
    data.cert_number,
    data.recipient_name,
    data.program,
    data.start_date,
    data.end_date,
    data.issue_date,
  ].join('|');
  const expected = createHmac('sha256', SECRET).update(canonical).digest('hex');
  const match = expected === data.signature_hash;

  console.log(JSON.stringify(data, null, 2));
  console.log('---');
  console.log('canonical payload :', canonical);
  console.log('expected hash     :', expected);
  console.log('stored   hash     :', data.signature_hash);
  console.log('match             :', match);
})().catch((err) => {
  console.error('unhandled error:', err);
  process.exit(1);
});
