import { describe, it, expect } from 'vitest';
import { extractClientIp, extractAndHashIp, hashIp } from './ip';

function headers(init: Record<string, string>): Headers {
  return new Headers(init);
}

describe('extractClientIp', () => {
  it('takes the left-most entry from x-forwarded-for', () => {
    expect(extractClientIp(headers({ 'x-forwarded-for': '203.0.113.7, 10.0.0.1' }))).toBe(
      '203.0.113.7',
    );
  });

  it('trims whitespace', () => {
    expect(extractClientIp(headers({ 'x-forwarded-for': '   203.0.113.7  ' }))).toBe('203.0.113.7');
  });

  it('falls back to x-real-ip when no x-forwarded-for', () => {
    expect(extractClientIp(headers({ 'x-real-ip': '203.0.113.9' }))).toBe('203.0.113.9');
  });

  it('returns null when neither header is set', () => {
    expect(extractClientIp(headers({}))).toBeNull();
  });

  it('returns null on empty x-forwarded-for', () => {
    expect(extractClientIp(headers({ 'x-forwarded-for': '' }))).toBeNull();
  });
});

describe('hashIp', () => {
  it('is deterministic for the same input', () => {
    expect(hashIp('203.0.113.7')).toBe(hashIp('203.0.113.7'));
  });

  it('produces a 64-char hex digest', () => {
    expect(hashIp('203.0.113.7')).toMatch(/^[0-9a-f]{64}$/);
  });

  it('changes with the salt (different IPs hash differently)', () => {
    expect(hashIp('203.0.113.7')).not.toBe(hashIp('203.0.113.8'));
  });

  it('throws when IP_HASH_SALT is missing', () => {
    const prior = process.env.IP_HASH_SALT;
    delete process.env.IP_HASH_SALT;
    expect(() => hashIp('203.0.113.7')).toThrow(/IP_HASH_SALT/);
    process.env.IP_HASH_SALT = prior;
  });
});

describe('extractAndHashIp', () => {
  it('returns null when no IP header is present', () => {
    expect(extractAndHashIp(headers({}))).toBeNull();
  });

  it('returns a hex digest when an IP is present', () => {
    expect(extractAndHashIp(headers({ 'x-forwarded-for': '203.0.113.7' }))).toMatch(
      /^[0-9a-f]{64}$/,
    );
  });
});
