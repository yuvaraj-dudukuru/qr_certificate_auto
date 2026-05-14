import { createHmac, timingSafeEqual } from 'node:crypto';

export interface CertSignaturePayload {
  certNumber: string;
  recipientName: string;
  program: string;
  startDate: string; // ISO yyyy-mm-dd
  endDate: string;   // ISO yyyy-mm-dd
  issueDate: string; // ISO yyyy-mm-dd
}

const FIELD_SEPARATOR = '|';

function getSecret(): string {
  const secret = process.env.CERT_SIGNING_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error(
      'CERT_SIGNING_SECRET is missing or too short (expected ≥32 chars of hex).',
    );
  }
  return secret;
}

function canonicalPayload(input: CertSignaturePayload): string {
  // Strict mode: no trim, no case normalization. Any byte-level edit to a
  // signed field must fail verification — that's the whole point.
  return [
    input.certNumber,
    input.recipientName,
    input.program,
    input.startDate,
    input.endDate,
    input.issueDate,
  ].join(FIELD_SEPARATOR);
}

export function signCert(input: CertSignaturePayload): string {
  return createHmac('sha256', getSecret())
    .update(canonicalPayload(input))
    .digest('hex');
}

export function verifyCert(input: CertSignaturePayload, expected: string): boolean {
  const actual = signCert(input);
  if (actual.length !== expected.length) return false;
  try {
    return timingSafeEqual(Buffer.from(actual, 'hex'), Buffer.from(expected, 'hex'));
  } catch {
    return false;
  }
}
