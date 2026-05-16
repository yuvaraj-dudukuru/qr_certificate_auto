// Render same template with several names to verify:
//   - short name ("Vig") centers correctly without empty space looking wrong
//   - long name ("Poornima Harshini Venkataramanachandran") doesn't overflow
//   - descender-bearing name ("Yogeshpriya Jagadeesh") clears the underline
//
// Outputs PNG strips of just the name+body band for each case.

const { promises: fs } = require('node:fs');
const path = require('node:path');
const puppeteer = require('puppeteer');
const QRCode = require('qrcode');
const { renderCertPdf } = require('./dist/render');
const { buildCertHtml, CANVAS_WIDTH, CANVAS_HEIGHT } = require('./dist/template');

const NAMES = [
  { label: 'short',     value: 'Vig' },
  { label: 'normal',    value: 'Poornima Harshini' },
  { label: 'descender', value: 'Yogeshpriya Jagadeesh' },
  { label: 'long',      value: 'Poornima Harshini Venkataramanachandran' },
];

async function loadFontFaceCss() {
  const fonts = [
    { family: 'Inter',            weight: 400, file: 'inter-latin-400.woff2' },
    { family: 'Playfair Display', weight: 400, file: 'playfair-latin-400.woff2' },
    { family: 'Playfair Display', weight: 600, file: 'playfair-latin-600.woff2' },
    { family: 'Playfair Display', weight: 700, file: 'playfair-latin-700.woff2' },
  ];
  const blocks = [];
  for (const f of fonts) {
    const buf = await fs.readFile(path.resolve(__dirname, 'assets', 'fonts', f.file));
    blocks.push(
      `@font-face { font-family: '${f.family}'; font-style: normal; font-weight: ${f.weight}; ` +
        `font-display: block; src: url(data:font/woff2;base64,${buf.toString('base64')}) format('woff2'); }`,
    );
  }
  return blocks.join('\n');
}

(async () => {
  const qrPng = await QRCode.toBuffer('https://certificates.fraylontech.com/c/SMOKE-0000', {
    errorCorrectionLevel: 'H', type: 'png', width: 600, margin: 1,
  });
  const qrPngBase64 = qrPng.toString('base64');

  const tplPath = path.resolve(__dirname, 'assets', 'cert-template.png');
  const templatePngBase64 = (await fs.readFile(tplPath)).toString('base64');
  const fontFaceCss = await loadFontFaceCss();

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  try {
    for (const n of NAMES) {
      const html = buildCertHtml({
        recipientName: n.value,
        bodyText: 'has successfully completed a 3-Month Internship in Web Development at Fraylon Technologies from 1 March 2026 to 31 May 2026. During the internship, the candidate demonstrated dedication, technical skills, and excellent performance in Web Development and project development.',
        issueDateLabel: '15 May 2026',
        qrPngBase64,
        templatePngBase64,
        fontFaceCss,
      });
      const page = await browser.newPage();
      await page.setViewport({ width: CANVAS_WIDTH, height: CANVAS_HEIGHT, deviceScaleFactor: 1 });
      await page.setContent(html, { waitUntil: 'domcontentloaded', timeout: 30_000 });
      await page.evaluate('document.fonts && document.fonts.ready');
      const out = path.resolve(__dirname, `smoke-name-${n.label}.png`);
      await page.screenshot({ path: out, clip: { x: 0, y: 580, width: CANVAS_WIDTH, height: 240 } });
      console.log(n.label, '→', n.value, '→', out);
      await page.close();
    }
  } finally {
    await browser.close();
  }
})().catch((e) => { console.error(e); process.exit(1); });
