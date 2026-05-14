# fraylon-puppeteer

Self-contained PDF render service for Fraylon certificates. Receives cert data
+ a pre-rendered QR PNG, returns the signed certificate as a PDF.

## Contract

```
POST /pdf
Authorization: Bearer <PUPPETEER_SERVICE_TOKEN>
Content-Type: application/json

{
  "certNumber":       "FRY-INT-2026-00004",
  "recipientName":    "Test Intern",
  "startDateLabel":   "1 March 2026",
  "endDateLabel":     "31 May 2026",
  "issueDateLabel":   "14 May 2026",
  "qrPngBase64":      "iVBORw0KGgoAAAA..."
}
→ 200 application/pdf  (binary)
→ 401 invalid/missing bearer
→ 400 invalid body
→ 500 render failed
```

```
GET /health → 200 { status: "ok", ... }
```

## Env

| Var | Required | Notes |
|---|---|---|
| `PUPPETEER_SERVICE_TOKEN` | yes | shared secret with the Next.js issuer, ≥16 chars |
| `PORT` | no | default `8787` |

## Local

```bash
docker build -t fraylon-puppeteer .
docker run --rm -p 8787:8787 -e PUPPETEER_SERVICE_TOKEN=local-dev-token-min-16ch fraylon-puppeteer
curl http://localhost:8787/health
```

## What lives in the image

- `assets/cert-template.png` — baked-in cert background (copied from `../public/cert-template.png` at git-commit time)
- `dist/` — compiled JS from `src/`
- Chromium via apt; Puppeteer uses `PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium`. The npm-bundled Chromium is **not** downloaded (saves ~300MB).

## What does NOT live here

- QR generation: handled by `lib/qr.ts` in the Next.js app. The service receives `qrPngBase64`.
- Cert data validation / DB writes: handled by `app/api/issue` in the Next.js app.
- Auth: bearer token only. No Supabase, no users.
