# Fraylon Certificate Verification

Tamper-resistant internship/training certificates for **Fraylon Technologies LLP**, with QR-resolved public verification at `verify.fraylontech.com`.

Spec lives in [`propmt.md`](./propmt.md). This README captures the locked architectural decisions and the local-dev setup.

---

## Decision Log

Architectural decisions that diverge from `propmt.md`. Recorded so future contributors know **why** the system looks the way it does.

| # | Decision | Rationale | Date |
|---|---|---|---|
| 1 | **Host Next.js on Vercel Hobby**, not Cloudflare Pages. Keep Cloudflare for DNS only (CNAME `verify.fraylontech.com` → Vercel). | Next.js 14 App Router has rough edges with `@cloudflare/next-on-pages` (server components, ISR, middleware). Vercel runs the same stack natively and is free at this scale. | 2026-05-14 |
| 2 | **Collapse `/render/cert/[certNumber]`.** The Puppeteer service bundles the HTML template + `cert-template.png` in its own image. The Next.js API POSTs `{ cert data, qrPngBase64 }` directly with a bearer token; Puppeteer renders locally and returns the PDF. | The original spec round-tripped Next.js → Puppeteer → Next.js render route → Puppeteer → Next.js. Collapsing removes two hops, deletes the `RENDER_ROUTE_TOKEN` secret + one auth surface, and removes a class of "render route hit without token" bugs. Admin debugging will live behind `/admin/preview/[certNumber]` (auth-gated) in a later PR. | 2026-05-14 |
| 3 | **Upstash Redis for rate limiting from day 1**, not an in-memory `Map`. | In-memory limiters do not work on serverless. Each Vercel cold start gets a fresh instance, so the 30-req/min acceptance criterion (`propmt.md` §15) is untestable in prod with in-memory state. Upstash free tier is 10k commands/day — plenty. | 2026-05-14 |
| 4 | **Strict HMAC payload** — no `.trim()`, no `.toLowerCase()` on `recipient_name` or `program` before signing. | The spec's normalized payload made cosmetic edits (case, whitespace) verify as untampered. We sign the exact bytes that get displayed, so any DB-side edit fails verification. Surfaces a 4th UI state — `tampered` — distinct from `revoked`. | 2026-05-14 |
| 5 | **`recipient_email` collected but unused in Phase 1.** No welcome email, no PDF auto-send, no notifications. | Explicit out-of-scope in `propmt.md` §3. Field exists so we don't have to alter-table later, but the issuer flow ignores it. A comment in the form code will mark this when the admin page lands. | 2026-05-14 |
| 6 | **Public page calls `lib/verify-cert.ts` directly, not its own `/api/verify` endpoint.** Server component does DB lookup + HMAC check + log inline. | `propmt.md` §9 implies an internal `fetch('/api/verify/...')` from the page. That's an extra HTTP hop on every QR scan with no security benefit — same code path, same Upstash bucket. Extracting to a shared lib keeps both call sites cheap and identical. | 2026-05-14 |
| 7 | **Revoked + tampered states never expose recipient name, program, or dates.** | `propmt.md` §9 is silent on the revoked state's field list, and the tampered state by definition can't trust any signed field. Leaking name/program on a revoked or tampered cert would let a fake cert still display its target identity. Revoked shows only date + reason; tampered shows only the cert ID. | 2026-05-14 |
| 8 | **Supabase URL is normalized to origin only** at the client boundary (`new URL(raw).origin`). | The Supabase dashboard exposes both the Project URL (origin) and the REST URL (`.../rest/v1`). Pasting the wrong one or leaving a trailing slash both produce a misleading `PGRST125 "Invalid path specified"`. Normalizing defensively means the env value is paste-tolerant. | 2026-05-14 |

---

## Brand palette (proposed)

| Token | Hex | Use |
|---|---|---|
| `fraylon.teal` | `#1E5F7E` | Primary accent (links, headings, valid-cert check) |
| `fraylon.teal-dark` | `#164659` | Hover states, dark surfaces |
| `fraylon.teal-light` | `#3A7E9D` | Subtle accents, focus rings |
| `fraylon.navy` | `#0F2A3A` | Header bars (works with the black-bg logo as-is) |
| `fraylon.ink` | `#0B1A24` | Body text |
| `fraylon.paper` | `#F7F7F4` | Page background |

