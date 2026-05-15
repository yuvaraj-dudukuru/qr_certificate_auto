// Generate a full certificate PDF + matching PNG using the EXACT same
// code path the Render container uses (renderCertPdf from dist/render.js).
//
// Outputs:
//   FRY-INT-2026-00009.pdf  — the actual PDF the issue endpoint would return
//   FRY-INT-2026-00009.png  — same HTML rendered as PNG for visual review
//                              (Chromium renders both from the same DOM, so
//                              the PNG is visually equivalent to the PDF page)
//
// Run with:  npm run build && node local-render.cjs

const { promises: fs } = require('node:fs');
const path = require('node:path');
const puppeteer = require('puppeteer');
const QRCode = require('qrcode');

const { renderCertPdf } = require('./dist/render');
const { buildCertHtml, CANVAS_WIDTH, CANVAS_HEIGHT } = require('./dist/template');

const CERT_NUMBER = 'FRY-INT-2026-00010';
const TEST_INPUT = {
  recipientName: 'Test Intern',
  bodyText:
    'has successfully completed a 3-Month Internship in Web Development at Fraylon Technologies from 1 March 2026 to 31 May 2026. During the internship, the candidate demonstrated dedication, technical skills, and excellent performance in Web Development and project development.',
  issueDateLabel: '15 May 2026',
};

async function loadFontFaceCss() {
  const fonts = [
    { family: 'Inter',            weight: 400, file: 'inter-latin-400.woff2' },
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
  // QR for the production verify URL — same as what /api/issue generates.
  const verifyUrl = `https://certificates.fraylontech.com/c/${CERT_NUMBER}`;
  const qrPng = await QRCode.toBuffer(verifyUrl, {
    errorCorrectionLevel: 'H',
    type: 'png',
    width: 600,
    margin: 1,
  });
  const qrPngBase64 = qrPng.toString('base64');

  // 1) Real render path — produces the actual PDF that would land at
  //    /api/issue's response body.
  console.log('Rendering PDF via dist/render.js renderCertPdf()…');
  const pdfStart = Date.now();
  const pdf = await renderCertPdf({ ...TEST_INPUT, qrPngBase64 });
  const pdfPath = path.resolve(__dirname, CERT_NUMBER + '.pdf');
  await fs.writeFile(pdfPath, pdf);
  console.log('  PDF saved:', pdfPath, '(' + pdf.length + ' bytes, ' + (Date.now() - pdfStart) + 'ms)');

  // 2) Render the SAME HTML as a full-resolution PNG. Same Chromium,
  //    same DOM, so visually equivalent to a page of the PDF.
  console.log('Rendering matching PNG via puppeteer screenshot…');
  const tplPath = path.resolve(__dirname, 'assets', 'cert-template.png');
  const templatePngBase64 = (await fs.readFile(tplPath)).toString('base64');
  const fontFaceCss = await loadFontFaceCss();
  const html = buildCertHtml({ ...TEST_INPUT, qrPngBase64, templatePngBase64, fontFaceCss });

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  try {
    const page = await browser.newPage();
    await page.setViewport({
      width: CANVAS_WIDTH,
      height: CANVAS_HEIGHT,
      deviceScaleFactor: 1,
    });
    await page.setContent(html, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await page.evaluate('document.fonts && document.fonts.ready');
    const pngPath = path.resolve(__dirname, CERT_NUMBER + '.png');
    await page.screenshot({ path: pngPath, type: 'png', fullPage: false });
    console.log('  PNG saved:', pngPath);
  } finally {
    await browser.close();
  }

  console.log('\nOpen FRY-INT-2026-00009.pdf in any PDF viewer to verify.');
})().catch((err) => {
  console.error('unhandled:', err);
  process.exit(1);
});
