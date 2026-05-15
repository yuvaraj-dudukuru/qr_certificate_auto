import type { Metadata } from 'next';
import { headers } from 'next/headers';
import Link from 'next/link';
import { extractAndHashIp } from '@/lib/ip';
import { checkVerifyRateLimit, retryAfterSeconds } from '@/lib/rate-limit';
import {
  logVerification,
  verifyCertificate,
  type RevokedResult,
  type ValidResult,
  type VerifyResult,
} from '@/lib/verify-cert';
import { DownloadButton } from './download-button';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const runtime = 'nodejs';

const CONTACT_EMAIL = 'internship@fraylontech.com';
const ORG = 'Fraylon Technologies LLP';
const MAX_CERT_DISPLAY = 32; // sanity cap for malformed URL segments shown in UI

interface PageProps {
  params: { certNumber: string };
}

export const metadata: Metadata = {
  title: 'Verify Certificate · Fraylon',
  description: 'Verify a certificate issued by Fraylon Technologies LLP.',
  robots: { index: false, follow: false },
};

function trim(value: string, limit = MAX_CERT_DISPLAY): string {
  return value.length > limit ? `${value.slice(0, limit)}…` : value;
}

function formatLongDate(iso: string): string {
  // Stored as 'YYYY-MM-DD'. Parse with explicit UTC to avoid timezone drift,
  // then format en-GB style: "1 February 2026".
  const date = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}

function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}

// ---------------------------------------------------------------------------
// Icons (inline SVG, no extra deps)
// ---------------------------------------------------------------------------

function CheckIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="h-10 w-10 stroke-current"
      fill="none"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="10" />
      <path d="m8 12 3 3 5-6" />
    </svg>
  );
}

function WarningIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="h-10 w-10 stroke-current"
      fill="none"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 3 2 21h20L12 3Z" />
      <path d="M12 10v5" />
      <circle cx="12" cy="18" r="0.5" fill="currentColor" />
    </svg>
  );
}

function SlashIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="h-10 w-10 stroke-current"
      fill="none"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="10" />
      <path d="m5 5 14 14" />
    </svg>
  );
}

function QuestionIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="h-10 w-10 stroke-current"
      fill="none"
      strokeWidth="2.3"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="10" />
      <path d="M9.5 9.5a2.5 2.5 0 1 1 4.2 1.8c-.7.5-1.7 1.1-1.7 2.2" />
      <circle cx="12" cy="17" r="0.5" fill="currentColor" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// State badges
// ---------------------------------------------------------------------------

type Badge =
  | { tone: 'valid'; label: string }
  | { tone: 'revoked'; label: string }
  | { tone: 'tampered'; label: string }
  | { tone: 'not_found'; label: string }
  | { tone: 'rate_limited'; label: string };

