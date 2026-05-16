import type { Metadata } from 'next';
import Link from 'next/link';
import { IssueForm } from './issue-form';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export const metadata: Metadata = {
  title: 'Issue certificate · Fraylon Admin',
  robots: { index: false, follow: false },
};

export default function AdminIssuePage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:py-10">
      <header className="mb-6 sm:mb-8">
        <Link
          href="/admin"
          className="inline-flex items-center gap-1 rounded text-xs font-medium uppercase tracking-[0.2em] text-fraylon-teal transition-colors hover:text-fraylon-teal-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fraylon-teal"
        >
          <span aria-hidden="true">←</span> Dashboard
        </Link>
        <h1 className="mt-2 font-serif text-2xl text-fraylon-teal-dark sm:text-3xl">Issue certificate</h1>
        <p className="mt-1 text-sm text-fraylon-ink/60">
          Generate a new signed certificate and download the PDF.
        </p>
      </header>
      <IssueForm />
    </div>
  );
}
