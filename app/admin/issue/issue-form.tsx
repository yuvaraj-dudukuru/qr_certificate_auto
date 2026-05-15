'use client';

import { useMemo, useState, type FormEvent } from 'react';

interface SuccessState {
  certNumber: string;
  signedUrl: string;
  verifyUrl: string;
  pdfBlobUrl: string;
}

const TYPE_LABELS: Record<'INT' | 'WRK' | 'CRS', string> = {
  INT: 'Internship',
  WRK: 'Workshop',
  CRS: 'Course',
};

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

interface IssueIssue {
  message?: string;
  path?: (string | number)[];
}

export function IssueForm() {
  const [type, setType] = useState<'INT' | 'WRK' | 'CRS'>('INT');
  const [recipientName, setRecipientName] = useState('');
  const [recipientEmail, setRecipientEmail] = useState('');
  const [program, setProgram] = useState('Web Development');
  const [duration, setDuration] = useState('3-Month Internship');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [issueDate, setIssueDate] = useState(today());
  const [notes, setNotes] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [success, setSuccess] = useState<SuccessState | null>(null);

  const clientSideValid = useMemo(() => {
    if (!recipientName.trim() || !program.trim() || !duration.trim()) return false;
    if (!startDate || !endDate || !issueDate) return false;
    if (endDate <= startDate) return false;
    return true;
  }, [recipientName, program, duration, startDate, endDate, issueDate]);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setFieldErrors({});
    if (endDate <= startDate) {
      setFieldErrors({ endDate: 'end date must be after start date' });
      return;
    }
    setSubmitting(true);
    setSuccess(null);
    try {
      const res = await fetch('/api/admin/issue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type,
          recipientName: recipientName.trim(),
          recipientEmail: recipientEmail.trim() || undefined,
          program: program.trim(),
          duration: duration.trim(),
          startDate,
          endDate,
          issueDate,
          notes: notes.trim() || undefined,
        }),
      });

      if (!res.ok) {
        const data: { error?: string; issues?: IssueIssue[]; stage?: string; certNumber?: string } =
          await res.json().catch(() => ({}));
        if (data.issues && Array.isArray(data.issues)) {
          const f: Record<string, string> = {};
          for (const iss of data.issues) {
            const path = Array.isArray(iss.path) ? iss.path.join('.') : '';
            if (path && iss.message) f[path] = iss.message;
          }
          setFieldErrors(f);
        }
        const stageNote = data.stage && data.certNumber
          ? ` Cert row ${data.certNumber} was created but the ${data.stage} stage failed.`
          : '';
        setError((data.error || `request failed (${res.status})`) + stageNote);
        return;
      }

      const certNumber = res.headers.get('x-cert-number') || '';
      const signedUrl = res.headers.get('x-cert-signed-url') || '';
      const blob = await res.blob();
      const pdfBlobUrl = URL.createObjectURL(blob);

      // Trigger immediate browser download of the PDF blob.
      const a = document.createElement('a');
      a.href = pdfBlobUrl;
      a.download = `${certNumber || 'certificate'}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();

      const verifyUrl = `${window.location.origin}/c/${certNumber}`;
      setSuccess({ certNumber, signedUrl, verifyUrl, pdfBlobUrl });
    } catch (err) {
      setError((err as Error).message || 'unexpected error');
    } finally {
      setSubmitting(false);
    }
  }

  function resetForNext() {
    if (success?.pdfBlobUrl) URL.revokeObjectURL(success.pdfBlobUrl);
    setSuccess(null);
    setRecipientName('');
    setRecipientEmail('');
    setNotes('');
    // Keep program/duration/type — usually batches of similar certs.
  }

  return (
    <div className="space-y-6">
      {success ? (
        <SuccessPanel state={success} onIssueAnother={resetForNext} />
      ) : null}

      <form onSubmit={onSubmit} className="space-y-5 rounded-2xl border border-black/5 bg-white p-6 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
        {error && !success && (
          <div className="rounded-md border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}

        <Field label="Recipient name" error={fieldErrors.recipientName} required>
          <input
            type="text"
            value={recipientName}
            onChange={(e) => setRecipientName(e.target.value)}
            required
            maxLength={200}
            className="w-full rounded-md border border-black/10 px-3 py-2 text-sm outline-none focus:border-fraylon-teal focus:ring-1 focus:ring-fraylon-teal"
          />
        </Field>

        <Field label="Recipient email (optional)" error={fieldErrors.recipientEmail}>
          <input
            type="email"
            value={recipientEmail}
            onChange={(e) => setRecipientEmail(e.target.value)}
            maxLength={254}
            className="w-full rounded-md border border-black/10 px-3 py-2 text-sm outline-none focus:border-fraylon-teal focus:ring-1 focus:ring-fraylon-teal"
          />
        </Field>

        <Field label="Type" error={fieldErrors.type} required>
          <div className="flex flex-wrap gap-4 pt-1">
            {(['INT', 'WRK', 'CRS'] as const).map((t) => (
              <label key={t} className="flex items-center gap-2 text-sm text-fraylon-ink">
                <input
                  type="radio"
                  name="type"
                  value={t}
                  checked={type === t}
                  onChange={() => setType(t)}
                />
                {TYPE_LABELS[t]} <span className="text-fraylon-ink/40">({t})</span>
              </label>
            ))}
          </div>
        </Field>

        <Field label="Program" error={fieldErrors.program} required>
          <input
            type="text"
            value={program}
            onChange={(e) => setProgram(e.target.value)}
            required
            maxLength={200}
            className="w-full rounded-md border border-black/10 px-3 py-2 text-sm outline-none focus:border-fraylon-teal focus:ring-1 focus:ring-fraylon-teal"
          />
        </Field>

        <Field label="Duration" error={fieldErrors.duration} required hint='e.g. "3-Month Internship"'>
          <input
            type="text"
            value={duration}
            onChange={(e) => setDuration(e.target.value)}
            required
            maxLength={100}
            className="w-full rounded-md border border-black/10 px-3 py-2 text-sm outline-none focus:border-fraylon-teal focus:ring-1 focus:ring-fraylon-teal"
          />
        </Field>

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
          <Field label="Start date" error={fieldErrors.startDate} required>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              required
              className="w-full rounded-md border border-black/10 px-3 py-2 text-sm outline-none focus:border-fraylon-teal focus:ring-1 focus:ring-fraylon-teal"
            />
          </Field>
          <Field label="End date" error={fieldErrors.endDate} required>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              required
              className="w-full rounded-md border border-black/10 px-3 py-2 text-sm outline-none focus:border-fraylon-teal focus:ring-1 focus:ring-fraylon-teal"
            />
          </Field>
          <Field label="Date of issue" error={fieldErrors.issueDate}>
            <input
              type="date"
              value={issueDate}
              onChange={(e) => setIssueDate(e.target.value)}
              className="w-full rounded-md border border-black/10 px-3 py-2 text-sm outline-none focus:border-fraylon-teal focus:ring-1 focus:ring-fraylon-teal"
            />
          </Field>
        </div>

        <Field label="Notes (optional)" error={fieldErrors.notes} hint="Stored in metadata.notes, not shown on the certificate or verify page.">
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            maxLength={2000}
            rows={3}
            className="w-full rounded-md border border-black/10 px-3 py-2 text-sm outline-none focus:border-fraylon-teal focus:ring-1 focus:ring-fraylon-teal"
          />
        </Field>

        <div className="pt-2">
          <button
            type="submit"
            disabled={submitting || !clientSideValid}
            className="rounded-md bg-fraylon-teal px-5 py-2.5 text-sm font-medium text-white transition hover:bg-fraylon-teal-dark disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? 'Issuing… (this can take 30-60s on a cold Render container)' : 'Issue certificate'}
          </button>
        </div>
      </form>
    </div>
  );
}

function Field({
  label,
  error,
  required,
  hint,
  children,
}: {
  label: string;
  error?: string;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-fraylon-ink/60">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      {children}
      {hint && <p className="mt-1 text-[11px] text-fraylon-ink/50">{hint}</p>}
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}

function SuccessPanel({ state, onIssueAnother }: { state: SuccessState; onIssueAnother: () => void }) {
  return (
    <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-6">
      <h2 className="font-serif text-lg text-emerald-800">Issued ✓ — {state.certNumber}</h2>
      <p className="mt-1 text-sm text-emerald-700">
        PDF downloaded to your browser. The link below is valid for 7 days.
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <a
          href={state.signedUrl}
          target="_blank"
          rel="noreferrer"
          className="rounded-md bg-emerald-700 px-4 py-2 text-xs font-medium text-white hover:bg-emerald-800"
        >
          Open PDF
        </a>
        <a
          href={state.verifyUrl}
          target="_blank"
          rel="noreferrer"
          className="rounded-md border border-emerald-700 px-4 py-2 text-xs font-medium text-emerald-700 hover:bg-emerald-100"
        >
          Public verify page
        </a>
        <button
          type="button"
          onClick={onIssueAnother}
          className="rounded-md px-4 py-2 text-xs font-medium text-emerald-700 hover:bg-emerald-100"
        >
          Issue another
        </button>
      </div>
    </div>
  );
}
