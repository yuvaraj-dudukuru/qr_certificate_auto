'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { SignOutButton } from '../signout-button';

interface Props {
  email: string;
}

export function AdminNav({ email }: Props) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Close drawer on route change.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Lock body scroll while the drawer is open.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  const linkClass = (href: string) =>
    `rounded-md px-2 py-1 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fraylon-teal ${
      pathname === href || (href !== '/admin' && pathname.startsWith(href))
        ? 'text-fraylon-teal-dark font-medium'
        : 'text-fraylon-ink/70 hover:text-fraylon-teal-dark'
    }`;

  return (
    <header className="sticky top-0 z-30 border-b border-black/5 bg-white/90 backdrop-blur supports-[backdrop-filter]:bg-white/75">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:py-4">
        <div className="flex min-w-0 items-center gap-4 sm:gap-6">
          <Link
            href="/admin"
            className="text-xs font-medium uppercase tracking-[0.2em] text-fraylon-teal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fraylon-teal rounded"
          >
            Fraylon Admin
          </Link>
          <nav className="hidden items-center gap-1 sm:flex">
            <Link href="/admin" className={linkClass('/admin')}>
              Dashboard
            </Link>
            <Link href="/admin/issue" className={linkClass('/admin/issue')}>
              Issue
            </Link>
          </nav>
        </div>

        {/* Desktop: email + sign out */}
        <div className="hidden items-center gap-3 sm:flex">
          <span
            className="max-w-[180px] truncate text-xs text-fraylon-ink/60"
            title={email}
          >
            {email}
          </span>
          <SignOutButton />
        </div>

        {/* Mobile: hamburger toggle */}
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-black/10 text-fraylon-ink/80 transition-colors hover:bg-black/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fraylon-teal sm:hidden"
          aria-label={open ? 'Close menu' : 'Open menu'}
          aria-expanded={open}
          aria-controls="admin-mobile-menu"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            {open ? (
              <>
                <path d="M6 6l12 12" />
                <path d="M18 6L6 18" />
              </>
            ) : (
              <>
                <path d="M4 7h16" />
                <path d="M4 12h16" />
                <path d="M4 17h16" />
              </>
            )}
          </svg>
        </button>
      </div>

      {/* Mobile drawer */}
      <div
        id="admin-mobile-menu"
        className={`sm:hidden ${open ? 'block' : 'hidden'}`}
      >
        <div className="border-t border-black/5 bg-white px-4 py-3">
          <nav className="flex flex-col gap-1">
            <Link
              href="/admin"
              className={`block rounded-md px-3 py-3 text-sm transition-colors ${
                pathname === '/admin'
                  ? 'bg-fraylon-teal/10 text-fraylon-teal-dark font-medium'
                  : 'text-fraylon-ink/80 hover:bg-black/5'
              }`}
            >
              Dashboard
            </Link>
            <Link
              href="/admin/issue"
              className={`block rounded-md px-3 py-3 text-sm transition-colors ${
                pathname.startsWith('/admin/issue')
                  ? 'bg-fraylon-teal/10 text-fraylon-teal-dark font-medium'
                  : 'text-fraylon-ink/80 hover:bg-black/5'
              }`}
            >
              Issue certificate
            </Link>
          </nav>
          <div className="mt-3 flex items-center justify-between gap-3 border-t border-black/5 pt-3">
            <span className="min-w-0 truncate text-xs text-fraylon-ink/60" title={email}>
              {email}
            </span>
            <SignOutButton />
          </div>
        </div>
      </div>
    </header>
  );
}
