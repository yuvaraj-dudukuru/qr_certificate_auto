// HTML certificate template. The PNG (cert-template.png) is the canvas;
// overlays cover the placeholder positions on top of it.
//
// Calibration status: ROUGH FIRST PASS. Pixel coordinates are approximate
// guesses against a 2000x1414 canvas. Iterate in milestone 9 against the
// REAL Render container output (font rendering differs from local Chromium).
//
// Strategy: each overlay sits on an opaque white "wipe" rectangle that
// covers the corresponding baked placeholder. The body overlay covers the
// ENTIRE baked paragraph (including baked program / duration / [Start Date]
// / [End Date]) and re-renders the full body text fresh — inline date
// substitution was tried first and rejected as too fragile.

export interface CertTemplateInput {
  recipientName: string;
  bodyText: string;         // full paragraph composed by orchestrator, e.g. "has successfully completed a 3-Month Internship in Web Development at FRAYLON TEchnologies from 1 March 2026 to 31 May 2026. ..."
  issueDateLabel: string;   // e.g. "14 May 2026"
  qrPngBase64: string;      // raw base64, no data: prefix
  templatePngBase64: string;
}

export const CANVAS_WIDTH = 2000;
export const CANVAS_HEIGHT = 1414;

// Brand teal from project memory. Used for issue date so overlay colors
// visually match the baked title color.
const BRAND_TEAL_DARK = '#0E2A3A';
const BRAND_TEAL = '#1E5F7E';

// --------------------------------------------------------------------------
// Overlay rectangles. Each is an (x, y, w, h) rect in canvas pixels.
// CALIBRATE THESE against the Render container in milestone 9. Width values
// for `body` deliberately leave a small inset from the decorative border.
// --------------------------------------------------------------------------
const RECT = {
  name:      { x: 200,  y: 480,  w: 1600, h: 110 },
  body:      { x: 220,  y: 800,  w: 1560, h: 240 },
  issueDate: { x: 1340, y: 1170, w: 320,  h: 50 },
  qr:        { x: 175,  y: 1080, w: 240,  h: 240 },
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
  const bodyText = escapeHtml(input.bodyText);
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
  /* Body wipe + re-render of the full paragraph. Centered multi-line text,
     so override the .overlay flex centering with explicit line-height +
     text-align for natural paragraph wrapping. */
  .body {
    left: ${RECT.body.x}px; top: ${RECT.body.y}px;
    width: ${RECT.body.w}px; height: ${RECT.body.h}px;
    font-family: 'Inter', 'Helvetica', sans-serif;
    font-weight: 400;
    font-size: 24px;
    line-height: 1.55;
    color: ${BRAND_TEAL_DARK};
    text-align: center;
    /* Stack content top-aligned inside the wipe box. */
    align-items: flex-start;
    padding: 14px 24px;
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
    <div class="overlay body"><span>${bodyText}</span></div>
    <div class="overlay issue-date">${issueDate}</div>
    <div class="overlay qr"><img alt="" src="data:image/png;base64,${input.qrPngBase64}" /></div>
  </div>
</body>
</html>`;
}
