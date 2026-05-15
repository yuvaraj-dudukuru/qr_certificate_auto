// Shared certificate-issuance orchestrator.
//
// Used by:
//   /api/issue        — bearer-authed CLI / external callers
//   /api/admin/issue  — cookie-authed admin UI
//
// Both routes are thin wrappers: they handle their own auth + transport
// concerns, then call issueCertificate() with a normalized input.

import { composeBodyText } from './cert-body';
import { formatCertNumber, type CertType } from './cert-number';
import { formatLongDate } from './date-format';
import { signCert } from './hmac';
import { renderCertPdfViaService } from './puppeteer-client';
import { generateCertQr } from './qr';
import { uploadCertPdf, type UploadCertPdfResult } from './storage';
import { getServiceSupabase } from './supabase/server';

export interface IssueCertificateInput {
  type: CertType;
  year?: number;                  // defaults to current UTC year
  recipientName: string;
  recipientEmail?: string | null;
  program: string;
  duration: string;
  startDate: string;              // YYYY-MM-DD
  endDate: string;                // YYYY-MM-DD
  issueDate?: string;             // YYYY-MM-DD; defaults to today UTC
  notes?: string | null;          // stored as metadata.notes
}

export interface IssueCertificateOk {
  ok: true;
  certNumber: string;
  pdf: Buffer;
  upload: UploadCertPdfResult;
  signedUrl: string;              // alias of upload.signedUrl for convenience
  expiresAt: string;
}

export interface IssueCertificateError {
  ok: false;
  stage: 'allocate' | 'db_insert' | 'qr' | 'puppeteer' | 'storage';
  certNumber: string | null;      // null if failure was before allocation
  message: string;
}

export type IssueCertificateResult = IssueCertificateOk | IssueCertificateError;

function currentYearUtc(): number {
  return new Date().getUTCFullYear();
}

function todayIsoUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

async function allocateCertNumber(type: CertType, year: number): Promise<string> {
  const supabase = getServiceSupabase();
  const { data, error } = await supabase.rpc('next_cert_seq', {
    p_cert_type: type,
    p_year: year,
  });
  if (error) throw new Error(`next_cert_seq failed for (${type}, ${year}): ${error.message}`);
  const seq = typeof data === 'number' ? data : Number(data);
  if (!Number.isInteger(seq) || seq < 1) {
    throw new Error(`next_cert_seq returned non-integer: ${JSON.stringify(data)}`);
  }
  return formatCertNumber({ type, year, seq });
}

interface InsertRowArgs {
  certNumber: string;
  input: IssueCertificateInput;
  issueDate: string;
  signatureHash: string;
}

async function insertCertRow(args: InsertRowArgs): Promise<void> {
  const { certNumber, input, issueDate, signatureHash } = args;
  const supabase = getServiceSupabase();
  const metadata = input.notes && input.notes.length > 0 ? { notes: input.notes } : {};
  const { error } = await supabase.from('certificates').insert({
    cert_number:     certNumber,
    cert_type:       input.type,
    recipient_name:  input.recipientName,
    recipient_email: input.recipientEmail ?? null,
    program:         input.program,
    duration:        input.duration,
    start_date:      input.startDate,
    end_date:        input.endDate,
    issue_date:      issueDate,
    signature_hash:  signatureHash,
    status:          'active',
    metadata,
  });
  if (error) throw new Error(`insert certificate row failed for ${certNumber}: ${error.message}`);
}

/**
 * Issue a new certificate end-to-end.
 *
 * Failure semantics: once the DB row is inserted, downstream failures
 * (QR / Puppeteer / Storage) leave the row in place. The caller can retry
 * just the failing stage by re-rendering against the same cert_number later.
 * Errors are returned (not thrown) with the stage that failed so the HTTP
 * caller can map to an appropriate status code.
 */
export async function issueCertificate(
  input: IssueCertificateInput,
): Promise<IssueCertificateResult> {
  const year = input.year ?? currentYearUtc();
  const issueDate = input.issueDate ?? todayIsoUtc();

  let certNumber: string;
  try {
    certNumber = await allocateCertNumber(input.type, year);
  } catch (err) {
    return {
      ok: false,
      stage: 'allocate',
      certNumber: null,
      message: (err as Error).message,
    };
  }

  const signatureHash = signCert({
    certNumber,
    recipientName: input.recipientName,
    program: input.program,
    startDate: input.startDate,
    endDate: input.endDate,
    issueDate,
  });

  try {
    await insertCertRow({ certNumber, input, issueDate, signatureHash });
  } catch (err) {
    return { ok: false, stage: 'db_insert', certNumber, message: (err as Error).message };
  }

  let qrPngBase64: string;
  try {
    const qr = await generateCertQr(certNumber);
    qrPngBase64 = qr.pngBase64;
  } catch (err) {
    return { ok: false, stage: 'qr', certNumber, message: (err as Error).message };
  }

  const startLabel = formatLongDate(input.startDate);
  const endLabel = formatLongDate(input.endDate);
  const issueLabel = formatLongDate(issueDate);
  const bodyText = composeBodyText({
    type: input.type,
    program: input.program,
    duration: input.duration,
    startDateLabel: startLabel,
    endDateLabel: endLabel,
  });

  let pdf: Buffer;
  try {
    pdf = await renderCertPdfViaService({
      certNumber,
      recipientName: input.recipientName,
      bodyText,
      issueDateLabel: issueLabel,
      qrPngBase64,
    });
  } catch (err) {
    return { ok: false, stage: 'puppeteer', certNumber, message: (err as Error).message };
  }

  let upload: UploadCertPdfResult;
  try {
    upload = await uploadCertPdf(certNumber, pdf);
  } catch (err) {
    return { ok: false, stage: 'storage', certNumber, message: (err as Error).message };
  }

  return {
    ok: true,
    certNumber,
    pdf,
    upload,
    signedUrl: upload.signedUrl,
    expiresAt: upload.expiresAt,
  };
}
