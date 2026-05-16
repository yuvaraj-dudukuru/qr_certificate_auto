'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { StatusPill, type CertStatus } from './_components/status-pill';
import { EmptyState } from './_components/empty-state';
import { useToast } from './_components/toast';

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
  const toast = useToast();
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [revokingCert, setRevokingCert] = useState<string | null>(null);
  const [isRefreshing, startRefresh] = useTransition();

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
    if (reason == null) return;
    const trimmed = reason.trim();
    if (!trimmed) {
      toast.show('Revoke reason is required.', 'error');
      return;
    }
    setRevokingCert(row.certNumber);
    try {
      const res = await fetch('/api/admin/revoke', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ certNumber: row.certNumber, reason: trimmed }),
      });
      if (!res.ok) {
        const data: { error?: string } = await res.json().catch(() => ({}));
        toast.show(data.error || `Revoke failed (${res.status}).`, 'error');
        return;
      }
      toast.show(`${row.certNumber} revoked.`, 'success');
      startRefresh(() => router.refresh());
    } catch (err) {
      toast.show((err as Error).message || 'Revoke failed.', 'error');
    } finally {
      setRevokingCert(null);
    }
  }

  const isFiltering = query.trim().length > 0 || statusFilter !== 'all';
  const hasRows = rows.length > 0;
  const hasMatches = filtered.length > 0;

  return (
    <div className="space-y-5">
      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search cert number or recipient…"
          className="w-full min-h-[44px] rounded-lg border border-black/10 bg-white px-4 py-2.5 text-sm shadow-sm outline-none transition-colors placeholder:text-fraylon-ink/40 focus-visible:border-fraylon-teal focus-visible:ring-2 focus-visible:ring-fraylon-teal/30 sm:max-w-sm"
          aria-label="Search certificates"
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
          className="min-h-[44px] rounded-lg border border-black/10 bg-white px-3 py-2.5 text-sm shadow-sm outline-none transition-colors focus-visible:border-fraylon-teal focus-visible:ring-2 focus-visible:ring-fraylon-teal/30"
          aria-label="Filter by status"
        >
          <option value="all">All statuses</option>
          <option value="active">Active</option>
          <option value="revoked">Revoked</option>
        </select>
        <span className="text-xs text-fraylon-ink/50 sm:ml-auto">
          {filtered.length} / {rows.length}
          {isRefreshing && <span className="ml-2 italic text-fraylon-teal">refreshing…</span>}
        </span>
      </div>

      {/* Empty / list */}
      {!hasRows ? (
        <EmptyState
          title="No certificates yet"
          message="Issue the first certificate to see it here."
        />
      ) : !hasMatches ? (
        <EmptyState
          title="No matches"
          message={
            isFiltering
              ? 'Try a different search term or clear the status filter.'
              : 'No certificates match the current filter.'
          }
          action={
            isFiltering && (
              <button
                type="button"
                onClick={() => {
                  setQuery('');
                  setStatusFilter('all');
                }}
                className="rounded-md border border-black/10 px-3 py-2 text-xs font-medium text-fraylon-ink/70 transition-colors hover:bg-black/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fraylon-teal"
              >
                Clear filters
              </button>
            )
          }
        />
      ) : (
        <>
          {/* Mobile cards (< sm) */}
          <ul className="space-y-3 sm:hidden">
            {filtered.map((row) => (
              <li
                key={row.certNumber}
                className="rounded-2xl border border-black/5 bg-white p-4 shadow-sm transition-shadow hover:shadow-md"
              >
                <div className="flex items-start justify-between gap-3">
                  <span className="font-mono text-xs font-semibold tracking-wide text-fraylon-teal-dark">
                    {row.certNumber}
                  </span>
                  <StatusPill status={row.status as CertStatus} />
                </div>
                <p className="mt-2 text-base font-medium text-fraylon-ink">{row.recipientName}</p>
                <p className="text-sm text-fraylon-ink/60">{row.program}</p>
                <p className="mt-1 text-xs text-fraylon-ink/50">Issued {row.issueDate}</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {row.pdfUrl && (
                    <a
                      href={row.pdfUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex min-h-[40px] flex-1 items-center justify-center rounded-md border border-black/10 px-3 text-xs font-medium text-fraylon-ink/80 transition-colors hover:bg-black/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fraylon-teal"
                    >
                      View PDF
                    </a>
                  )}
                  <a
                    href={`/c/${row.certNumber}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex min-h-[40px] flex-1 items-center justify-center rounded-md border border-black/10 px-3 text-xs font-medium text-fraylon-ink/80 transition-colors hover:bg-black/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fraylon-teal"
                  >
                    Public page
                  </a>
                  {row.status === 'active' && (
                    <button
                      type="button"
                      onClick={() => onRevoke(row)}
                      disabled={revokingCert === row.certNumber}
                      className="inline-flex min-h-[40px] flex-1 items-center justify-center rounded-md border border-red-200 px-3 text-xs font-medium text-red-700 transition-colors hover:bg-red-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-300 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {revokingCert === row.certNumber ? 'Revoking…' : 'Revoke'}
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>

          {/* Desktop table (>= sm) */}
          <div className="hidden overflow-hidden rounded-2xl border border-black/5 bg-white shadow-[0_1px_2px_rgba(0,0,0,0.04)] sm:block">
            <table className="w-full text-left text-sm">
              <thead className="bg-fraylon-paper/60 text-[11px] font-medium uppercase tracking-wider text-fraylon-ink/60">
                <tr>
                  <th className="px-5 py-3.5">Cert</th>
                  <th className="px-5 py-3.5">Recipient</th>
                  <th className="px-5 py-3.5">Program</th>
                  <th className="px-5 py-3.5">Issued</th>
                  <th className="px-5 py-3.5">Status</th>
                  <th className="px-5 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/5">
                {filtered.map((row) => (
                  <tr
                    key={row.certNumber}
                    className="transition-colors hover:bg-fraylon-paper/50"
                  >
                    <td className="px-5 py-4 font-mono text-xs font-medium text-fraylon-teal-dark">
                      {row.certNumber}
                    </td>
                    <td className="px-5 py-4 font-medium text-fraylon-ink">{row.recipientName}</td>
                    <td className="px-5 py-4 text-fraylon-ink/70">{row.program}</td>
                    <td className="px-5 py-4 text-fraylon-ink/70">{row.issueDate}</td>
                    <td className="px-5 py-4">
                      <StatusPill status={row.status as CertStatus} />
                    </td>
                    <td className="px-5 py-4 text-right">
                      <div className="flex justify-end gap-1.5">
                        {row.pdfUrl && (
                          <a
                            href={row.pdfUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="rounded-md border border-black/10 px-2.5 py-1.5 text-xs text-fraylon-ink/80 transition-colors hover:bg-black/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fraylon-teal"
                            title="Open PDF (7-day signed URL)"
                          >
                            PDF
                          </a>
                        )}
                        <a
                          href={`/c/${row.certNumber}`}
                          target="_blank"
                          rel="noreferrer"
                          className="rounded-md border border-black/10 px-2.5 py-1.5 text-xs text-fraylon-ink/80 transition-colors hover:bg-black/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fraylon-teal"
                          title="Open public verify page"
                        >
                          Public
                        </a>
                        {row.status === 'active' && (
                          <button
                            type="button"
                            onClick={() => onRevoke(row)}
                            disabled={revokingCert === row.certNumber}
                            className="rounded-md border border-red-200 px-2.5 py-1.5 text-xs font-medium text-red-700 transition-colors hover:bg-red-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-300 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {revokingCert === row.certNumber ? 'Revoking…' : 'Revoke'}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
