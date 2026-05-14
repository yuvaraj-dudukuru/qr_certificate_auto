// Read counter state and (optionally) fix the (INT,2026) counter so the next
// generated cert_number is FRY-INT-2026-00002 instead of colliding on 00001.
// Run with:  node --env-file=.env.local scripts/check-counter.cjs           (read only)
//            node --env-file=.env.local scripts/check-counter.cjs --fix     (set to 1)

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const fix = process.argv.includes('--fix');

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing.');
  process.exit(1);
}

const supabase = createClient(new URL(SUPABASE_URL).origin, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

(async () => {
  const { data, error } = await supabase
    .from('cert_counters')
    .select('cert_type, year, last_seq')
    .order('cert_type')
    .order('year');
  if (error) {
    console.error('counter read failed:', error.message);
    process.exit(1);
  }
  console.log('Current counters:');
  console.table(data);

  if (!fix) return;

  const { error: upErr } = await supabase
    .from('cert_counters')
    .upsert({ cert_type: 'INT', year: 2026, last_seq: 1 }, { onConflict: 'cert_type,year' });
  if (upErr) {
    console.error('counter upsert failed:', upErr.message);
    process.exit(1);
  }
  console.log('Set cert_counters(INT,2026).last_seq = 1');
})().catch((err) => {
  console.error('unhandled error:', err);
  process.exit(1);
});
