// Programmatic measurement of all overlay landmarks in cert-template.png.
//
// Detects:
//   1. Recipient name underline (long horizontal teal line, upper-mid)
//   2. Date of issue underline (short horizontal line, bottom-right)
//   3. Baked QR placeholder bounds (bottom-left)
//   4. Derived body strip (the empty area between recipient underline
//      and the QR/signature row)
//
// Reports recommended RECT values directly usable in template.ts.

const { promises: fs } = require('node:fs');
const path = require('node:path');
const puppeteer = require('puppeteer');

const TEMPLATE_PATH = path.resolve(__dirname, 'assets', 'cert-template.png');
const TH = 130;                  // dark-pixel threshold (RGB all < TH)
const UNDERLINE_MIN_RUN_LONG = 600;  // recipient underline: ≥600px contiguous dark
const UNDERLINE_MIN_RUN_SHORT = 150; // date underline: ≥150px contiguous dark
const QR_DENSE_COL_MIN = 50;     // dense column = ≥50 dark pixels in QR y range
const QR_MIN_RUN_COLS = 100;     // QR must be at least 100 dense columns wide

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

    // --- Bulk pixel data ----------------------------------------------------
    const meta = await page.evaluate(() => {
      const img = document.getElementById('t');
      return { w: img.naturalWidth, h: img.naturalHeight };
    });
    const W = meta.w;
    const H = meta.h;

    // --- Horizontal-line detection -----------------------------------------
    // For each row, find the longest contiguous run of dark pixels.
    const rowRuns = await page.evaluate(({ TH, w, h }) => {
      const img = document.getElementById('t');
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      const ctx = c.getContext('2d');
      ctx.drawImage(img, 0, 0);
      const data = ctx.getImageData(0, 0, w, h).data;
      const out = new Array(h);
      for (let y = 0; y < h; y++) {
        let maxLen = 0, maxStart = -1, maxEnd = -1;
        let curLen = 0, curStart = -1;
        const rowOff = y * w * 4;
        for (let x = 0; x < w; x++) {
          const i = rowOff + x * 4;
          if (data[i] < TH && data[i + 1] < TH && data[i + 2] < TH) {
            if (curStart < 0) curStart = x;
            curLen++;
          } else {
            if (curLen > maxLen) {
              maxLen = curLen;
              maxStart = curStart;
              maxEnd = x - 1;
            }
            curLen = 0; curStart = -1;
          }
        }
        if (curLen > maxLen) {
          maxLen = curLen;
          maxStart = curStart;
          maxEnd = w - 1;
        }
        out[y] = { len: maxLen, start: maxStart, end: maxEnd };
      }
      return out;
    }, { TH, w: W, h: H });

    // Group consecutive rows with long runs into "underline bands".
    // Skip the very top/bottom 50px (decorative border).
    function findLineBands(minRunLen, ySearchMin, ySearchMax) {
      const bands = [];
      let band = null;
      for (let y = ySearchMin; y < ySearchMax; y++) {
        const row = rowRuns[y];
        if (row.len >= minRunLen) {
          if (!band) {
            band = { yStart: y, yEnd: y, xStart: row.start, xEnd: row.end, maxLen: row.len };
          } else {
            band.yEnd = y;
            if (row.len > band.maxLen) {
              band.maxLen = row.len;
              band.xStart = row.start;
              band.xEnd = row.end;
            }
          }
        } else if (band) {
          bands.push(band);
          band = null;
        }
      }
      if (band) bands.push(band);
      return bands;
    }

    // Recipient underline: long line (>600px) in the upper half (y in [300,800]).
    // Exclude rows that are the decorative border (clusters near edges).
    const recipientBands = findLineBands(UNDERLINE_MIN_RUN_LONG, 300, 850);
    // Pick the band closest to vertical mid (y≈707), preferring narrow bands
    // (a few rows tall, not 50+ rows of decorative pattern).
    const recipientCandidates = recipientBands
      .map((b) => ({ ...b, thickness: b.yEnd - b.yStart + 1 }))
      .filter((b) => b.thickness <= 20)
      .sort((a, b) => Math.abs((a.yStart + a.yEnd) / 2 - 707) - Math.abs((b.yStart + b.yEnd) / 2 - 707));
    const recipient = recipientCandidates[0] || null;

    // Date underline: shorter line (>150px) in bottom half (y in [900, 1200]),
    // narrow thickness, in the right portion of the canvas (xStart > 800).
    const dateBands = findLineBands(UNDERLINE_MIN_RUN_SHORT, 900, 1200)
      .map((b) => ({ ...b, thickness: b.yEnd - b.yStart + 1 }))
      .filter((b) => b.thickness <= 12 && b.xStart > 800 && (b.xEnd - b.xStart + 1) < 600);
    // Closest to the expected date-of-issue underline area
    const date = dateBands.sort((a, b) =>
      Math.abs((a.yStart + a.yEnd) / 2 - 1010) - Math.abs((b.yStart + b.yEnd) / 2 - 1010),
    )[0] || null;

    // --- QR bounds (dense-column method, x:200-700 y:900-1300) -------------
    const qr = await (async () => {
      const PER_AXIS_MIN = 10;
      const result = await page.evaluate(
        ({ TH, w, h, PER_AXIS_MIN }) => {
          const img = document.getElementById('t');
          const c = document.createElement('canvas');
          c.width = w; c.height = h;
          const ctx = c.getContext('2d');
          ctx.drawImage(img, 0, 0);
          const data = ctx.getImageData(0, 0, w, h).data;
          function darkInCol(x, yMin, yMax) {
            let n = 0;
            for (let y = yMin; y < yMax; y++) {
              const i = (y * w + x) * 4;
              if (data[i] < TH && data[i + 1] < TH && data[i + 2] < TH) n++;
            }
            return n;
          }
          function darkInRow(y, xMin, xMax) {
            let n = 0;
            for (let x = xMin; x < xMax; x++) {
              const i = (y * w + x) * 4;
              if (data[i] < TH && data[i + 1] < TH && data[i + 2] < TH) n++;
            }
            return n;
          }
          let xL = -1;
          for (let x = 280; x < 600; x++) {
            if (darkInCol(x, 1000, 1250) >= PER_AXIS_MIN) { xL = x; break; }
          }
          if (xL < 0) return null;
          let xR = xL, gapStart = -1;
          for (let x = xL + 1; x < 700; x++) {
            const cnt = darkInCol(x, 1000, 1250);
            if (cnt >= 1) { xR = x; gapStart = -1; }
            else {
              if (gapStart < 0) gapStart = x;
              if (x - gapStart >= 50) break;
            }
          }
          let yT = -1, yB = -1;
          for (let y = 950; y < 1300; y++) {
            if (darkInRow(y, xL, xR + 1) >= PER_AXIS_MIN) { yT = y; break; }
          }
          for (let y = 1300; y >= 900; y--) {
            if (darkInRow(y, xL, xR + 1) >= PER_AXIS_MIN) { yB = y; break; }
          }
          return { xL, xR, yT, yB };
        },
        { TH, w: W, h: H, PER_AXIS_MIN },
      );
      return result;
    })();

    // --- Report ------------------------------------------------------------
    console.log('Image:', W + 'x' + H, '(canvas)\n');

    if (recipient) {
      const yMid = Math.round((recipient.yStart + recipient.yEnd) / 2);
      console.log('Recipient underline:');
      console.log('  y range :', recipient.yStart, '..', recipient.yEnd, '(thickness ' + recipient.thickness + 'px)');
      console.log('  y center:', yMid);
      console.log('  x range :', recipient.xStart, '..', recipient.xEnd, '(width ' + recipient.maxLen + ')');
    } else {
      console.log('Recipient underline: NOT FOUND');
    }
    console.log('');

    if (date) {
      const yMid = Math.round((date.yStart + date.yEnd) / 2);
      console.log('Date of issue underline:');
      console.log('  y range :', date.yStart, '..', date.yEnd, '(thickness ' + date.thickness + 'px)');
      console.log('  y center:', yMid);
      console.log('  x range :', date.xStart, '..', date.xEnd, '(width ' + date.maxLen + ')');
    } else {
      console.log('Date of issue underline: NOT FOUND');
    }
    console.log('');

    if (qr) {
      console.log('Baked QR placeholder:');
      console.log('  x:', qr.xL, '..', qr.xR, '(w=' + (qr.xR - qr.xL + 1) + ')');
      console.log('  y:', qr.yT, '..', qr.yB, '(h=' + (qr.yB - qr.yT + 1) + ')');
    } else {
      console.log('Baked QR: NOT FOUND');
    }
    console.log('');

    // --- Derived RECT recommendations --------------------------------------
    if (!recipient || !date || !qr) {
      console.error('Cannot derive RECT — missing landmark(s).');
      process.exit(1);
    }

    // Name overlay: text baseline should sit AT the recipient underline.
    // With CSS align-items: flex-end + padding-bottom: 6px and font-size
    // 72px, text baseline ≈ box bottom - 6 - descender(~15) → ≈ box bottom - 21.
    // So box bottom = underline_y + 21 (allow descender to extend below
    // the line by ~15px, with 6px padding). Box height we keep at 110.
    const recipUnderlineY = Math.round((recipient.yStart + recipient.yEnd) / 2);
    const nameH = 110;
    const nameY = recipUnderlineY + 21 - nameH;

    // Date overlay: same logic, smaller font (28-32px), descender ~12.
    const dateUnderlineY = Math.round((date.yStart + date.yEnd) / 2);
    const dateH = 45;
    const dateY = dateUnderlineY + 15 - dateH;
    // Width = date underline width + small buffer; centered on underline.
    const dateW = (date.xEnd - date.xStart + 1) + 40;
    const dateX = Math.max(0, Math.round((date.xStart + date.xEnd) / 2) - Math.floor(dateW / 2));

    // QR wipe: tight bounds + 30px buffer.
    const qrBuffer = 30;
    const qrX = qr.xL - qrBuffer;
    const qrY = qr.yT - qrBuffer;
    const qrW = (qr.xR - qr.xL + 1) + qrBuffer * 2;
    const qrH = (qr.yB - qr.yT + 1) + qrBuffer * 2;

    // Body strip: between (name box bottom) and (QR top), inset 10px each side.
    const bodyY = nameY + nameH + 10;
    const bodyH = (qr.yT - 30) - bodyY;  // leave 30px gap above QR
    const bodyX = 200;
    const bodyW = W - 2 * bodyX;

    console.log('=== Recommended RECT values for template.ts ===');
    console.log('const RECT = {');
    console.log('  name:      { x: 200, y: ' + nameY + ',  w: 1600, h: ' + nameH + ' },');
    console.log('  body:      { x: ' + bodyX + ', y: ' + bodyY + ',  w: ' + bodyW + ', h: ' + bodyH + ' },');
    console.log('  issueDate: { x: ' + dateX + ', y: ' + dateY + ', w: ' + dateW + ',  h: ' + dateH + ' },');
    console.log('  qr:        { x: ' + qrX + ', y: ' + qrY + ', w: ' + qrW + ',  h: ' + qrH + ' },');
    console.log('} as const;');
    console.log('');
    console.log('Sanity checks:');
    console.log('  name text baseline target:', recipUnderlineY, '(recipient underline center)');
    console.log('  body strip: y =', bodyY, '..', (bodyY + bodyH), '(height ' + bodyH + 'px, room for ~' + Math.floor(bodyH / 33) + ' lines at 22px/1.5lh)');
    console.log('  qr wipe vs measured QR: wipe ' + qrW + 'x' + qrH + ', QR ' + (qr.xR - qr.xL + 1) + 'x' + (qr.yB - qr.yT + 1) + ', buffer ' + qrBuffer + 'px each side');
  } finally {
    await browser.close();
  }
})().catch((err) => {
  console.error('unhandled:', err);
  process.exit(1);
});
