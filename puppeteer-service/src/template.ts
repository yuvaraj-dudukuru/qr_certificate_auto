// HTML certificate template. The PNG (cert-template.png) is the canvas;
// overlays cover the placeholder positions on top of it.
//
// Calibration status: ROUGH FIRST PASS. Pixel coordinates are approximate
// guesses against a 2000x1414 canvas. Iterate in milestone 9.
//
// All overlays sit on top of an opaque white "wipe" rectangle so the baked
// placeholder text on the template PNG is covered.

export interface CertTemplateInput {
  recipientName: string;
  startDateLabel: string;   // e.g. "1 March 2026"
  endDateLabel: string;     // e.g. "31 May 2026"
  issueDateLabel: string;   // e.g. "14 May 2026"
  qrPngBase64: string;      // raw base64, no data: prefix
  templatePngBase64: string;
}

export const CANVAS_WIDTH = 2000;
export const CANVAS_HEIGHT = 1414;

// Brand teal from project memory. Used for body & issue date so overlay
// colors visually match the baked title color.
const BRAND_TEAL_DARK = '#0E2A3A';
const BRAND_TEAL = '#1E5F7E';

// --------------------------------------------------------------------------
// Overlay rectangles. Each is an (x, y, w, h) rect in canvas pixels.
// CALIBRATE THESE against cert-template.png in milestone 9.
// --------------------------------------------------------------------------
const RECT = {
  name:      { x: 200,  y: 480, w: 1600, h: 110 },
  startDate: { x: 560,  y: 770, w: 240,  h: 36 },
  endDate:   { x: 820,  y: 770, w: 220,  h: 36 },
  issueDate: { x: 1340, y: 1170, w: 320, h: 50 },
  qr:        { x: 175,  y: 1080, w: 240, h: 240 },
} as const;

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function buildCertHtml(input: CertTemplateInput): string {
  const name = escapeHtml(input.recipientName.toUpperCase());
  const startDate = escapeHtml(input.startDateLabel);
  const endDate = escapeHtml(input.endDateLabel);
  const issueDate = escapeHtml(input.issueDateLabel);

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Fraylon Certificate</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@600;700&family=Inter:wght@400;500;600&display=swap');

  @page { size: ${CANVAS_WIDTH}px ${CANVAS_HEIGHT}px; margin: 0; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body {
    width: ${CANVAS_WIDTH}px;
    height: ${CANVAS_HEIGHT}px;
    overflow: hidden;
    background: #fff;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .canvas {
    position: relative;
    width: ${CANVAS_WIDTH}px;
    height: ${CANVAS_HEIGHT}px;
    background-image: url('data:image/png;base64,${input.templatePngBase64}');
    background-size: ${CANVAS_WIDTH}px ${CANVAS_HEIGHT}px;
    background-repeat: no-repeat;
    background-position: 0 0;
  }
  .overlay {
    position: absolute;
    background: #fff;            /* wipe baked placeholder beneath */
    display: flex;
    align-items: center;
    justify-content: center;
    line-height: 1;
    color: ${BRAND_TEAL_DARK};
  }
  .name {
    left: ${RECT.name.x}px; top: ${RECT.name.y}px;
    width: ${RECT.name.w}px; height: ${RECT.name.h}px;
    font-family: 'Playfair Display', 'Georgia', serif;
    font-weight: 700;
    font-size: 84px;
    letter-spacing: 4px;
  }
  .start-date {
    left: ${RECT.startDate.x}px; top: ${RECT.startDate.y}px;
    width: ${RECT.startDate.w}px; height: ${RECT.startDate.h}px;
    font-family: 'Inter', 'Helvetica', sans-serif;
    font-weight: 500;
    font-size: 22px;
  }
  .end-date {
    left: ${RECT.endDate.x}px; top: ${RECT.endDate.y}px;
    width: ${RECT.endDate.w}px; height: ${RECT.endDate.h}px;
    font-family: 'Inter', 'Helvetica', sans-serif;
    font-weight: 500;
    font-size: 22px;
  }
  .issue-date {
    left: ${RECT.issueDate.x}px; top: ${RECT.issueDate.y}px;
    width: ${RECT.issueDate.w}px; height: ${RECT.issueDate.h}px;
    font-family: 'Playfair Display', 'Georgia', serif;
    font-weight: 600;
    font-size: 32px;
    color: ${BRAND_TEAL};
  }
  .qr {
    left: ${RECT.qr.x}px; top: ${RECT.qr.y}px;
    width: ${RECT.qr.w}px; height: ${RECT.qr.h}px;
    background: #fff;            /* wipe placeholder QR */
    padding: 0;
  }
  .qr img {
    width: 100%; height: 100%; display: block;
    image-rendering: pixelated;
  }
</style>
</head>
<body>
  <div class="canvas">
    <div class="overlay name">${name}</div>
    <div class="overlay start-date">${startDate}</div>
    <div class="overlay end-date">${endDate}</div>
    <div class="overlay issue-date">${issueDate}</div>
    <div class="overlay qr"><img alt="" src="data:image/png;base64,${input.qrPngBase64}" /></div>
  </div>
</body>
</html>`;
}
