export type CertStatus = 'active' | 'revoked' | 'tampered';

const STYLES: Record<CertStatus, string> = {
  active:   'bg-emerald-100 text-emerald-800 ring-emerald-200',
  revoked:  'bg-zinc-100 text-zinc-700 ring-zinc-200',
  tampered: 'bg-red-100 text-red-800 ring-red-200',
};

const LABELS: Record<CertStatus, string> = {
  active:   'Active',
  revoked:  'Revoked',
  tampered: 'Tampered',
};

export function StatusPill({ status }: { status: CertStatus }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ring-1 ${STYLES[status]}`}
    >
      <span
        className={`mr-1.5 inline-block h-1.5 w-1.5 rounded-full ${
          status === 'active' ? 'bg-emerald-500' : status === 'tampered' ? 'bg-red-500' : 'bg-zinc-400'
        }`}
        aria-hidden="true"
      />
      {LABELS[status]}
    </span>
  );
}
