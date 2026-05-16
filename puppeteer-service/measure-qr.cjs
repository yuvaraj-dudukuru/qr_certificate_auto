// Forensic dark-band scan of cert-template.png. Walks every row in the
// central column, reports contiguous bands of >20 dark pixels with their
// (y, height, x-bounds, peak count). Use this to identify exactly where
// baked-in text and underlines live before deciding overlay RECTs in
// src/template.ts.
//
// Replaces the prior "find recipient + date underline" specialization —
// the post-2026-05-16 template bakes placeholder text into every overlay
// slot, so a general band scan is more useful than landmark detection.

const { promises: fs } = require('node:fs');
const path = require('node:path');
const puppeteer = require('puppeteer');

const TEMPLATE_PATH = path.resolve(__dirname, 'assets', 'cert-template.png');
const TH = 180;  // counts both black text and teal underlines as "dark"

(async () => {
  const buf = await fs.readFile(TEMPLATE_PATH);
  const b64 = buf.toString('base64');
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 2000, height: 1414 });
    await page.setContent(
      `<!DOCTYPE html><html><body style="margin:0">
       <img id="t" src="data:image/png;base64,${b64}" /></body></html>`,
      { waitUntil: 'domcontentloaded', timeout: 15_000 },
    );
    await page.evaluate(
      () => new Promise((r) => {
        const img = document.getElementById('t');
        if (img.complete) r(null); else img.onload = () => r(null);
      }),
    );

    const W = 2000, H = 1414;
    const raw = await page.evaluate(({ w, h }) => {
      const img = document.getElementById('t');
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      const ctx = c.getContext('2d');
      ctx.drawImage(img, 0, 0);
      return Array.from(ctx.getImageData(0, 0, w, h).data);
    }, { w: W, h: H });
    const data = new Uint8ClampedArray(raw);

    function darkAt(x, y) {
      const i = (y * W + x) * 4;
      return data[i] < TH && data[i + 1] < TH && data[i + 2] < TH;
    }

    function rowDark(y, xMin, xMax) {
      let n = 0;
      for (let x = xMin; x < xMax; x++) if (darkAt(x, y)) n++;
      return n;
    }

    const xMin = 200, xMax = 1800;
    const bands = [];
    let inBand = null;
    for (let y = 350; y < 1350; y++) {
      const n = rowDark(y, xMin, xMax);
      if (n > 20) {
        if (!inBand) inBand = { yStart: y, yEnd: y, peak: n };
        else { inBand.yEnd = y; if (n > inBand.peak) inBand.peak = n; }
      } else if (inBand && y - inBand.yEnd > 14) {
        bands.push(inBand);
        inBand = null;
      }
    }
    if (inBand) bands.push(inBand);

    console.log('Image:', W + 'x' + H);
    console.log('');
    console.log('Bands of baked text/lines (y range, height, peak dark count, x bounds):');
    for (const b of bands) {
      let xL = W, xR = 0;
      for (let y = b.yStart; y <= b.yEnd; y++) {
        for (let x = xMin; x < xMax; x++) {
          if (darkAt(x, y)) {
            if (x < xL) xL = x;
            if (x > xR) xR = x;
          }
        }
      }
      console.log(
        '  y=' + b.yStart + '..' + b.yEnd +
        ' (h=' + (b.yEnd - b.yStart + 1) + ') peak=' + b.peak +
        ' x=' + xL + '..' + xR + ' (w=' + (xR - xL + 1) + ')',
      );
    }
  } finally {
    await browser.close();
  }
})().catch((err) => { console.error(err); process.exit(1); });
