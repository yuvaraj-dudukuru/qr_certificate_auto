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
// Overlay rectangles. (x, y, w, h) in canvas pixels.
//   name:      sits on the recipient underline (~y 540 on the clean PNG)
//   body:      fills the empty white area between the recipient underline
//              and the QR / signature row (~y 600 → 820)
//   issueDate: sits on the "Date of issue" underline (bottom-right, ~y 1010)
//   qr:        covers the baked QR placeholder (bottom-left, ~x 165 y 825)
// --------------------------------------------------------------------------
const RECT = {
  name:      { x: 200, y: 430, w: 1600, h: 110 },
  body:      { x: 200, y: 600, w: 1600, h: 240 },
  issueDate: { x: 900, y: 965, w: 380,  h: 45 },
  qr:        { x: 165, y: 825, w: 215,  h: 215 },
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
     Wrap naturally as a multi-line centered block. Override .overlay's
     flex centering to allow line breaks. */
  .body {
    left: ${RECT.body.x}px; top: ${RECT.body.y}px;
    width: ${RECT.body.w}px; height: ${RECT.body.h}px;
    font-family: 'Inter', Arial, sans-serif;
    font-weight: 400;
    font-size: 22px;
    line-height: 1.5;
    color: ${BODY_GRAY};
    text-align: center;
    align-items: flex-start;
    padding: 8px 200px;       /* inset = ~10% each side → ~80% effective width */
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
    <div class="overlay body"><span>${bodyText}</span></div>
    <div class="overlay issue-date">${issueDate}</div>
    <div class="overlay qr"><img alt="" src="data:image/png;base64,${input.qrPngBase64}" /></div>
  </div>
</body>
</html>`;
}

// Tiny suppression to keep BRAND_TEAL_DARK in scope for future calibration
// adjustments (e.g. if the name color shifts back to brand teal).
void BRAND_TEAL_DARK;
