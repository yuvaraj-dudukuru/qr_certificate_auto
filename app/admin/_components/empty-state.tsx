import type { ReactNode } from 'react';

export function EmptyState({
  title,
  message,
  action,
}: {
  title: string;
  message: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-black/10 bg-white px-6 py-14 text-center">
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-fraylon-teal/10 text-fraylon-teal">
        <svg
          width="28"
          height="28"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <rect x="3.5" y="4" width="14" height="17" rx="2" />
          <path d="M7 9h7M7 13h7M7 17h4" />
          <circle cx="18.5" cy="18.5" r="2.5" />
          <path d="M20.5 20.5L22 22" />
        </svg>
      </div>
      <h3 className="font-serif text-lg text-fraylon-teal-dark">{title}</h3>
      <p className="mt-1 max-w-sm text-sm text-fraylon-ink/60">{message}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
