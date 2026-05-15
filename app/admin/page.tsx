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

export default async function AdminDashboard() {
  const rows = await loadCerts();

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <header className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="font-serif text-3xl text-fraylon-teal-dark">Certificates</h1>
          <p className="mt-1 text-sm text-fraylon-ink/60">
            {rows.length} total · most recent first
          </p>
        </div>
        <Link
          href="/admin/issue"
          className="rounded-md bg-fraylon-teal px-4 py-2 text-sm font-medium text-white hover:bg-fraylon-teal-dark"
        >
          + Issue certificate
        </Link>
      </header>
      <AdminTable rows={rows} />
    </div>
  );
}
