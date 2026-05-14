import { describe, it, expect } from 'vitest';
import {
  formatCertNumber,
  parseCertNumber,
  isValidCertNumber,
  CertNumberError,
} from './cert-number';

describe('formatCertNumber', () => {
  it('zero-pads the sequence to 5 digits', () => {
    expect(formatCertNumber({ type: 'INT', year: 2026, seq: 42 })).toBe('FRY-INT-2026-00042');
    expect(formatCertNumber({ type: 'INT', year: 2026, seq: 1 })).toBe('FRY-INT-2026-00001');
    expect(formatCertNumber({ type: 'CRS', year: 2026, seq: 99_999 })).toBe(
      'FRY-CRS-2026-99999',
    );
  });

  it('supports all three cert types', () => {
    expect(formatCertNumber({ type: 'INT', year: 2026, seq: 1 })).toMatch(/^FRY-INT-/);
    expect(formatCertNumber({ type: 'WRK', year: 2026, seq: 1 })).toMatch(/^FRY-WRK-/);
    expect(formatCertNumber({ type: 'CRS', year: 2026, seq: 1 })).toMatch(/^FRY-CRS-/);
  });

  it('rejects invalid inputs', () => {
    // @ts-expect-error — runtime guard
    expect(() => formatCertNumber({ type: 'BOGUS', year: 2026, seq: 1 })).toThrow(CertNumberError);
    expect(() => formatCertNumber({ type: 'INT', year: 1999, seq: 1 })).toThrow(CertNumberError);
    expect(() => formatCertNumber({ type: 'INT', year: 2026, seq: 0 })).toThrow(CertNumberError);
    expect(() => formatCertNumber({ type: 'INT', year: 2026, seq: 100_000 })).toThrow(
      CertNumberError,
    );
    expect(() => formatCertNumber({ type: 'INT', year: 2026, seq: 1.5 })).toThrow(CertNumberError);
  });
});

describe('parseCertNumber', () => {
  it('round-trips with formatCertNumber', () => {
    const parts = { type: 'INT' as const, year: 2026, seq: 42 };
    expect(parseCertNumber(formatCertNumber(parts))).toEqual(parts);
  });

  it('rejects malformed strings', () => {
    const bad = [
      '',
      'FRY-INT-2026-42',         // unpadded
      'FRY-INT-2026-000042',     // too padded
      'fry-int-2026-00042',      // lowercase
      'FRY-XYZ-2026-00042',      // bad type
      'FRY-INT-26-00042',        // 2-digit year
      'FRY-INT-2026-0004A',      // non-numeric seq
      'FRY-INT-2026',            // missing seq
      'PREFIX-FRY-INT-2026-00042',
    ];
    for (const value of bad) {
      expect(() => parseCertNumber(value)).toThrow(CertNumberError);
      expect(isValidCertNumber(value)).toBe(false);
    }
  });
});

describe('isValidCertNumber', () => {
  it('returns true for valid numbers and false otherwise', () => {
    expect(isValidCertNumber('FRY-INT-2026-00001')).toBe(true);
    expect(isValidCertNumber('FRY-WRK-2099-99999')).toBe(true);
    expect(isValidCertNumber('not-a-cert')).toBe(false);
  });
});
