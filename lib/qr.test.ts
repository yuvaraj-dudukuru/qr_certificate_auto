import { describe, it, expect } from 'vitest';
import { buildVerifyUrl, generateCertQr } from './qr';

const CERT = 'FRY-INT-2026-00042';
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

describe('buildVerifyUrl', () => {
  it('uses NEXT_PUBLIC_VERIFY_BASE_URL', () => {
    expect(buildVerifyUrl(CERT)).toBe(`https://verify.fraylontech.com/c/${CERT}`);
  });

  it('strips trailing slashes from the base URL', () => {
    process.env.NEXT_PUBLIC_VERIFY_BASE_URL = 'https://example.com//';
    expect(buildVerifyUrl(CERT)).toBe(`https://example.com/c/${CERT}`);
    process.env.NEXT_PUBLIC_VERIFY_BASE_URL = 'https://verify.fraylontech.com';
  });

  it('throws on malformed cert number', () => {
    expect(() => buildVerifyUrl('not-a-cert')).toThrow(/invalid cert number/i);
  });
});

describe('generateCertQr', () => {
  it('returns a PNG buffer with valid magic bytes', async () => {
    const result = await generateCertQr(CERT);
    expect(result.pngBuffer.subarray(0, 8).equals(PNG_MAGIC)).toBe(true);
    expect(result.pngBuffer.length).toBeGreaterThan(100);
  });

  it('returns base64 matching the buffer', async () => {
    const { pngBuffer, pngBase64 } = await generateCertQr(CERT);
    expect(Buffer.from(pngBase64, 'base64').equals(pngBuffer)).toBe(true);
  });

  it('encodes the public verify URL', async () => {
    const { url } = await generateCertQr(CERT);
    expect(url).toBe(`https://verify.fraylontech.com/c/${CERT}`);
  });

  it('respects custom size', async () => {
    const small = await generateCertQr(CERT, { size: 200 });
    const big = await generateCertQr(CERT, { size: 800 });
    expect(big.pngBuffer.length).toBeGreaterThan(small.pngBuffer.length);
  });
});
