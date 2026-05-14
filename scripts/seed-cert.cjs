// Idempotent seed/repair for the first real certificate row.
// Run with:  node --env-file=.env.local scripts/seed-cert.cjs
//
// Canonical HMAC payload MUST match lib/hmac.ts canonicalPayload():
//   certNumber|recipientName|program|startDate|endDate|issueDate
// Any drift here = "tampered" verdict on /c/<cert>.

const { createHmac } = require('node:crypto');
const { createClient } = require('@supabase/supabase-js');

const SECRET = process.env.CERT_SIGNING_SECRET;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SECRET || SECRET.length < 32) {
  console.error('CERT_SIGNING_SECRET missing or too short (need 32+ chars).');
  process.exit(1);
}
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing.');
  process.exit(1);
}

const cert = {
  cert_number:    'FRY-INT-2026-00001',
  cert_type:      'INT',
  recipient_name: 'Test Intern',
  program:        'Web Development',
  duration:       '3-Month Internship',
  start_date:     '2026-03-01',
  end_date:       '2026-05-31',
  issue_date:     '2026-05-14',
  issued_by:      'Fraylon Technologies LLP',
};

const canonical = [
  cert.cert_number,
  cert.recipient_name,
  cert.program,
  cert.start_date,
  cert.end_date,
  cert.issue_date,
].join('|');

const signature_hash = createHmac('sha256', SECRET).update(canonical).digest('hex');

const origin = new URL(SUPABASE_URL).origin;
const supabase = createClient(origin, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

(async () => {
  const { data: existing, error: exErr } = await supabase
    .from('certificates')
    .select('cert_number,recipient_name,signature_hash,status')
    .eq('cert_number', cert.cert_number)
    .maybeSingle();
  if (exErr) {
    console.error('lookup failed:', exErr.message);
    process.exit(1);
  }

  if (existing) {
    // Row exists — UPDATE in place so the fixture matches the canonical spec.
    // Always also clear revoked state so 'tampered' or 'revoked' fixtures from
    // prior runs don't leak through.
    const { error: upErr } = await supabase
      .from('certificates')
      .update({
        recipient_name: cert.recipient_name,
        program:        cert.program,
        duration:       cert.duration,
        start_date:     cert.start_date,
        end_date:       cert.end_date,
        issue_date:     cert.issue_date,
        issued_by:      cert.issued_by,
        signature_hash,
        status:         'active',
        revoke_reason:  null,
        revoked_at:     null,
      })
      .eq('cert_number', cert.cert_number);
    if (upErr) {
      console.error('update failed:', upErr.message);
      process.exit(1);
    }
    console.log('Updated existing row:');
    console.log('  cert_number    :', cert.cert_number);
    console.log('  recipient_name :', cert.recipient_name, '(was:', existing.recipient_name + ')');
    console.log('  signature_hash :', signature_hash);
    console.log('Verify at: https://certificates.fraylontech.com/c/' + cert.cert_number);
    return;
  }

  // First-time seed path.
  const { data: counter, error: cErr } = await supabase
    .from('cert_counters')
    .select('last_seq')
    .eq('cert_type', cert.cert_type)
    .eq('year', 2026)
    .maybeSingle();
  if (cErr) {
    console.error('counter read failed:', cErr.message);
    process.exit(1);
  }
  const currentSeq = counter?.last_seq ?? 0;
  if (currentSeq !== 0) {
    console.error(
      `refusing to seed: cert_counters(${cert.cert_type},2026).last_seq is ${currentSeq}, expected 0. ` +
        'Phase 3 has already advanced the counter — pick a different cert_number.',
    );
    process.exit(1);
  }

  const { error: insErr } = await supabase
    .from('certificates')
    .insert({ ...cert, signature_hash });
  if (insErr) {
    console.error('insert failed:', insErr.message);
    process.exit(1);
  }

  const { error: upErr } = await supabase
    .from('cert_counters')
    .upsert(
      { cert_type: cert.cert_type, year: 2026, last_seq: 1 },
      { onConflict: 'cert_type,year' },
    );
  if (upErr) {
    console.error(
      'counter bump failed AFTER insert. Manual fix needed: ' +
        'set cert_counters(INT,2026).last_seq = 1 so Phase 3 starts at 00002.',
      upErr.message,
    );
    process.exit(1);
  }

  console.log('Seeded new row:');
  console.log('  cert_number    :', cert.cert_number);
  console.log('  signature_hash :', signature_hash);
  console.log('  counter        : cert_counters(INT,2026).last_seq = 1');
  console.log('Verify at: https://certificates.fraylontech.com/c/' + cert.cert_number);
})().catch((err) => {
  console.error('unhandled error:', err);
  process.exit(1);
});
