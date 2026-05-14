export type CertType = 'INT' | 'WRK' | 'CRS';

export const CERT_TYPES: readonly CertType[] = ['INT', 'WRK', 'CRS'] as const;

const CERT_NUMBER_RE = /^FRY-(INT|WRK|CRS)-(\d{4})-(\d{5})$/;
const SEQ_MIN = 1;
const SEQ_MAX = 99_999;
const YEAR_MIN = 2024;
const YEAR_MAX = 2099;

export interface CertNumberParts {
  type: CertType;
  year: number;
  seq: number;
}

export class CertNumberError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CertNumberError';
  }
}

export function isCertType(value: string): value is CertType {
  return (CERT_TYPES as readonly string[]).includes(value);
}

export function formatCertNumber(parts: CertNumberParts): string {
  const { type, year, seq } = parts;
  if (!isCertType(type)) {
    throw new CertNumberError(`Invalid cert type: ${type}`);
  }
  if (!Number.isInteger(year) || year < YEAR_MIN || year > YEAR_MAX) {
    throw new CertNumberError(`Invalid year: ${year}`);
  }
  if (!Number.isInteger(seq) || seq < SEQ_MIN || seq > SEQ_MAX) {
    throw new CertNumberError(`Invalid sequence: ${seq} (must be ${SEQ_MIN}–${SEQ_MAX})`);
  }
  return `FRY-${type}-${year}-${String(seq).padStart(5, '0')}`;
}

export function parseCertNumber(value: string): CertNumberParts {
  const match = CERT_NUMBER_RE.exec(value);
  if (!match) {
    throw new CertNumberError(`Malformed cert number: ${value}`);
  }
  const [, type, year, seq] = match;
  const parts: CertNumberParts = {
    type: type as CertType,
    year: Number(year),
    seq: Number(seq),
  };
  // Validate the parsed values through the same gauntlet as format(),
  // so out-of-range years (regex allows 0000–9999) get caught.
  return { ...parts, ...formatCertNumberValidates(parts) };
}

function formatCertNumberValidates(parts: CertNumberParts): CertNumberParts {
  formatCertNumber(parts);
  return parts;
}

export function isValidCertNumber(value: string): boolean {
  try {
    parseCertNumber(value);
    return true;
  } catch {
    return false;
  }
}
