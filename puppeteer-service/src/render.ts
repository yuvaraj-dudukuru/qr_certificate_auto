import { promises as fs } from 'node:fs';
import path from 'node:path';
import puppeteer, { type Browser, type LaunchOptions } from 'puppeteer';
import { buildCertHtml, CANVAS_WIDTH, CANVAS_HEIGHT } from './template';

// Resolve the template PNG inside the container. Copied from public/ at build
// time (see Dockerfile). We base64-inline it into the HTML so Chromium never
// has to hit the filesystem during page load.
const TEMPLATE_PATH = path.join(__dirname, '..', 'assets', 'cert-template.png');

let templateBase64Cache: string | null = null;
async function loadTemplateBase64(): Promise<string> {
  if (templateBase64Cache) return templateBase64Cache;
  const buf = await fs.readFile(TEMPLATE_PATH);
  templateBase64Cache = buf.toString('base64');
  return templateBase64Cache;
}

let browserPromise: Promise<Browser> | null = null;

function launchOptions(): LaunchOptions {
  // Render runs us as a non-root user inside a Linux container. The default
  // sandboxing path needs additional kernel features that aren't always
  // available there; --no-sandbox is the standard escape hatch for
  // server-side Puppeteer behind bearer auth. We are the only caller.
  return {
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--font-render-hinting=none',
    ],
  };
}

export async function getBrowser(): Promise<Browser> {
  if (!browserPromise) {
    browserPromise = puppeteer.launch(launchOptions());
  }
  return browserPromise;
}

export async function shutdownBrowser(): Promise<void> {
  const p = browserPromise;
  browserPromise = null;
  if (p) {
    const b = await p;
    await b.close();
  }
}

export interface RenderInput {
  recipientName: string;
  bodyText: string;
  issueDateLabel: string;
  qrPngBase64: string;
}

export async function renderCertPdf(input: RenderInput): Promise<Buffer> {
  const templatePngBase64 = await loadTemplateBase64();
  const html = buildCertHtml({ ...input, templatePngBase64 });

  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.setViewport({
      width: CANVAS_WIDTH,
      height: CANVAS_HEIGHT,
      deviceScaleFactor: 1,
    });
    await page.setContent(html, { waitUntil: 'networkidle0', timeout: 15_000 });
    // Belt-and-braces: ensure Google Fonts are actually swapped in before
    // print. networkidle0 alone can miss late font-display swaps.
    // String form avoids needing DOM lib types in this Node tsconfig.
    await page.evaluate('document.fonts && document.fonts.ready');

    const pdf = await page.pdf({
      width: `${CANVAS_WIDTH}px`,
      height: `${CANVAS_HEIGHT}px`,
      printBackground: true,
      margin: { top: 0, right: 0, bottom: 0, left: 0 },
      preferCSSPageSize: true,
    });
    return Buffer.from(pdf);
  } finally {
    await page.close();
  }
}
