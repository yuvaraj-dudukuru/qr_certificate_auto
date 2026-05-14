#!/usr/bin/env node
// CLI to issue a certificate via the bearer-authed /api/issue endpoint.
//
// Run with:
//   node --env-file=.env.local scripts/issue-cert.cjs \
//     --type INT --recipient "Test Intern" --program "Web Development" \
//     --duration "3-Month Internship" \
//     --start 2026-03-01 --end 2026-05-31 \
//     [--issue 2026-05-14] [--email someone@example.com] \
//     [--base https://certificates.fraylontech.com] \
//     [--out ./issued]
//
// Saves the returned PDF to <out>/<certNumber>.pdf and prints the signed URL.

const { promises: fs } = require('node:fs');
const path = require('node:path');

const TOKEN = process.env.ISSUE_BEARER_TOKEN;
const DEFAULT_BASE = process.env.ISSUE_BASE_URL || 'https://certificates.fraylontech.com';

if (!TOKEN || TOKEN.length < 16) {
  console.error('ISSUE_BEARER_TOKEN missing or too short (need ≥16 chars in .env.local).');
  process.exit(1);
}

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  if (i === -1) return fallback;
  return process.argv[i + 1];
}

const type      = arg('type');
const recipient = arg('recipient');
const program   = arg('program');
const duration  = arg('duration');
const start     = arg('start');
const end       = arg('end');
const issue     = arg('issue');                // optional, defaults server-side to today
const email     = arg('email');                // optional
const base      = arg('base', DEFAULT_BASE).replace(/\/+$/, '');
const outDir    = arg('out', './issued');

const missing = [];
if (!type)      missing.push('--type (INT|WRK|CRS)');
if (!recipient) missing.push('--recipient');
if (!program)   missing.push('--program');
if (!duration)  missing.push('--duration');
if (!start)     missing.push('--start YYYY-MM-DD');
if (!end)       missing.push('--end YYYY-MM-DD');
if (missing.length) {
  console.error('Missing required flag(s):');
  for (const m of missing) console.error('  ' + m);
  process.exit(1);
}

const body = {
  type,
  recipientName: recipient,
  program,
  duration,
  startDate: start,
  endDate:   end,
};
if (issue) body.issueDate = issue;
if (email) body.recipientEmail = email;

(async () => {
  const url = `${base}/api/issue`;
  console.log(`POST ${url}`);
  console.log('  body:', JSON.stringify(body));

  const started = Date.now();
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type':  'application/json',
      Authorization:   `Bearer ${TOKEN}`,
    },
    body: JSON.stringify(body),
  });
  const ms = Date.now() - started;

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    console.error(`FAILED ${res.status} in ${ms}ms`);
    console.error(text.slice(0, 2000));
    process.exit(1);
  }

  const ct = res.headers.get('content-type') || '';
  if (!ct.includes('application/pdf')) {
    const text = await res.text().catch(() => '');
    console.error(`unexpected content-type: ${ct}`);
    console.error(text.slice(0, 2000));
    process.exit(1);
  }

  const certNumber  = res.headers.get('x-cert-number')              || 'unknown';
  const signedUrl   = res.headers.get('x-cert-signed-url')          || '';
  const signedUntil = res.headers.get('x-cert-signed-url-expires')  || '';

  await fs.mkdir(outDir, { recursive: true });
  const filePath = path.resolve(outDir, `${certNumber}.pdf`);
  const arr = Buffer.from(await res.arrayBuffer());
  await fs.writeFile(filePath, arr);

  console.log(`OK in ${ms}ms`);
  console.log('  cert_number     :', certNumber);
  console.log('  saved to        :', filePath);
  console.log('  size            :', arr.length, 'bytes');
  console.log('  signed download :', signedUrl);
  console.log('  signed expires  :', signedUntil);
  console.log('  verify URL      :', `${base}/c/${certNumber}`);
})().catch((err) => {
  console.error('unhandled error:', err);
  process.exit(1);
});
