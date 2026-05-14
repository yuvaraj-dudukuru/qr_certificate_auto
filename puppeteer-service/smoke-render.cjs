// One-shot local smoke test: generate a QR for FRY-INT-2026-00001, POST to
// the running puppeteer service on :8787, save PDF to ./smoke.pdf.
//
// Requires the service to already be running locally:
//   PUPPETEER_SERVICE_TOKEN=local-dev-token-min-16-chars-xx node dist/server.js

const { promises: fs } = require('node:fs');
const QRCode = require('qrcode');
const path = require('node:path');

const TOKEN = 'local-dev-token-min-16-chars-xx';
const URL = 'http://localhost:8787/pdf';

(async () => {
  const verifyUrl = 'https://certificates.fraylontech.com/c/FRY-INT-2026-00001';
  const qrBuf = await QRCode.toBuffer(verifyUrl, {
    errorCorrectionLevel: 'H',
    type: 'png',
    width: 600,
    margin: 1,
  });
  const qrPngBase64 = qrBuf.toString('base64');

  const body = {
    certNumber: 'FRY-INT-2026-00001',
    recipientName: 'Test Intern',
    bodyText:
      'has successfully completed a 3-Month Internship in Web Development at FRAYLON TEchnologies from 1 March 2026 to 31 May 2026. During the internship, the candidate demonstrated dedication, technical skills, and excellent performance in web technologies and project development.',
    issueDateLabel: '14 May 2026',
    qrPngBase64,
  };

  const started = Date.now();
  const res = await fetch(URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${TOKEN}`,
    },
    body: JSON.stringify(body),
  });
  const ms = Date.now() - started;

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    console.error(`FAILED ${res.status} in ${ms}ms:`, text);
    process.exit(1);
  }

  const ct = res.headers.get('content-type') || '';
  console.log(`OK in ${ms}ms (content-type: ${ct})`);
  console.log('X-Render-Ms:', res.headers.get('x-render-ms'));

  const out = path.resolve(__dirname, 'smoke.pdf');
  const arr = Buffer.from(await res.arrayBuffer());
  await fs.writeFile(out, arr);
  console.log('Saved', arr.length, 'bytes to', out);
})().catch((err) => {
  console.error('unhandled:', err);
  process.exit(1);
});
