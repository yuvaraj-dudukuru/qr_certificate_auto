import type { Metadata } from 'next';
import Link from 'next/link';
import { getCertPdfSignedUrl, STORAGE_TTL } from '@/lib/storage';
import { getServiceSupabase } from '@/lib/supabase/server';
import { AdminTable, type AdminCertRow } from './admin-table';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export const metadata: Metadata = {
  title: 'Dashboard · Fraylon Admin',
  robots: { index: false, follow: false },
};

interface DbRow {
  cert_number: string;
  recipient_name: string;
  program: string;
  issue_date: string;
  status: 'active' | 'revoked';
}

async function loadCerts(): Promise<AdminCertRow[]> {
  const supabase = getServiceSupabase();
  const { data, error } = await supabase
    .from('certificates')
    .select('cert_number,recipient_name,program,issue_date,status')
    .order('cert_number', { ascending: false })
    .limit(500);
  if (error) {
    throw new Error(`load certs failed: ${error.message}`);
  }
  const rows = (data ?? []) as DbRow[];

  // Sign PDF URLs in parallel. createSignedUrl is HMAC-only (no network
  // round-trip to Storage), so 500 rows is fine. Misses (no PDF in
  // Storage — e.g. row from a failed issuance) come back null and the UI
  // hides the View PDF button.
  const signed = await Promise.all(
    rows.map((r) =>
      getCertPdfSignedUrl(r.cert_number, STORAGE_TTL.DEFAULT).catch(() => null),
    ),
  );

  return rows.map((r, i) => ({
    certNumber:   r.cert_number,
    recipientName: r.recipient_name,
    program:      r.program,
    issueDate:    r.issue_date,
    status:       r.status,
    pdfUrl:       signed[i]?.signedUrl ?? null,
  }));
}

function formatLastIssued(rows: AdminCertRow[]): string | null {
  const first = rows[0];
  if (!first) return null;
  return rows.reduce((acc, r) => (r.issueDate > acc ? r.issueDate : acc), first.issueDate);
}

export default async function AdminDashboard() {
  const rows = await loadCerts();
  const lastIssued = formatLastIssued(rows);

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:py-10">
      <header className="mb-6 flex flex-col gap-4 sm:mb-8 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-serif text-2xl text-fraylon-teal-dark sm:text-3xl">Certificates</h1>
          <p className="mt-1 text-sm text-fraylon-ink/60">
            {rows.length} total · most recent first
            {lastIssued && (
              <>
                <span className="mx-2 text-fraylon-ink/30">·</span>
                Last issued <span className="font-medium text-fraylon-ink/70">{lastIssued}</span>
              </>
            )}
          </p>
        </div>
        <Link
          href="/admin/issue"
          className="inline-flex w-full min-h-[44px] items-center justify-center gap-1.5 rounded-lg bg-fraylon-teal px-5 py-2.5 text-sm font-medium text-white shadow-sm transition-all hover:-translate-y-0.5 hover:bg-fraylon-teal-dark hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fraylon-teal focus-visible:ring-offset-2 sm:w-auto"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
            <path d="M12 5v14M5 12h14" />
          </svg>
          Issue certificate
        </Link>
      </header>
      <AdminTable rows={rows} />
    </div>
  );
}
