'use client';

import { useState, type FormEvent } from 'react';

interface Props {
  next?: string;
  initialError?: string;
}

export function LoginForm({ next, initialError }: Props) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(initialError ?? null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch('/api/auth/signin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, next: next || '/admin' }),
      });
      const data: { ok: boolean; redirectTo?: string; error?: string } = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.error || 'Sign in failed.');
        return;
      }
      // Full navigation (not router.replace) so middleware re-runs against
      // the fresh session cookies. Next's typedRoutes also won't accept a
      // runtime string into router.replace.
      window.location.assign(data.redirectTo || '/admin');
    } catch (err) {
      setError((err as Error).message || 'Sign in failed.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {error && (
        <div className="rounded-md border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}
      <div>
        <label htmlFor="email" className="mb-1 block text-xs font-medium uppercase tracking-wider text-fraylon-ink/60">
          Email
        </label>
        <input
          id="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded-md border border-black/10 bg-white px-3 py-2 text-sm text-fraylon-ink outline-none focus:border-fraylon-teal focus:ring-1 focus:ring-fraylon-teal"
        />
      </div>
      <div>
        <label htmlFor="password" className="mb-1 block text-xs font-medium uppercase tracking-wider text-fraylon-ink/60">
          Password
        </label>
        <input
          id="password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded-md border border-black/10 bg-white px-3 py-2 text-sm text-fraylon-ink outline-none focus:border-fraylon-teal focus:ring-1 focus:ring-fraylon-teal"
        />
      </div>
      <button
        type="submit"
        disabled={submitting}
        className="w-full rounded-md bg-fraylon-teal px-3 py-2.5 text-sm font-medium text-white transition hover:bg-fraylon-teal-dark disabled:cursor-not-allowed disabled:opacity-60"
      >
        {submitting ? 'Signing in…' : 'Sign in'}
      </button>
    </form>
  );
}
