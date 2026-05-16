'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

export function SignOutButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function onClick() {
    setBusy(true);
    try {
      await fetch('/api/auth/signout', { method: 'POST' });
      router.replace('/login');
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className="rounded-md border border-black/10 px-3 py-1.5 text-xs font-medium text-fraylon-ink/70 transition-colors hover:bg-black/5 hover:text-fraylon-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fraylon-teal focus-visible:ring-offset-1 disabled:opacity-60"
    >
      {busy ? 'Signing out…' : 'Sign out'}
    </button>
  );
}
