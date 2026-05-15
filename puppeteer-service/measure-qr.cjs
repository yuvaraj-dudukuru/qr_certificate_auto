// Final pass: now that we know the QR spans x≈319-494 (width ~175),
// scan ONLY within those columns to get tight y bounds without
// contamination from the founder signature to the right.

const { promises: fs } = require('node:fs');
const path = require('node:path');
const puppeteer = require('puppeteer');

const TEMPLATE_PATH = path.resolve(__dirname, 'assets', 'cert-template.png');

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
       <img id="t" src="data:image/png;base64,${b64}" />
       </body></html>`,
      { waitUntil: 'domcontentloaded', timeout: 15_000 },
    );
    await page.evaluate(
      () => new Promise((r) => {
        const img = document.getElementById('t');
        if (img.complete) r(null); else img.onload = () => r(null);
      }),
    );

    // Tightly bound QR by:
    //  1. Find leftmost x with ≥10 dark pixels in y:1000-1250
    //  2. Find rightmost x with ≥10 dark pixels, but stop where gap >50px appears
    //  3. Find topmost y with ≥10 dark pixels in x:300-500
    //  4. Find bottommost y with ≥10 dark pixels in x:300-500
    const TH = 130;
    const PER_AXIS_MIN = 10;
    const GAP_MAX = 50;
    const res = await page.evaluate(
      ({ TH, PER_AXIS_MIN, GAP_MAX }) => {
        const img = document.getElementById('t');
        const w = img.naturalWidth;
        const h = img.naturalHeight;
        const c = document.createElement('canvas');
        c.width = w;
        c.height = h;
        const ctx = c.getContext('2d');
        ctx.drawImage(img, 0, 0);
        const data = ctx.getImageData(0, 0, w, h).data;

        function darkCountInColumn(x, yMin, yMax) {
          let n = 0;
          for (let y = yMin; y < yMax; y++) {
            const i = (y * w + x) * 4;
            const r = data[i], g = data[i + 1], b = data[i + 2];
            if (r < TH && g < TH && b < TH) n++;
          }
          return n;
        }
        function darkCountInRow(y, xMin, xMax) {
          let n = 0;
          for (let x = xMin; x < xMax; x++) {
            const i = (y * w + x) * 4;
            const r = data[i], g = data[i + 1], b = data[i + 2];
            if (r < TH && g < TH && b < TH) n++;
          }
          return n;
        }

        // Step 1: walk x from 300 upward, find first column with PER_AXIS_MIN+
        let xL = -1;
        for (let x = 280; x < 600; x++) {
          if (darkCountInColumn(x, 1000, 1250) >= PER_AXIS_MIN) { xL = x; break; }
        }
        if (xL < 0) return { error: 'no left edge' };

        // Step 2: walk x from xL upward. Track last "non-empty" x.
        // Stop when we see a continuous gap >= GAP_MAX.
        let xR = xL;
        let gapStart = -1;
        for (let x = xL + 1; x < 700; x++) {
          const cnt = darkCountInColumn(x, 1000, 1250);
          if (cnt >= 1) {
            xR = x;
            gapStart = -1;
          } else {
            if (gapStart < 0) gapStart = x;
            if (x - gapStart >= GAP_MAX) break;
          }
        }

        // Find QR top: walk y down from 950, restricted to x:xL..xR
        let yT = -1;
        for (let y = 950; y < 1300; y++) {
          if (darkCountInRow(y, xL, xR + 1) >= PER_AXIS_MIN) { yT = y; break; }
        }
        // Find QR bottom: walk y up from 1300
        let yB = -1;
        for (let y = 1300; y >= 900; y--) {
          if (darkCountInRow(y, xL, xR + 1) >= PER_AXIS_MIN) { yB = y; break; }
        }
        return { xL, xR, yT, yB };
      },
      { TH, PER_AXIS_MIN, GAP_MAX },
    );

    if (res.error) {
      console.error(res.error);
      process.exit(1);
    }
    const qr = { x: res.xL, y: res.yT, w: res.xR - res.xL + 1, h: res.yB - res.yT + 1 };
    console.log('Tight QR bounds:');
    console.log('  x:', res.xL, '..', res.xR, '(w=' + qr.w + ')');
    console.log('  y:', res.yT, '..', res.yB, '(h=' + qr.h + ')');
    console.log('  aspect ratio:', (qr.w / qr.h).toFixed(3));

    const BUFFER = 30;
    const wipe = {
      x: qr.x - BUFFER,
      y: qr.y - BUFFER,
      w: qr.w + BUFFER * 2,
      h: qr.h + BUFFER * 2,
    };
    console.log('');
    console.log('Recommended .qr wipe rect (QR bounds + 30px buffer):');
    console.log(
      '  qr: { x: ' + wipe.x + ', y: ' + wipe.y + ', w: ' + wipe.w + ', h: ' + wipe.h + ' }',
    );
  } finally {
    await browser.close();
  }
})().catch((err) => {
  console.error('unhandled:', err);
  process.exit(1);
});
