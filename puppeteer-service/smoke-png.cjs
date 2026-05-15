// Renders the same HTML the service prints to PDF, but as a downscaled PNG
// for visual eyeballing. Output: smoke.png (1000x707, half of canvas).

const { promises: fs } = require('node:fs');
const path = require('node:path');
const QRCode = require('qrcode');
const puppeteer = require('puppeteer');
const { buildCertHtml, CANVAS_WIDTH, CANVAS_HEIGHT } = require('./dist/template');

async function loadFontFaceCss() {
  const fonts = [
    { family: 'Inter',            weight: 400, file: 'inter-latin-400.woff2' },
    { family: 'Playfair Display', weight: 600, file: 'playfair-latin-600.woff2' },
    { family: 'Playfair Display', weight: 700, file: 'playfair-latin-700.woff2' },
  ];
  const blocks = [];
  for (const f of fonts) {
    const buf = await fs.readFile(path.resolve(__dirname, 'assets', 'fonts', f.file));
    const b64 = buf.toString('base64');
    blocks.push(
      `@font-face { font-family: '${f.family}'; font-style: normal; font-weight: ${f.weight}; ` +
      `font-display: block; src: url(data:font/woff2;base64,${b64}) format('woff2'); }`,
    );
  }
  return blocks.join('\n');
}

(async () => {
  const tplPath = path.resolve(__dirname, 'assets', 'cert-template.png');
  const templatePngBase64 = (await fs.readFile(tplPath)).toString('base64');
  const fontFaceCss = await loadFontFaceCss();

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
    bodyText:
      'has successfully completed a 3-Month Internship in Web Development at FRAYLON TEchnologies from 1 March 2026 to 31 May 2026. During the internship, the candidate demonstrated dedication, technical skills, and excellent performance in web technologies and project development.',
    issueDateLabel: '14 May 2026',
    qrPngBase64,
    templatePngBase64,
    fontFaceCss,
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
    await page.setContent(html, { waitUntil: 'domcontentloaded', timeout: 30_000 });
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