function StateBadge({ badge, children }: { badge: Badge; children: React.ReactNode }) {
  const tone = badge.tone;
  const styles: Record<Badge['tone'], string> = {
    valid: 'bg-emerald-50 text-emerald-700 ring-emerald-100',
    revoked: 'bg-amber-50 text-amber-700 ring-amber-100',
    tampered: 'bg-red-50 text-red-700 ring-red-100',
    not_found: 'bg-slate-50 text-slate-600 ring-slate-200',
    rate_limited: 'bg-slate-50 text-slate-600 ring-slate-200',
  };
  return (
    <div className={`flex items-center gap-3 rounded-full px-4 py-2 ring-1 ${styles[tone]}`}>
      {children}
      <span className="text-xs font-medium uppercase tracking-[0.18em]">{badge.label}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// State views
// ---------------------------------------------------------------------------

function CertNumberFootline({ certNumber }: { certNumber: string }) {
  return (
    <p className="mt-6 break-all text-center text-xs uppercase tracking-[0.2em] text-fraylon-ink/40">
      {trim(certNumber)}
    </p>
  );
}

function ValidView({ data }: { data: ValidResult }) {
  return (
    <div className="flex flex-col items-center">
      <div className="text-emerald-600">
        <CheckIcon />
      </div>
      <StateBadge badge={{ tone: 'valid', label: 'Certificate Verified' }}>
        <span className="sr-only">Valid</span>
      </StateBadge>
      <h1 className="mt-6 text-center font-serif text-3xl text-fraylon-teal-dark sm:text-4xl">
        {data.recipientName}
      </h1>
      <p className="mt-2 text-center text-sm text-fraylon-ink/70">
        successfully completed
      </p>
      <p className="mt-1 text-center font-serif text-xl text-fraylon-ink">{data.program}</p>
      <dl className="mt-6 w-full divide-y divide-black/5 rounded-xl bg-fraylon-paper/60 px-5 py-1 text-sm">
        <Row label="Duration" value={data.duration} />
        <Row label="From" value={formatLongDate(data.startDate)} />
        <Row label="To" value={formatLongDate(data.endDate)} />
        <Row label="Date of issue" value={formatLongDate(data.issueDate)} />
      </dl>
      <p className="mt-5 text-center text-xs text-fraylon-ink/60">Issued by {data.issuedBy}</p>
      <DownloadButton certNumber={data.certNumber} />
      <CertNumberFootline certNumber={data.certNumber} />
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2.5">
      <dt className="text-xs uppercase tracking-wider text-fraylon-ink/50">{label}</dt>
      <dd className="text-right text-sm text-fraylon-ink">{value}</dd>
    </div>
  );
}

function RevokedView({ data }: { data: RevokedResult }) {
  return (
    <div className="flex flex-col items-center">
      <div className="text-amber-600">
        <SlashIcon />
      </div>
      <StateBadge badge={{ tone: 'revoked', label: 'Certificate Revoked' }}>
        <span className="sr-only">Revoked</span>
      </StateBadge>
      <h1 className="mt-6 text-center font-serif text-2xl text-fraylon-ink sm:text-3xl">
        This certificate has been revoked.
      </h1>
      <p className="mt-3 max-w-sm text-center text-sm text-fraylon-ink/70">
        {ORG} has invalidated this certificate. It should no longer be treated as proof of
        completion.
      </p>
      {(data.revokedAt || data.revokeReason) && (
        <dl className="mt-6 w-full divide-y divide-black/5 rounded-xl bg-fraylon-paper/60 px-5 py-1 text-sm">
          {data.revokedAt && <Row label="Revoked on" value={formatTimestamp(data.revokedAt)} />}
          {data.revokeReason && <Row label="Reason" value={data.revokeReason} />}
        </dl>
      )}
      <p className="mt-5 text-center text-xs text-fraylon-ink/60">
        Questions? Contact{' '}
        <a className="font-medium text-fraylon-teal" href={`mailto:${CONTACT_EMAIL}`}>
          {CONTACT_EMAIL}
        </a>
        .
      </p>
      <CertNumberFootline certNumber={data.certNumber} />
    </div>
  );
}

function TamperedView({ certNumber }: { certNumber: string }) {
  return (
    <div className="flex flex-col items-center">
      <div className="text-red-600">
        <WarningIcon />
      </div>
      <StateBadge badge={{ tone: 'tampered', label: 'Cannot Verify' }}>
        <span className="sr-only">Tampered</span>
      </StateBadge>
      <h1 className="mt-6 text-center font-serif text-2xl text-fraylon-ink sm:text-3xl">
        This certificate&apos;s data does not match its signature.
      </h1>
      <p className="mt-3 max-w-sm text-center text-sm text-fraylon-ink/70">
        Do not trust this document. The information shown on it may have been altered after issue.
        Contact {ORG} to confirm whether this certificate is genuine.
      </p>
      <p className="mt-5 text-center text-xs text-fraylon-ink/60">
        Contact{' '}
        <a className="font-medium text-fraylon-teal" href={`mailto:${CONTACT_EMAIL}`}>
          {CONTACT_EMAIL}
        </a>{' '}
        with the certificate ID below.
      </p>
      <CertNumberFootline certNumber={certNumber} />
    </div>
  );
}

function NotFoundView({ certNumber }: { certNumber: string }) {
  return (
    <div className="flex flex-col items-center">
      <div className="text-slate-500">
        <QuestionIcon />
      </div>
      <StateBadge badge={{ tone: 'not_found', label: 'No Match' }}>
        <span className="sr-only">Not Found</span>
      </StateBadge>
      <h1 className="mt-6 text-center font-serif text-2xl text-fraylon-ink sm:text-3xl">
        No certificate found with this ID.
      </h1>
      <p className="mt-3 max-w-sm text-center text-sm text-fraylon-ink/70">
        If you believe this is an error, contact{' '}
        <a className="font-medium text-fraylon-teal" href={`mailto:${CONTACT_EMAIL}`}>
          {CONTACT_EMAIL}
        </a>
        .
      </p>
      <CertNumberFootline certNumber={certNumber} />
    </div>
  );
}

function RateLimitedView({ retryAfter }: { retryAfter: number }) {
  return (
    <div className="flex flex-col items-center">
      <div className="text-slate-500">
        <SlashIcon />
      </div>
      <StateBadge badge={{ tone: 'rate_limited', label: 'Too Many Requests' }}>
        <span className="sr-only">Rate limited</span>
      </StateBadge>
      <h1 className="mt-6 text-center font-serif text-2xl text-fraylon-ink sm:text-3xl">
        Please slow down.
      </h1>
      <p className="mt-3 max-w-sm text-center text-sm text-fraylon-ink/70">
        Too many verifications from your network. Try again in about {retryAfter} second
        {retryAfter === 1 ? '' : 's'}.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function VerifyPage({ params }: PageProps) {
  const certNumber = decodeURIComponent(params.certNumber);
  const reqHeaders = headers();

  const ipHash = (() => {
    try {
      return extractAndHashIp(reqHeaders);
    } catch {
      return null;
    }
  })();
  const userAgent = reqHeaders.get('user-agent');

  const limit = await checkVerifyRateLimit(ipHash);
  if (!limit.allowed) {
    return (
      <Shell>
        <RateLimitedView retryAfter={retryAfterSeconds(limit.reset)} />
      </Shell>
    );
  }

  let result: VerifyResult;
  try {
    result = await verifyCertificate(certNumber);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[verify-page] verifyCertificate failed:', err);
    return (
      <Shell>
        <RateLimitedView retryAfter={5} />
      </Shell>
    );
  }

  void logVerification({
    certNumber: result.certNumber,
    result: result.status,
    ipHash,
    userAgent,
  });

  return (
    <Shell>
      {result.status === 'valid' && <ValidView data={result} />}
      {result.status === 'revoked' && <RevokedView data={result} />}
      {result.status === 'tampered' && <TamperedView certNumber={result.certNumber} />}
      {result.status === 'not_found' && <NotFoundView certNumber={result.certNumber} />}
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-fraylon-paper px-4 py-10">
      <article className="w-full max-w-md rounded-2xl border border-black/5 bg-white p-8 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_24px_-12px_rgba(15,42,58,0.18)] sm:p-10">
        <header className="mb-6 flex items-center justify-between">
          <Link
            href="/"
            className="text-xs font-medium uppercase tracking-[0.2em] text-fraylon-teal hover:text-fraylon-teal-dark"
          >
            Fraylon
          </Link>
          <span className="text-[10px] uppercase tracking-[0.2em] text-fraylon-ink/40">
            Certificate Verification
          </span>
        </header>
        {children}
        <footer className="mt-8 border-t border-black/5 pt-4 text-center text-[11px] text-fraylon-ink/40">
          Verify any Fraylon certificate at{' '}
          <span className="text-fraylon-ink/60">verify.fraylontech.com</span>
        </footer>
      </article>
    </main>
  );
}
