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
    <div className="mx-auto max-w-3xl px-4 py-10">
      <header className="mb-8 flex items-center justify-between">
        <div>
          <Link
            href="/admin"
            className="text-xs font-medium uppercase tracking-[0.2em] text-fraylon-teal hover:text-fraylon-teal-dark"
          >
            ← Dashboard
          </Link>
          <h1 className="mt-1 font-serif text-3xl text-fraylon-teal-dark">Issue certificate</h1>
        </div>
      </header>
      <IssueForm />
    </div>
  );
}
