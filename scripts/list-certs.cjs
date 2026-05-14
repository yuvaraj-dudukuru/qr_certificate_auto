// List all certificate rows (cert_number + recipient + status only).
// Run with:  node --env-file=.env.local scripts/list-certs.cjs

const { createClient } = require('@supabase/supabase-js');
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing Supabase env.');
  process.exit(1);
}

const supabase = createClient(new URL(SUPABASE_URL).origin, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

(async () => {
  const { data, error } = await supabase
    .from('certificates')
    .select('cert_number, recipient_name, status, created_at')
    .order('cert_number');
  if (error) {
    console.error('list failed:', error.message);
    process.exit(1);
  }
  console.log(`${data.length} cert(s):`);
  console.table(data);
})().catch((err) => {
  console.error('unhandled:', err);
  process.exit(1);
});