Wired in `tailwind.config.ts`. Adjust freely.

---

## Repo layout (current — Phase 1 only)

```
qr_certificate_auto/
├── app/                       # Next.js App Router
│   ├── layout.tsx             # fonts (Inter + Playfair), html shell
│   ├── globals.css
│   └── page.tsx               # placeholder home — replaced in Phase 2 UI
├── lib/
│   ├── hmac.ts                # signCert / verifyCert (strict)
│   ├── hmac.test.ts
│   ├── cert-number.ts         # format / parse FRY-<TYPE>-YYYY-NNNNN
│   ├── cert-number.test.ts
│   ├── qr.ts                  # generateCertQr → PNG buffer + base64
│   └── qr.test.ts
├── public/
│   └── cert-template.png      # 2000×1414, all decorative elements baked in
├── supabase/
│   └── migrations/
│       └── 001_init.sql
├── .env.example               # placeholders only
├── package.json               # pnpm
├── tsconfig.json              # strict + noUncheckedIndexedAccess
├── next.config.mjs
├── tailwind.config.ts
├── postcss.config.mjs
└── propmt.md                  # full spec
```

Phase 2 will add: `app/c/[certNumber]/page.tsx` (public verify), `app/api/verify/[certNumber]/route.ts`. Phase 3 adds `puppeteer-service/`. Phase 4 adds `app/(admin)/`.

---

## Local development

### Prerequisites

- Node ≥ 20.11
- pnpm 9 (`corepack enable && corepack prepare pnpm@9 --activate`)
- A Supabase project (see below)

### 1. Install dependencies

```sh
pnpm install
```

### 2. Configure environment

```sh
cp .env.example .env.local
```

Then fill in:

- Supabase URL + anon key + service-role key — see *Supabase setup* below.
- `CERT_SIGNING_SECRET` — generate with:
  ```sh
  node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
  ```
- `IP_HASH_SALT` — generate with:
  ```sh
  node -e "console.log(require('crypto').randomBytes(16).toString('hex'))"
  ```
- Upstash creds — see *Upstash setup* below.
- Puppeteer creds + token — populate in Phase 3 when the service exists.

### 3. Run checks

```sh
pnpm typecheck   # tsc --noEmit (strict)
pnpm test        # vitest run
pnpm dev         # placeholder page on http://localhost:3000
```

---

## Supabase setup

1. **Create the project.** Go to <https://supabase.com/dashboard>, **New project**:
   - Name: `fraylon-certs` (or anything — irrelevant to code)
   - Region: closest to your users (Singapore/Mumbai for India).
   - Database password: strong, save to your password manager.
2. **Run the migration.** Open the SQL editor and paste the contents of [`supabase/migrations/001_init.sql`](./supabase/migrations/001_init.sql), then click **Run**. This creates:
   - `certificates` (with strict CHECK on `cert_type` and `status`)
   - `verification_logs` (with `'tampered'` as a valid `result`)
   - `cert_counters` + the `next_cert_seq(type, year)` function (uses `SELECT ... FOR UPDATE` — no advisory locks)
   - RLS policies (admin full access on `certificates`; service-role-only writes to `verification_logs`)
3. **Copy keys** into `.env.local`:
   - Project Settings → API → **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
   - **anon public** key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - **service_role** key → `SUPABASE_SERVICE_ROLE_KEY` *(server-only — never expose to the browser; used by the public verify endpoint to bypass RLS)*
4. **Create your admin user.** Authentication → Users → **Add user** → enter one of the allowlisted emails (`ceo@fraylontech.com` / `coo@fraylontech.com` / `cto@fraylontech.com` — these go in Vercel env, not the repo). Set a temporary password and change it on first login.
5. **Smoke test.** Insert a fixture row via the SQL editor — Phase 2 will give you a UI:
   ```sql
   insert into certificates
     (cert_number, cert_type, recipient_name, program, duration,
      start_date, end_date, issue_date, signature_hash)
   values
     ('FRY-INT-2026-00001', 'INT', 'Test Recipient', 'Web Development',
      '3-Month Internship', '2026-02-01', '2026-04-30', '2026-05-14',
      'placeholder-hash-replaced-by-real-issuer');
   ```

