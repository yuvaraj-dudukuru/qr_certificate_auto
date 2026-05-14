import { isValidCertNumber } from './cert-number';
import { verifyCert, type CertSignaturePayload } from './hmac';
import { getServiceSupabase } from './supabase/server';

export type VerifyStatus = 'valid' | 'revoked' | 'tampered' | 'not_found';

export interface ValidResult {
  status: 'valid';
  certNumber: string;
  recipientName: string;
  program: string;
  duration: string;
  startDate: string;
  endDate: string;
  issueDate: string;
  issuedBy: string;
}

export interface RevokedResult {
  status: 'revoked';
  certNumber: string;
  revokedAt: string | null;
  revokeReason: string | null;
}

export interface TamperedResult {
  status: 'tampered';
  certNumber: string;
}

export interface NotFoundResult {
  status: 'not_found';
  certNumber: string;
}

export type VerifyResult = ValidResult | RevokedResult | TamperedResult | NotFoundResult;

interface CertRow {
  cert_number: string;
  recipient_name: string;
  program: string;
  duration: string;
  start_date: string;
  end_date: string;
  issue_date: string;
  issued_by: string;
  signature_hash: string;
  status: 'active' | 'revoked';
  revoke_reason: string | null;
  revoked_at: string | null;
}

const CERT_COLUMNS =
  'cert_number,recipient_name,program,duration,start_date,end_date,issue_date,issued_by,signature_hash,status,revoke_reason,revoked_at';

function notFound(certNumber: string): NotFoundResult {
  return { status: 'not_found', certNumber };
}

function toPayload(row: CertRow): CertSignaturePayload {
  return {
    certNumber: row.cert_number,
    recipientName: row.recipient_name,
    program: row.program,
    startDate: row.start_date,
    endDate: row.end_date,
    issueDate: row.issue_date,
  };
}

/**
 * Look up a certificate and decide its public verification state.
 *
 * Order of resolution:
 *   1. Malformed cert number → not_found (no DB query, no log).
 *   2. No row             → not_found.
 *   3. HMAC mismatch      → tampered (overrides status).
 *   4. status === revoked → revoked.
 *   5. status === active  → valid.
 *
 * HMAC is checked before status because a tamper on a signed field is a
 * stronger signal than a clean revoke — we want the public UI to surface it.
 */
export async function verifyCertificate(certNumber: string): Promise<VerifyResult> {
  if (!isValidCertNumber(certNumber)) {
    return notFound(certNumber);
  }

  const supabase = getServiceSupabase();
  const { data, error } = await supabase
    .from('certificates')
    .select(CERT_COLUMNS)
    .eq('cert_number', certNumber)
    .maybeSingle<CertRow>();

  if (error) {
    throw new Error(`verifyCertificate: db error for ${certNumber}: ${error.message}`);
  }
  if (!data) {
    return notFound(certNumber);
  }

  const signatureOk = verifyCert(toPayload(data), data.signature_hash);
  if (!signatureOk) {
    return { status: 'tampered', certNumber: data.cert_number };
  }

  if (data.status === 'revoked') {
    return {
      status: 'revoked',
      certNumber: data.cert_number,
      revokedAt: data.revoked_at,
      revokeReason: data.revoke_reason,
    };
  }

  return {
    status: 'valid',
    certNumber: data.cert_number,
    recipientName: data.recipient_name,
    program: data.program,
    duration: data.duration,
    startDate: data.start_date,
    endDate: data.end_date,
    issueDate: data.issue_date,
    issuedBy: data.issued_by,
  };
}

export interface LogVerificationInput {
  certNumber: string;
  result: VerifyStatus;
  ipHash: string | null;
  userAgent: string | null;
}

/**
 * Append a row to verification_logs. Fire-and-forget semantics: a failure here
 * MUST NOT break the user-visible verification flow. Errors are logged to the
 * server console only.
 *
 * Skips logging for malformed cert numbers (no useful key to record under).
 */
export async function logVerification(input: LogVerificationInput): Promise<void> {
  if (!isValidCertNumber(input.certNumber)) return;
  try {
    const supabase = getServiceSupabase();
    const { error } = await supabase.from('verification_logs').insert({
      cert_number: input.certNumber,
      result: input.result,
      ip_hash: input.ipHash,
      user_agent: input.userAgent?.slice(0, 512) ?? null,
    });
    if (error) {
      // eslint-disable-next-line no-console
      console.warn('[verify-log] insert failed:', error.message);
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[verify-log] unexpected error:', err);
  }
}
