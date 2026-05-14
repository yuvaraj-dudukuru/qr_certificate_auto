# Claude Code Prompt — Fraylon Certificate Verification System

## 0. Role & Context

You are building a **certificate issuance and verification system** for **Fraylon Technologies LLP** (Hyderabad, India). I am the COO. The system will issue tamper-resistant internship/training certificates with a QR code that resolves to a public verification page at `verify.fraylontech.com`.

The certificate template is **already designed** and is provided as `cert-template.png` in the repo. **Do not redesign it.** Use it as a background image and overlay only the variable fields on top.

This is a real production system. Read these instructions end-to-end before writing any code. Ask me questions before making any assumption that isn't covered below.

---

## 1. Objective

Build a Next.js application that:

1. Lets an admin (me) issue a certificate by filling a form → stores record in Postgres → generates a PDF that matches the Fraylon template with the recipient's data and a QR code overlaid → returns the PDF for download.
2. Hosts a public verification page at `verify.fraylontech.com/c/<cert_number>` that looks up the certificate and displays its validity, recipient name, program, and issue date.
3. Supports revocation and basic audit logging.

---

## 2. Tech Stack (fixed — do not substitute)

| Layer | Tool |
|---|---|
| Framework | Next.js 14+ (App Router, TypeScript) |
| Database | Supabase Postgres (free tier) |
| Auth (admin only) | Supabase Auth — email + password |
| PDF generation | Puppeteer (headless Chromium) rendering an internal HTML route |
| QR generation | `qrcode` npm package (PNG, error correction level H) |
| Styling | Tailwind CSS |
| Hosting | Cloudflare Pages (frontend) + a small Node server on Railway or Render for the Puppeteer PDF endpoint (Cloudflare Pages can't run Puppeteer) |
| DNS | Cloudflare (subdomain `verify.fraylontech.com`) |

If you genuinely cannot run Puppeteer in the chosen hosting and have a better proposal (e.g., `@react-pdf/renderer` with the PNG embedded as image), stop and ask me before switching.

---

## 3. Out of Scope (do NOT build)

- Bulk CSV upload (Phase 2, not now)
- Email delivery to recipients
- Multiple admin roles / RBAC
- Public-facing marketing pages
- Mobile app
- Internationalization
- Any design changes to the certificate template

---

## 4. Repository Structure

```
fraylon-certs/
├── app/
│   ├── (admin)/
│   │   ├── login/page.tsx
│   │   ├── dashboard/page.tsx
│   │   └── issue/page.tsx
│   ├── c/
│   │   └── [certNumber]/page.tsx          # Public verification page
│   ├── api/
│   │   ├── certificates/
│   │   │   ├── route.ts                    # POST create, GET list (admin)
│   │   │   └── [certNumber]/
│   │   │       ├── route.ts                # GET single, PATCH revoke
│   │   │       └── pdf/route.ts            # GET PDF (proxies to Puppeteer service)
│   │   └── verify/[certNumber]/route.ts    # Public verify endpoint
│   └── render/
│       └── cert/[certNumber]/page.tsx      # Internal-only HTML cert page Puppeteer screenshots
├── lib/
│   ├── supabase/server.ts
│   ├── supabase/client.ts
│   ├── hmac.ts                             # signature compute + verify
│   ├── cert-number.ts                      # generate FRY-INT-YYYY-NNNNN
│   └── qr.ts
├── public/
│   ├── cert-template.png                   # provided
│   ├── fraylon-logo.png                    # ask user to provide
│   ├── dpiit-badge.png                     # ask user to provide
│   ├── signature.png                       # ask user to provide
│   └── stamp.png                           # ask user to provide
├── puppeteer-service/                       # separate deployable
│   ├── server.ts
│   ├── package.json
│   └── Dockerfile
├── supabase/
│   └── migrations/
│       └── 001_init.sql
├── .env.example
└── README.md
```

---

## 5. Database Schema

```sql
-- supabase/migrations/001_init.sql

create extension if not exists "pgcrypto";

create table certificates (
  id              uuid primary key default gen_random_uuid(),
  cert_number     text unique not null,         -- e.g. FRY-INT-2026-00042
  recipient_name  text not null,
  recipient_email text,
  program         text not null,                -- e.g. "Web Development"
  duration        text not null,                -- e.g. "3-Month Internship"
  start_date      date not null,
  end_date        date not null,
  issue_date      date not null default current_date,
  issued_by       text not null default 'Fraylon Technologies LLP',
  signature_hash  text not null,                -- HMAC-SHA256
  status          text not null default 'active' check (status in ('active','revoked')),
  revoke_reason   text,
  revoked_at      timestamptz,
  metadata        jsonb default '{}'::jsonb,
  created_at      timestamptz default now(),
  created_by      uuid references auth.users(id)
);

create index idx_certificates_cert_number on certificates (cert_number);
create index idx_certificates_status on certificates (status);

create table verification_logs (
  id          bigserial primary key,
  cert_number text not null,
  ip_hash     text,                              -- sha256 of IP, not raw IP
  user_agent  text,
  result      text not null,                     -- 'valid' | 'not_found' | 'revoked'
  verified_at timestamptz default now()
);

create index idx_verification_logs_cert on verification_logs (cert_number);

-- RLS
alter table certificates enable row level security;
alter table verification_logs enable row level security;

-- Admins (authenticated users) can do everything
create policy "admin full access" on certificates
  for all using (auth.role() = 'authenticated');

-- Public verification reads happen via service role from the API route, not directly
create policy "service role inserts logs" on verification_logs
  for insert with check (true);
```

---

## 6. Cert Number Format

`FRY-<TYPE>-<YEAR>-<5-digit-seq>`

- `TYPE`: `INT` (internship), `WRK` (workshop), `CRS` (course). Pick from form.
- Year: 4-digit issue year.
- Sequence: zero-padded 5 digits, monotonic per (type, year). Use a Postgres function or a separate `cert_counters` table to ensure no collisions.

Example: `FRY-INT-2026-00042`

---

## 7. HMAC Signature

```ts
// lib/hmac.ts
import { createHmac } from 'crypto';

export function signCert(input: {
  certNumber: string;
  recipientName: string;
  program: string;
  startDate: string;
  endDate: string;
  issueDate: string;
}): string {
  const payload = [
    input.certNumber,
    input.recipientName.trim().toLowerCase(),
    input.program.trim().toLowerCase(),
    input.startDate,
    input.endDate,
    input.issueDate,
  ].join('|');
  return createHmac('sha256', process.env.CERT_SIGNING_SECRET!)
    .update(payload)
    .digest('hex');
}
```

Stored in `signature_hash`. Recomputed at verification time. Mismatch → return tampered. `CERT_SIGNING_SECRET` must be a 32-byte random hex string set in env, never committed.

---

## 8. The Certificate PDF — Critical Section

### Approach
**Do NOT recreate the certificate design in HTML/CSS.** Use the provided `cert-template.png` as a background. Overlay only the variable fields.

### Steps
1. Create an internal-only Next.js route `/render/cert/[certNumber]` that returns a fully-rendered HTML page sized **exactly 2000 × 1414 pixels** (the template aspect ratio — adjust if your PNG dimensions differ; treat the PNG's intrinsic pixel size as the canvas).
2. The page body has `cert-template.png` as a `<img>` element absolutely positioned at `top: 0; left: 0; width: 100%; height: 100%;`.
3. Overlay these elements as absolutely-positioned `<div>`s on top of the image:

| Field | Approximate position | Style notes |
|---|---|---|
| Recipient name | Centered horizontally, vertically aligned with the underline beneath "STUDENT NAME" placeholder | Serif font (Playfair Display or similar), ~72px, black, uppercase, letter-spacing slight |
| Body text (program + start date + end date) | Replaces the `[Start Date]` and `[End Date]` placeholders in the existing body paragraph | Match the body text style of the template; sans-serif ~22px |
| Date of issue | Where "14th May 2026" sits on the template | Same teal color as template (~`#1E5F7E`); serif ~28px |
| QR code | Bottom-left, sized to fit the existing QR placeholder square in the template | PNG, no margin/border; size to match placeholder |

You will need to **iterate** on exact pixel positions. After the first render, screenshot the PDF, compare to the template, adjust the CSS `top`/`left`/`font-size` values, repeat until it visually matches. Do not ship until it matches the template.

### QR contents
The QR encodes exactly one URL:
```
https://verify.fraylontech.com/c/<cert_number>
```
No extra params. Error correction level `H` (so it survives the cert being printed and re-scanned).

### Puppeteer service
- Runs on a separate small Node service (Railway/Render) because Cloudflare Pages can't run Chromium.
- Endpoint: `POST /pdf` with `{ certNumber, secret }` where `secret` is a shared bearer token between Next.js and the Puppeteer service.
- Service flow:
  1. Validate bearer.
  2. Launch Chromium, navigate to `https://verify.fraylontech.com/render/cert/<certNumber>?token=<one-time-token>` (the `/render/` route is protected by this one-time token, generated by Next.js and passed to Puppeteer).
  3. `page.pdf({ format: 'A4', landscape: true, printBackground: true, preferCSSPageSize: true })` — but use the canvas dimensions, not A4, by setting a custom `width`/`height` in pixels matching the template.
  4. Return the PDF binary.
- Cache: optional. Don't bother in Phase 1.

---

## 9. Public Verification Page

Route: `app/c/[certNumber]/page.tsx`

Server component. On load:
1. Fetch from `/api/verify/[certNumber]`.
2. Render one of three states:

**Valid**
- Green check icon
- "Certificate Verified ✓"
- Recipient name, program, duration, start/end dates, issue date
- "Issued by Fraylon Technologies LLP"
- Small footer: "Verify at verify.fraylontech.com"

**Revoked**
- Red icon
- "This certificate has been revoked"
- Show revoke date and reason (if reason is shareable)

**Not Found**
- Neutral icon
- "No certificate found with this ID"
- "If you believe this is an error, contact connect@fraylontech.com" (confirm this email with me)

Design: clean, Fraylon-branded (use the same teal `#1E5F7E` as accent color), responsive, mobile-first. Most people will scan and view on phones.

`/api/verify/[certNumber]` (public, no auth):
- Read cert from DB
- Recompute HMAC, compare to stored `signature_hash`. If mismatch, log and return `tampered`.
- Log verification attempt to `verification_logs` (IP hashed with sha256 + a salt env var, not raw).
- Return JSON: `{ status, recipientName, program, duration, startDate, endDate, issueDate, issuedBy }` for `active`; `{ status, revokedAt }` for `revoked`; 404 for not_found.
- Rate limit: 30 requests/min per IP using a simple in-memory limiter (or Upstash Redis if you set it up; in-memory is fine for Phase 1).

---

## 10. Admin Issuer Page

Protected by Supabase Auth. Only my email (set via env `ADMIN_EMAIL_ALLOWLIST` as a comma-separated list) can log in. Reject all other sign-ins server-side.

`/dashboard`: table of all certificates with search by name/cert number, filter by status, action buttons (View PDF, View Public Page, Revoke).

`/issue`: form with fields:
- Recipient Name (required)
- Recipient Email (optional)
- Type (radio: Internship / Workshop / Course)
- Program (text, required, e.g. "Web Development")
- Duration (text, required, e.g. "3-Month Internship")
- Start Date (date, required)
- End Date (date, required)
- Issue Date (date, default today)
- Notes / metadata (textarea, optional, stored in `metadata.notes`)

On submit:
1. Generate cert_number.
2. Compute HMAC.
3. Insert row into `certificates`.
4. Call Puppeteer service to generate PDF.
5. Return PDF to admin as a download + show success toast with the public verify URL.

---

## 11. Subdomain & Deployment

- DNS: Add CNAME for `verify` in Cloudflare DNS pointing to the Cloudflare Pages project domain. SSL auto.
- Cloudflare Pages: Connect repo, set build command (`pnpm build`), output dir `.next`. Add env vars.
- Puppeteer service: Deploy separately on Railway/Render. Get the service URL, add to Next.js env as `PUPPETEER_SERVICE_URL` + `PUPPETEER_SERVICE_TOKEN`.
- The `verify.fraylontech.com` apex of the Next.js app serves both the public `/c/[certNumber]` pages AND the gated admin routes at `/login`, `/dashboard`, `/issue`. That's fine.

---

## 12. Environment Variables

Create `.env.example` with all of these. Never commit real values.

```
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# Auth
ADMIN_EMAIL_ALLOWLIST=yuvaraj@fraylontech.com,ram@fraylontech.com

# Signing
CERT_SIGNING_SECRET=                    # 32-byte hex
IP_HASH_SALT=                            # 16-byte hex

# Puppeteer service
PUPPETEER_SERVICE_URL=
PUPPETEER_SERVICE_TOKEN=

# Render route protection
RENDER_ROUTE_TOKEN=                      # short-lived tokens for puppeteer to access /render/

# Public
NEXT_PUBLIC_VERIFY_BASE_URL=https://verify.fraylontech.com
```

---

## 13. Build Order

**Phase 1 — Foundation (do not skip ahead)**
1. Scaffold Next.js project, Tailwind, TypeScript strict mode.
2. Set up Supabase project, run migrations, confirm RLS works.
3. Build `lib/hmac.ts`, `lib/cert-number.ts`, `lib/qr.ts` with unit tests.
4. Build the API routes: create, get, verify. Manually insert a test row via SQL editor and confirm `/api/verify/...` returns correctly.

**Phase 2 — Verification UI**
5. Build `/c/[certNumber]/page.tsx`. Verify it renders correctly for all three states.
6. Deploy to Cloudflare Pages. Configure `verify.fraylontech.com`. Confirm public access works.

**Phase 3 — PDF generation**
7. Build the `/render/cert/[certNumber]` internal HTML route. Render it in a browser at the right viewport. Iterate on overlay positions until it matches the template.
8. Build the Puppeteer service. Deploy it. Wire it to Next.js.

**Phase 4 — Admin**
9. Auth setup. Admin allowlist. Login page.
10. `/dashboard` and `/issue` pages.
11. End-to-end: log in, issue a cert, download PDF, scan QR with a phone, see public verification page.

**Phase 5 — Polish**
12. Revoke flow.
13. Verification log dashboard view.
14. Error states, edge cases, empty states.

Ship Phase 1+2 before touching Phase 3. The public verify page is what gives the system credibility — get it live first.

---

## 14. Security Requirements (non-negotiable)

- Never expose `SUPABASE_SERVICE_ROLE_KEY` to the client. Use it only in server-side API routes.
- The `/render/cert/...` route MUST be protected. If hit without a valid `RENDER_ROUTE_TOKEN`, return 404. Otherwise anyone could generate fake-looking certs from your domain.
- Log IPs as `sha256(ip + IP_HASH_SALT)`, never raw, to keep verification logs privacy-respecting.
- Rate-limit the public verify endpoint.
- Validate all admin form inputs server-side (zod). Never trust the client.
- Reject any login attempt where email is not in `ADMIN_EMAIL_ALLOWLIST`, even if Supabase Auth lets them through.

---

## 15. Acceptance Criteria

Before declaring done, all of these must pass:

- [ ] I can log in as admin; a non-allowlisted email cannot.
- [ ] I can issue a certificate via the form; the row appears in Supabase with a valid HMAC.
- [ ] The generated PDF is visually indistinguishable from `cert-template.png` except for the filled-in name, dates, and QR code.
- [ ] Scanning the QR with a phone opens `verify.fraylontech.com/c/FRY-INT-2026-XXXXX` and shows "Certificate Verified ✓" with correct data.
- [ ] If I revoke the cert via dashboard, the public page now shows "Revoked" state.
- [ ] If I manually edit the recipient_name in the DB without re-signing, the public page shows tampered state.
- [ ] Visiting `/c/FRY-INT-2026-99999` (non-existent) shows the not-found state.
- [ ] Hitting `/api/verify/...` more than 30 times in 60s from one IP returns 429.
- [ ] `/render/cert/...` returns 404 without the token.
- [ ] Lighthouse mobile score on the public verify page ≥ 90.

---

## 16. What I Want From You Right Now

Do not start coding yet. First reply with:

1. Any clarifying questions on the spec above.
2. The list of asset files you need from me (logos, signature image, stamp image, the template PNG, fraylon brand colors — confirm what you need).
3. Your proposed first PR/commit scope (should be roughly: project scaffold + DB migration + HMAC lib + cert-number lib + unit tests, nothing else).
4. Any spec choice you disagree with and would propose differently, with reasoning.

Only after I respond, begin Phase 1.

---

## 17. Communication Style

I'm a CS engineer and COO of the company. Be direct. Don't pad responses. If a requirement is ambiguous, ask before assuming. If you think I'm wrong about a technical decision, say so and explain why — I prefer pushback to false agreement. Don't apologize unnecessarily. Don't summarize what I just said back to me.