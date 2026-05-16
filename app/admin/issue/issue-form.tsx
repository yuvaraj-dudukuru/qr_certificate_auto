'use client';

import { useMemo, useState, type FormEvent } from 'react';
import { useToast } from '../_components/toast';

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

const INPUT_CLASS =
  'w-full min-h-[44px] rounded-lg border border-black/10 bg-white px-3.5 py-2.5 text-sm shadow-sm outline-none transition-colors placeholder:text-fraylon-ink/40 focus-visible:border-fraylon-teal focus-visible:ring-2 focus-visible:ring-fraylon-teal/30 disabled:cursor-not-allowed disabled:opacity-60';

export function IssueForm() {
  const toast = useToast();
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
        const msg = (data.error || `request failed (${res.status})`) + stageNote;
        setError(msg);
        toast.show(msg, 'error');
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
      toast.show(`Issued ${certNumber}. PDF downloaded.`, 'success');
    } catch (err) {
      const msg = (err as Error).message || 'unexpected error';
      setError(msg);
      toast.show(msg, 'error');
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

      <form onSubmit={onSubmit} className="space-y-5 rounded-2xl border border-black/5 bg-white p-5 shadow-sm sm:p-7">
        {error && !success && (
          <div role="alert" className="rounded-lg border border-red-100 bg-red-50 px-3.5 py-2.5 text-sm text-red-700">
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
            className={INPUT_CLASS}
          />
        </Field>

        <Field label="Recipient email (optional)" error={fieldErrors.recipientEmail}>
          <input
            type="email"
            value={recipientEmail}
            onChange={(e) => setRecipientEmail(e.target.value)}
            maxLength={254}
            className={INPUT_CLASS}
          />
        </Field>

        <Field label="Type" error={fieldErrors.type} required>
          <div className="flex flex-wrap gap-2 pt-1">
            {(['INT', 'WRK', 'CRS'] as const).map((t) => (
              <label
                key={t}
                className={`inline-flex min-h-[40px] cursor-pointer items-center gap-2 rounded-full border px-4 text-sm transition-colors focus-within:ring-2 focus-within:ring-fraylon-teal/40 ${
                  type === t
                    ? 'border-fraylon-teal bg-fraylon-teal/10 text-fraylon-teal-dark font-medium'
                    : 'border-black/10 bg-white text-fraylon-ink/70 hover:border-fraylon-teal/40 hover:bg-fraylon-paper'
                }`}
              >
                <input
                  type="radio"
                  name="type"
                  value={t}
                  checked={type === t}
                  onChange={() => setType(t)}
                  className="sr-only"
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
            className={INPUT_CLASS}
          />
        </Field>

        <Field label="Duration" error={fieldErrors.duration} required hint='e.g. "3-Month Internship"'>
          <input
            type="text"
            value={duration}
            onChange={(e) => setDuration(e.target.value)}
            required
            maxLength={100}
            className={INPUT_CLASS}
          />
        </Field>

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
          <Field label="Start date" error={fieldErrors.startDate} required>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              required
              className={INPUT_CLASS}
            />
          </Field>
          <Field label="End date" error={fieldErrors.endDate} required>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              required
              className={INPUT_CLASS}
            />
          </Field>
          <Field label="Date of issue" error={fieldErrors.issueDate}>
            <input
              type="date"
              value={issueDate}
              onChange={(e) => setIssueDate(e.target.value)}
              className={INPUT_CLASS}
            />
          </Field>
        </div>

        <Field label="Notes (optional)" error={fieldErrors.notes} hint="Stored in metadata.notes, not shown on the certificate or verify page.">
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            maxLength={2000}
            rows={3}
            className={`${INPUT_CLASS} min-h-[88px] resize-y`}
          />
        </Field>

        <div className="pt-2">
          <button
            type="submit"
            disabled={submitting || !clientSideValid}
            className="inline-flex w-full min-h-[48px] items-center justify-center rounded-lg bg-fraylon-teal px-5 py-3 text-sm font-medium text-white shadow-sm transition-all hover:-translate-y-0.5 hover:bg-fraylon-teal-dark hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fraylon-teal focus-visible:ring-offset-2 disabled:translate-y-0 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:shadow-sm sm:w-auto"
          >
            {submitting ? (
              <>
                <Spinner />
                <span>Issuing… (can take 30-60s on a cold container)</span>
              </>
            ) : (
              'Issue certificate'
            )}
          </button>
        </div>
      </form>
    </div>
  );
}

function Spinner() {
  return (
    <svg
      className="mr-2 h-4 w-4 animate-spin"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.25" strokeWidth="4" />
      <path
        d="M4 12a8 8 0 018-8"
        stroke="currentColor"
        strokeWidth="4"
        strokeLinecap="round"
      />
    </svg>
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
      <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-fraylon-ink/60">
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
    <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-5 sm:p-6">
      <h2 className="font-serif text-lg text-emerald-800">Issued ✓ — {state.certNumber}</h2>
      <p className="mt-1 text-sm text-emerald-700">
        PDF downloaded to your browser. The link below is valid for 7 days.
      </p>
      <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-3">
        <a
          href={state.signedUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex min-h-[44px] items-center justify-center rounded-md bg-emerald-700 px-4 text-xs font-medium text-white transition-colors hover:bg-emerald-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 focus-visible:ring-offset-2"
        >
          Open PDF
        </a>
        <a
          href={state.verifyUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex min-h-[44px] items-center justify-center rounded-md border border-emerald-700 px-4 text-xs font-medium text-emerald-700 transition-colors hover:bg-emerald-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"
        >
          Public verify page
        </a>
        <button
          type="button"
          onClick={onIssueAnother}
          className="inline-flex min-h-[44px] items-center justify-center rounded-md px-4 text-xs font-medium text-emerald-700 transition-colors hover:bg-emerald-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"
        >
          Issue another
        </button>
      </div>
    </div>
  );
}
