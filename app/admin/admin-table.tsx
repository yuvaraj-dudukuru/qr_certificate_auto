'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

export interface AdminCertRow {
  certNumber: string;
  recipientName: string;
  program: string;
  issueDate: string;
  status: 'active' | 'revoked';
  pdfUrl: string | null;
}

type StatusFilter = 'all' | 'active' | 'revoked';

export function AdminTable({ rows }: { rows: AdminCertRow[] }) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [revokingCert, setRevokingCert] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (statusFilter !== 'all' && r.status !== statusFilter) return false;
      if (!q) return true;
      return (
        r.certNumber.toLowerCase().includes(q) ||
        r.recipientName.toLowerCase().includes(q)
      );
    });
  }, [rows, query, statusFilter]);

  async function onRevoke(row: AdminCertRow) {
    const reason = window.prompt(
      `Revoke ${row.certNumber} (${row.recipientName})?\n\nEnter a reason (shown on the public verify page):`,
      '',
    );
    if (reason == null) return;          // user cancelled
    const trimmed = reason.trim();
    if (!trimmed) {
      setError('Revoke reason is required.');
      return;
    }
    setError(null);
    setRevokingCert(row.certNumber);
    try {
      const res = await fetch('/api/admin/revoke', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ certNumber: row.certNumber, reason: trimmed }),
      });
      if (!res.ok) {
        const data: { error?: string } = await res.json().catch(() => ({}));
        setError(data.error || `revoke failed (${res.status})`);
        return;
      }
      router.refresh();
    } catch (err) {
      setError((err as Error).message || 'revoke failed');
    } finally {
      setRevokingCert(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search cert number or recipient…"
          className="w-full max-w-sm rounded-md border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:border-fraylon-teal focus:ring-1 focus:ring-fraylon-teal"
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
          className="rounded-md border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:border-fraylon-teal focus:ring-1 focus:ring-fraylon-teal"
        >
          <option value="all">All statuses</option>
          <option value="active">Active</option>
          <option value="revoked">Revoked</option>
        </select>
        <span className="ml-auto text-xs text-fraylon-ink/50">
          {filtered.length} / {rows.length}
        </span>
      </div>

      {error && (
        <div className="rounded-md border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="overflow-hidden rounded-2xl border border-black/5 bg-white shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
        <table className="w-full text-left text-sm">
          <thead className="bg-fraylon-paper/60 text-[11px] font-medium uppercase tracking-wider text-fraylon-ink/60">
            <tr>
              <th className="px-4 py-3">Cert</th>
              <th className="px-4 py-3">Recipient</th>
              <th className="px-4 py-3">Program</th>
              <th className="px-4 py-3">Issued</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-black/5">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-sm text-fraylon-ink/50">
                  No certificates match the current filter.
                </td>
              </tr>
            ) : (
              filtered.map((row) => (
                <tr key={row.certNumber} className="hover:bg-fraylon-paper/40">
                  <td className="px-4 py-3 font-mono text-xs text-fraylon-ink">{row.certNumber}</td>
                  <td className="px-4 py-3 text-fraylon-ink">{row.recipientName}</td>
                  <td className="px-4 py-3 text-fraylon-ink/70">{row.program}</td>
                  <td className="px-4 py-3 text-fraylon-ink/70">{row.issueDate}</td>
                  <td className="px-4 py-3">
                    <StatusPill status={row.status} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-1">
                      {row.pdfUrl && (
                        <a
                          href={row.pdfUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="rounded-md border border-black/10 px-2 py-1 text-xs text-fraylon-ink/70 hover:bg-black/5"
                          title="Open PDF (7-day signed URL)"
                        >
                          PDF
                        </a>
                      )}
                      <a
                        href={`/c/${row.certNumber}`}
                        target="_blank"
                        rel="noreferrer"
                        className="rounded-md border border-black/10 px-2 py-1 text-xs text-fraylon-ink/70 hover:bg-black/5"
                        title="Open public verify page"
                      >
                        Public
                      </a>
                      {row.status === 'active' && (
                        <button
                          type="button"
                          onClick={() => onRevoke(row)}
                          disabled={revokingCert === row.certNumber}
                          className="rounded-md border border-red-200 px-2 py-1 text-xs text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {revokingCert === row.certNumber ? 'Revoking…' : 'Revoke'}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: 'active' | 'revoked' }) {
  if (status === 'active') {
    return (
      <span className="inline-flex items-center rounded-full bg-emerald-50 px-2.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-emerald-700 ring-1 ring-emerald-100">
        Active
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full bg-amber-50 px-2.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-amber-700 ring-1 ring-amber-100">
      Revoked
    </span>
  );
}
