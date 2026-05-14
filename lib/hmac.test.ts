import { describe, it, expect } from 'vitest';
import { signCert, verifyCert, type CertSignaturePayload } from './hmac';

const FIXTURE: CertSignaturePayload = {
  certNumber: 'FRY-INT-2026-00042',
  recipientName: 'Ada Lovelace',
  program: 'Web Development',
  startDate: '2026-02-01',
  endDate: '2026-04-30',
  issueDate: '2026-05-14',
};

describe('signCert', () => {
  it('is deterministic for identical input', () => {
    expect(signCert(FIXTURE)).toBe(signCert(FIXTURE));
  });

  it('produces a 64-char hex digest', () => {
    const sig = signCert(FIXTURE);
    expect(sig).toMatch(/^[0-9a-f]{64}$/);
  });

  it('throws when CERT_SIGNING_SECRET is missing', () => {
    const prior = process.env.CERT_SIGNING_SECRET;
    delete process.env.CERT_SIGNING_SECRET;
    expect(() => signCert(FIXTURE)).toThrow(/CERT_SIGNING_SECRET/);
    process.env.CERT_SIGNING_SECRET = prior;
  });
});

describe('verifyCert — strict tamper detection', () => {
  const validSig = signCert(FIXTURE);

  it('verifies matching payload + signature', () => {
    expect(verifyCert(FIXTURE, validSig)).toBe(true);
  });

  it('fails when recipientName casing changes', () => {
    expect(verifyCert({ ...FIXTURE, recipientName: 'ada lovelace' }, validSig)).toBe(false);
  });

  it('fails when recipientName has leading whitespace', () => {
    expect(verifyCert({ ...FIXTURE, recipientName: ' Ada Lovelace' }, validSig)).toBe(false);
  });

  it('fails when any signed field changes', () => {
    const mutations: Array<Partial<CertSignaturePayload>> = [
      { certNumber: 'FRY-INT-2026-00043' },
      { program: 'Web Dev' },
      { startDate: '2026-02-02' },
      { endDate: '2026-05-01' },
      { issueDate: '2026-05-15' },
    ];
    for (const patch of mutations) {
      expect(verifyCert({ ...FIXTURE, ...patch }, validSig)).toBe(false);
    }
  });

  it('fails on malformed signature without throwing', () => {
    expect(verifyCert(FIXTURE, 'not-hex')).toBe(false);
    expect(verifyCert(FIXTURE, '')).toBe(false);
    expect(verifyCert(FIXTURE, 'ab'.repeat(32))).toBe(false);
  });
});
