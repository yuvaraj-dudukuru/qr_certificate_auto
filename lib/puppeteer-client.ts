// HTTP client for the Puppeteer service. Synchronous request — caller awaits
// the PDF binary. Bearer-authed via PUPPETEER_SERVICE_TOKEN.
//
// One retry with backoff on 5xx / network failures, because Render free spins
// the container down after 15min idle and the first request after sleep can
// fail with ECONNRESET while the runtime is booting Chromium.

const REQUEST_TIMEOUT_MS = 120_000; // 2min — covers cold-start (~30-60s) + render (~3-8s)
const RETRY_DELAY_MS = 2_000;

export interface PuppeteerRenderInput {
  certNumber: string;
  recipientName: string;
  bodyText: string;
  issueDateLabel: string;
  qrPngBase64: string;
}

function readEnv(name: string): string {
  const v = process.env[name];
  if (!v || v.length === 0) throw new Error(`Missing required env: ${name}`);
  return v;
}

async function postOnce(url: string, token: string, body: PuppeteerRenderInput, signal: AbortSignal): Promise<Response> {
  return fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
    signal,
  });
}

export async function renderCertPdfViaService(input: PuppeteerRenderInput): Promise<Buffer> {
  const base = readEnv('PUPPETEER_SERVICE_URL').replace(/\/+$/, '');
  const token = readEnv('PUPPETEER_SERVICE_TOKEN');
  const url = `${base}/pdf`;

  const attempt = async (): Promise<Buffer> => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const res = await postOnce(url, token, input, controller.signal);
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`puppeteer service ${res.status}: ${text.slice(0, 500)}`);
      }
      const ct = res.headers.get('content-type') ?? '';
      if (!ct.includes('application/pdf')) {
        const text = await res.text().catch(() => '');
        throw new Error(`puppeteer service returned non-PDF (${ct}): ${text.slice(0, 200)}`);
      }
      const arr = await res.arrayBuffer();
      return Buffer.from(arr);
    } finally {
      clearTimeout(timer);
    }
  };

  try {
    return await attempt();
  } catch (firstErr) {
    // Only retry on transient errors. 4xx is a contract bug — don't retry.
    const msg = firstErr instanceof Error ? firstErr.message : String(firstErr);
    const retryable = /50\d|ECONNRESET|ETIMEDOUT|fetch failed|aborted|network/i.test(msg);
    if (!retryable) throw firstErr;
    // eslint-disable-next-line no-console
    console.warn('[puppeteer-client] retrying after transient error:', msg);
    await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
    return attempt();
  }
}
