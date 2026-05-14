import express, { type NextFunction, type Request, type Response } from 'express';
import { z } from 'zod';
import { getBrowser, renderCertPdf, shutdownBrowser } from './render';

const PORT = Number(process.env.PORT ?? 8787);
const TOKEN = process.env.PUPPETEER_SERVICE_TOKEN;
const MAX_BODY = '6mb'; // QR base64 ~300KB, template not sent — 6mb is generous

if (!TOKEN || TOKEN.length < 16) {
  // Crash early. A misconfigured token = anyone on the internet renders certs.
  console.error('FATAL: PUPPETEER_SERVICE_TOKEN missing or too short (need ≥16 chars).');
  process.exit(1);
}

const renderBodySchema = z.object({
  certNumber: z.string().min(1).max(64),
  recipientName: z.string().min(1).max(200),
  startDateLabel: z.string().min(1).max(64),
  endDateLabel: z.string().min(1).max(64),
  issueDateLabel: z.string().min(1).max(64),
  qrPngBase64: z.string().min(64).max(2_000_000), // bound it; ~250KB base64 is typical
});

function bearerAuth(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    res.status(401).json({ error: 'missing bearer token' });
    return;
  }
  const provided = header.slice('Bearer '.length).trim();
  // Constant-time compare to avoid timing attacks on the shared token.
  if (provided.length !== TOKEN!.length) {
    res.status(401).json({ error: 'invalid token' });
    return;
  }
  let diff = 0;
  for (let i = 0; i < provided.length; i++) {
    diff |= provided.charCodeAt(i) ^ TOKEN!.charCodeAt(i);
  }
  if (diff !== 0) {
    res.status(401).json({ error: 'invalid token' });
    return;
  }
  next();
}

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: MAX_BODY }));

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'fraylon-puppeteer', ts: new Date().toISOString() });
});

app.post('/pdf', bearerAuth, async (req, res) => {
  const parsed = renderBodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'invalid body', issues: parsed.error.issues });
    return;
  }
  const { certNumber, ...rest } = parsed.data;
  const started = Date.now();
  try {
    const pdf = await renderCertPdf(rest);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${certNumber}.pdf"`);
    res.setHeader('X-Render-Ms', String(Date.now() - started));
    res.status(200).send(pdf);
  } catch (err) {
    console.error('[render] failed:', err);
    res.status(500).json({ error: 'render failed' });
  }
});

// Warm the browser at boot so the first request isn't slowed by Chromium
// launch. On Render free, the container is already cold when it boots, so
// this is just shifting the latency from first-render to deploy-ready time.
getBrowser()
  .then(() => console.log('[boot] chromium warmed'))
  .catch((err) => console.error('[boot] chromium warm failed (will retry per request):', err));

const server = app.listen(PORT, () => {
  console.log(`[boot] fraylon-puppeteer listening on :${PORT}`);
});

function shutdown(signal: string): void {
  console.log(`[shutdown] received ${signal}`);
  server.close(() => {
    shutdownBrowser()
      .catch((err) => console.error('[shutdown] browser close failed:', err))
      .finally(() => process.exit(0));
  });
  // Force-exit after 10s if graceful shutdown stalls (Render send SIGTERM
  // then SIGKILL 10s later anyway).
  setTimeout(() => process.exit(0), 9_000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