---

## Upstash setup

1. Sign in at <https://console.upstash.com/> (free tier, no credit card).
2. **Create database** → Redis → region close to Vercel deployment (Mumbai or Singapore).
3. Copy the REST URL + REST token from the database overview into `.env.local`:
   - `UPSTASH_REDIS_REST_URL`
   - `UPSTASH_REDIS_REST_TOKEN`
4. Used in Phase 2 (`app/api/verify/[certNumber]/route.ts`) for sliding-window rate limiting (30 req / 60 s per IP).

---

## Phase 1 acceptance

The following should all be true after `pnpm install`:

- [x] `pnpm typecheck` exits 0.
- [x] `pnpm test` runs vitest with **all tests green** (HMAC strictness, cert-number format/parse, QR PNG output, IP hash).
- [x] `pnpm dev` serves the placeholder page on port 3000.
- [x] The migration in `supabase/migrations/001_init.sql` applies cleanly to a fresh Supabase project.
- [x] `.env.example` contains no real secrets, no real admin emails.

---

## Phase 2 — public verify page + API

Adds the public verification surface — the part scanners actually see.

### New routes

| Route | Method | Purpose |
|---|---|---|
| `/c/[certNumber]` | GET | Public verify page (server component, 4 UI states). QR codes resolve here. |
| `/api/verify/[certNumber]` | GET | JSON verify endpoint. Same logic as the page, for programmatic access. |

### Response shape (`/api/verify/...`)

```jsonc
// valid → 200
{ "status": "valid", "certNumber", "recipientName", "program", "duration",
  "startDate", "endDate", "issueDate", "issuedBy" }

// revoked → 200 (informational — no recipient leak)
{ "status": "revoked", "certNumber", "revokedAt", "revokeReason" }

// tampered → 200 (critical — no field leak; signed data is untrusted)
{ "status": "tampered", "certNumber" }

// not_found → 404
{ "status": "not_found", "certNumber" }

// rate limited → 429 + Retry-After header
{ "status": "rate_limited", "retryAfter": <seconds> }
```

Headers on every response: `Cache-Control: no-store`, `X-RateLimit-Limit/Remaining/Reset`.

### State resolution order

In `lib/verify-cert.ts`:

1. Malformed cert number → `not_found` (no DB query, no log).
2. No row → `not_found`.
3. **HMAC mismatch → `tampered`** (overrides status; tamper on a signed field is a stronger signal than a clean revoke).
4. `status = revoked` → `revoked`.
5. `status = active` → `valid`.

### Rate limit

`@upstash/ratelimit` sliding window, **30 requests / 60s** per IP hash. Same bucket for the page and the API, so a scraper can't double-dip. If Upstash is unreachable, the limiter soft-fails open (logs a warning) — never causes a 5xx storm. Bucket prefix: `verify:`.

### Smoke test (local)

After `pnpm dev`, with `.env.local` populated, run:

```sh
# Should return: valid, revoked, tampered, 404
curl -s http://localhost:3000/api/verify/FRY-INT-2026-00001 | jq .status
curl -s http://localhost:3000/api/verify/FRY-INT-2026-00002 | jq .status
curl -s http://localhost:3000/api/verify/FRY-INT-2026-00003 | jq .status
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/api/verify/FRY-INT-2026-99999

# Should return: 200×N until window fills, then 429s
for i in $(seq 1 35); do curl -s -o /dev/null -w "%{http_code} " \
  http://localhost:3000/api/verify/FRY-INT-2026-00001; done; echo
```

If `tampered` is returning `not_found`, the fixture row hasn't been seeded (the migration creates tables only — fixtures come later from the admin UI in Phase 4 or via SQL). Open the page in a browser to see the four state designs.

### Phase 2 acceptance

- [x] `pnpm build` succeeds; `/c/[certNumber]` and `/api/verify/[certNumber]` are emitted as dynamic routes.
- [x] All four states render correctly (verified with seeded fixtures locally).
- [x] >30 requests/60s from one IP returns 429 from the API.
- [x] Rate-limited page renders the friendly "slow down" UI instead of crashing.
- [x] Lighthouse mobile ≥ 90 on the verify page. *(Recheck after production deploy.)*

