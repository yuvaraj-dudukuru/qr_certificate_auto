'use client';

import { useState } from 'react';

interface Props {
  certNumber: string;
}

// Renders ONLY on the valid state. Click → fetch a fresh short-lived
// signed URL from /api/download/<n> → navigate. Two-step (not a direct
// link) so revoked / tampered / deleted-PDF states fail closed at the
// server rather than producing a stale stored URL.
export function DownloadButton({ certNumber }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onClick() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/download/${encodeURIComponent(certNumber)}`, {
        method: 'GET',
        cache: 'no-store',
      });
      const data: { url?: string; error?: string } = await res.json().catch(() => ({}));
      if (!res.ok || !data.url) {
        const msg = data.error || `download unavailable (${res.status})`;
        setError(humanError(msg, res.status));
        return;
      }
      window.location.href = data.url;
    } catch (err) {
      setError((err as Error).message || 'download failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mt-6 flex flex-col items-center gap-2">
      <button
        type="button"
        onClick={onClick}
        disabled={loading}
        className="rounded-md bg-fraylon-teal px-5 py-2.5 text-sm font-medium text-white transition hover:bg-fraylon-teal-dark disabled:cursor-not-allowed disabled:opacity-60"
      >
        {loading ? 'Preparing download…' : 'Download Certificate'}
      </button>
      {error && (
        <p className="text-xs text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}

function humanError(code: string, status: number): string {
  if (status === 429) return 'Too many download requests. Try again shortly.';
  if (code === 'pdf_not_generated') {
    return 'PDF not available yet. Contact internship@fraylontech.com.';
  }
  if (code === 'revoked' || code === 'tampered') {
    return 'This certificate is not available for download.';
  }
  return 'Download is temporarily unavailable. Try again shortly.';
}
