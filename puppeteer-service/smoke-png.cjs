// Renders the same HTML the service prints to PDF, but as a downscaled PNG
// for visual eyeballing. Output: smoke.png (1000x707, half of canvas).

const { promises: fs } = require('node:fs');
const path = require('node:path');
const QRCode = require('qrcode');
const puppeteer = require('puppeteer');
const { buildCertHtml, CANVAS_WIDTH, CANVAS_HEIGHT } = require('./dist/template');

(async () => {
  const tplPath = path.resolve(__dirname, 'assets', 'cert-template.png');
  const templatePngBase64 = (await fs.readFile(tplPath)).toString('base64');

  const verifyUrl = 'https://certificates.fraylontech.com/c/FRY-INT-2026-00001';
  const qrBuf = await QRCode.toBuffer(verifyUrl, {
    errorCorrectionLevel: 'H',
    type: 'png',
    width: 600,
    margin: 1,
  });
  const qrPngBase64 = qrBuf.toString('base64');

  const html = buildCertHtml({
    recipientName: 'Test Intern',
    startDateLabel: '1 March 2026',
    endDateLabel: '31 May 2026',
    issueDateLabel: '14 May 2026',
    qrPngBase64,
    templatePngBase64,
  });

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  try {
    const page = await browser.newPage();
    await page.setViewport({
      width: CANVAS_WIDTH,
      height: CANVAS_HEIGHT,
      deviceScaleFactor: 0.5, // halve to keep PNG under ~1MB
    });
    await page.setContent(html, { waitUntil: 'networkidle0', timeout: 15_000 });
    await page.evaluate('document.fonts && document.fonts.ready');
    const out = path.resolve(__dirname, 'smoke.png');
    await page.screenshot({ path: out, type: 'png', fullPage: false });
    const size = (await fs.stat(out)).size;
    console.log('PNG saved:', out, '(' + size + ' bytes)');
  } finally {
    await browser.close();
  }
})().catch((err) => {
  console.error('unhandled:', err);
  process.exit(1);
});