---

## Vercel deploy

> The repo isn't a git repo yet (`git rev-parse` fails). The first two steps below initialize git and push to GitHub. Skip them if you've already done this.

### 1. Initialize the repo + push to GitHub *(once)*

```sh
git init
git add .
git status                          # sanity check — make sure .env.local is NOT staged
git commit -m "Phase 1 + Phase 2: foundation, verify API, verify page"

# Create the repo via gh CLI (or via web UI and skip the gh line)
gh repo create fraylontech/qr_certificate_auto --private --source=. --remote=origin --push
```

### 2. Connect to Vercel

1. <https://vercel.com/new> → import `fraylontech/qr_certificate_auto`.
2. **Framework preset**: Next.js (auto-detected).
3. **Build command**: leave default (`next build`).
4. **Install command**: `pnpm install --frozen-lockfile`.
5. **Root directory**: leave empty.
6. Stop before clicking "Deploy" — add env vars first.

### 3. Environment variables (Vercel project settings → Environment Variables)

Mark all **Production + Preview**. *Do not* commit any of these to the repo.

| Name | Source |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Project Settings → API → **Project URL** *(origin only — no `/rest/v1`, no trailing slash; the code defensively normalizes but keep the env clean)* |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → API → **anon public** key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → API → **service_role** key *(server-only — Vercel must mark this as **not** exposed to the browser; double-check it's not prefixed `NEXT_PUBLIC_`)* |
| `ADMIN_EMAIL_ALLOWLIST` | `ceo@fraylontech.com,coo@fraylontech.com,cto@fraylontech.com` *(Phase 4 — can leave blank for now)* |
| `CERT_SIGNING_SECRET` | The 64-hex value already in `.env.local` |
| `IP_HASH_SALT` | The 32-hex value already in `.env.local` |
| `UPSTASH_REDIS_REST_URL` | Upstash console → database overview |
| `UPSTASH_REDIS_REST_TOKEN` | Upstash console → database overview |
| `NEXT_PUBLIC_VERIFY_BASE_URL` | `https://verify.fraylontech.com` |
| `PUPPETEER_SERVICE_URL` / `PUPPETEER_SERVICE_TOKEN` | Leave blank until Phase 3. |

### 4. First deploy

Click **Deploy**. Once the build finishes, Vercel gives a `*.vercel.app` URL. Test:

- `https://<vercel-url>/c/FRY-INT-2026-00001` — should show the **valid** state for a seeded fixture.
- `https://<vercel-url>/c/FRY-INT-2026-99999` — should show **not_found**.

### 5. Custom domain (`verify.fraylontech.com`)

1. **Vercel** → Project → Settings → Domains → **Add** `verify.fraylontech.com`. Vercel will print a CNAME target — note it down (typically `cname.vercel-dns.com`).
2. **Cloudflare** → `fraylontech.com` DNS → **Add record**:
   - Type: `CNAME`
   - Name: `verify`
   - Target: the Vercel CNAME from step 1
   - Proxy status: **DNS only** (gray cloud, not orange). Vercel handles its own TLS — proxying through Cloudflare's orange-cloud TLS conflicts with Vercel's HTTPS provisioning.
3. Back in Vercel, wait for the domain row to show ✓ (usually 1–5 min after DNS propagates). Vercel auto-provisions a Let's Encrypt cert.
4. Test:
   ```sh
   curl -s https://verify.fraylontech.com/api/verify/FRY-INT-2026-00001 | jq .status
   ```

### 6. Post-deploy checklist

- [ ] Page loads at `https://verify.fraylontech.com/c/FRY-INT-2026-00001`.
- [ ] HTTPS cert is valid (not Cloudflare's — should be Let's Encrypt via Vercel).
- [ ] Production Lighthouse mobile run ≥ 90 on a fixture cert.
- [ ] `SUPABASE_SERVICE_ROLE_KEY` is NOT visible in browser devtools network/source.
- [ ] Trying the rate limit (>30 req/min) returns 429s in prod.
- [ ] Verification logs are landing in Supabase (`select count(*) from verification_logs` in SQL editor).
