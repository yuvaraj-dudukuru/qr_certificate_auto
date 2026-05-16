import { promises as fs } from 'node:fs';
import path from 'node:path';
import puppeteer, { type Browser, type LaunchOptions } from 'puppeteer';
import { buildCertHtml, CANVAS_WIDTH, CANVAS_HEIGHT } from './template';

// Resolve assets inside the container. Copied from the source repo at
// docker build time (see Dockerfile `COPY assets ./assets`). We base64-inline
// everything into the HTML so Chromium does zero network/disk I/O during
// page load — that's the only reliable way to keep page.setContent under a
// hard timeout on a cold Render container.
const ASSETS_DIR = path.join(__dirname, '..', 'assets');
const TEMPLATE_PATH = path.join(ASSETS_DIR, 'cert-template.png');

interface FontFile {
  family: string;
  weight: number;
  file: string;
}

// Self-hosted subset of the Google Fonts used by the template. Only the weights
// referenced by template.ts — Playfair Display 600 / 700, Inter 400. Sourced
// from @fontsource via jsdelivr at commit time and checked into the repo so
// Render never has to hit the public internet at render time.
const FONT_FILES: readonly FontFile[] = [
  { family: 'Inter',             weight: 400, file: 'inter-latin-400.woff2' },
  { family: 'Playfair Display',  weight: 400, file: 'playfair-latin-400.woff2' },
  { family: 'Playfair Display',  weight: 600, file: 'playfair-latin-600.woff2' },
  { family: 'Playfair Display',  weight: 700, file: 'playfair-latin-700.woff2' },
];

let templateBase64Cache: string | null = null;
async function loadTemplateBase64(): Promise<string> {
  if (templateBase64Cache) return templateBase64Cache;
  const buf = await fs.readFile(TEMPLATE_PATH);
  templateBase64Cache = buf.toString('base64');
  return templateBase64Cache;
}

let fontFaceCssCache: string | null = null;
async function loadFontFaceCss(): Promise<string> {
  if (fontFaceCssCache) return fontFaceCssCache;
  const blocks: string[] = [];
  for (const f of FONT_FILES) {
    const buf = await fs.readFile(path.join(ASSETS_DIR, 'fonts', f.file));
    const b64 = buf.toString('base64');
    // font-display: block — wait for the woff2 to swap in (it's already
    // inline, so this is effectively instant). Avoids FOUT briefly showing
    // the system fallback before the PDF is captured.
    blocks.push(
      `@font-face { ` +
        `font-family: '${f.family}'; ` +
        `font-style: normal; ` +
        `font-weight: ${f.weight}; ` +
        `font-display: block; ` +
        `src: url(data:font/woff2;base64,${b64}) format('woff2'); ` +
        `}`,
    );
  }
  fontFaceCssCache = blocks.join('\n');
  return fontFaceCssCache;
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
  const [templatePngBase64, fontFaceCss] = await Promise.all([
    loadTemplateBase64(),
    loadFontFaceCss(),
  ]);
  const html = buildCertHtml({ ...input, templatePngBase64, fontFaceCss });

  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.setViewport({
      width: CANVAS_WIDTH,
      height: CANVAS_HEIGHT,
      deviceScaleFactor: 1,
    });
    // domcontentloaded + zero external assets = setContent returns in <1s.
    // networkidle0 was the previous setting, but with @import to Google
    // Fonts a flaky CDN response left it hanging past the 15s timeout. All
    // assets (template PNG, QR, fonts) are now inline, so there's nothing
    // to wait for past DOM parse.
    await page.setContent(html, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    // Belt-and-braces: ensure font swap completes before PDF capture. With
    // data: URI fonts this resolves immediately, but the API call is cheap.
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
