// HTML certificate template. The PNG (cert-template.png) is the canvas;
// overlays cover specific positions on top of it.
//
// The new clean template (post 2026-05-15 redesign) has placeholder text
// removed — only underlines remain for recipient name and date of issue,
// plus a baked QR placeholder square at bottom-left. So overlays no longer
// need to white-wipe the placeholder text (it isn't there). The .qr overlay
// is the only one with an opaque white background, to cover the baked QR.
//
// Calibration status: FIRST PASS against the new template. Pixel positions
// reflect rough measurements from the 2000x1414 PNG; iterate from screenshots.

export interface CertTemplateInput {
  recipientName: string;
  bodyText: string;         // full paragraph composed by orchestrator
  issueDateLabel: string;   // e.g. "15 May 2026"
  qrPngBase64: string;      // raw base64, no data: prefix
  templatePngBase64: string;
  fontFaceCss: string;      // self-hosted @font-face blocks (data: URIs)
}

export const CANVAS_WIDTH = 2000;
export const CANVAS_HEIGHT = 1414;

// Brand teal — matches the title color baked into the template.
const BRAND_TEAL_DARK = '#0E2A3A';
const BRAND_TEAL = '#1E5F7E';
const BODY_GRAY = '#3A3A3A';

// --------------------------------------------------------------------------
// Overlay rectangles. (x, y, w, h) in canvas pixels. Calibrated against
// FRY-INT-2026-00006 PDF feedback (2026-05-15):
//   name:      moved DOWN from y=430 → y=620 so it lands on the teal
//              recipient underline at canvas mid (~y 707) rather than
//              overlapping the title block at the top
//   body:      shifted DOWN to y=770 to clear the new name position;
//              fills the strip above the QR / signature row
//   issueDate: nudged DOWN ~25px so the text baseline meets the
//              "Date of issue" underline (~y 1015)
//   qr:        wipe rect ENLARGED (215×215 → 240×240) with extra L/T
//              margin to fully mask the baked QR placeholder underneath
//              (previous size left thin strips of the original QR visible)
// --------------------------------------------------------------------------
const RECT = {
  name:      { x: 200, y: 620, w: 1600, h: 110 },
  body:      { x: 200, y: 770, w: 1600, h: 200 },
  issueDate: { x: 900, y: 990, w: 380,  h: 45 },
  qr:        { x: 140, y: 810, w: 240,  h: 240 },
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
  /* Self-hosted fonts via data: URIs — see render.ts loadFontFaceCss(). */
  ${input.fontFaceCss}

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
    /* No background wipe by default — the new clean template has no baked
       placeholder text to cover (only underlines, which we want to keep
       visible). .qr re-enables a white background to mask the baked QR. */
    display: flex;
    align-items: center;
    justify-content: center;
    line-height: 1;
  }
  .name {
    left: ${RECT.name.x}px; top: ${RECT.name.y}px;
    width: ${RECT.name.w}px; height: ${RECT.name.h}px;
    font-family: 'Playfair Display', Georgia, serif;
    font-weight: 700;
    font-size: 72px;
    letter-spacing: 3px;
    color: #000;
    /* Baseline of the text sits just above the teal underline. */
    align-items: flex-end;
    padding-bottom: 6px;
  }
  /* Body paragraph — full text rendered fresh into the empty body area.
     Override .overlay's flex display: a plain block + text-align: center
     wraps natural-language paragraphs more reliably than flex inside
     headless Chromium. ~80% effective width matches the user spec. */
  .body {
    display: block;
    left: ${RECT.body.x}px; top: ${RECT.body.y}px;
    width: ${RECT.body.w}px; height: ${RECT.body.h}px;
    font-family: 'Inter', Arial, sans-serif;
    font-weight: 400;
    font-size: 22px;
    line-height: 1.5;
    color: ${BODY_GRAY};
    text-align: center;
    padding: 8px 40px;
  }
  .issue-date {
    left: ${RECT.issueDate.x}px; top: ${RECT.issueDate.y}px;
    width: ${RECT.issueDate.w}px; height: ${RECT.issueDate.h}px;
    font-family: 'Playfair Display', Georgia, serif;
    font-weight: 600;
    font-size: 28px;
    color: ${BRAND_TEAL};
    /* Sit just above the "Date of issue" underline. */
    align-items: flex-end;
    padding-bottom: 4px;
  }
  .qr {
    left: ${RECT.qr.x}px; top: ${RECT.qr.y}px;
    width: ${RECT.qr.w}px; height: ${RECT.qr.h}px;
    background: #fff;        /* wipe the baked QR placeholder beneath */
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
    <div class="overlay body">${bodyText}</div>
    <div class="overlay issue-date">${issueDate}</div>
    <div class="overlay qr"><img alt="" src="data:image/png;base64,${input.qrPngBase64}" /></div>
  </div>
</body>
</html>`;
}

// Tiny suppression to keep BRAND_TEAL_DARK in scope for future calibration
// adjustments (e.g. if the name color shifts back to brand teal).
void BRAND_TEAL_DARK;
