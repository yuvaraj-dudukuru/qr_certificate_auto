import { createHash } from 'node:crypto';

// Extract the caller's IP from common proxy headers. Vercel populates
// x-forwarded-for; if it's a list we take the left-most entry (the original
// client). Returns null when nothing usable is present — callers should
// degrade gracefully (rate-limit by a constant bucket, log with null ip_hash).
export function extractClientIp(headers: Headers): string | null {
  const forwarded = headers.get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim();
    if (first) return first;
  }
  const real = headers.get('x-real-ip');
  if (real) {
    const trimmed = real.trim();
    if (trimmed) return trimmed;
  }
  return null;
}

// sha256(ip || IP_HASH_SALT). 64-char hex. Raw IPs MUST NOT hit disk.
export function hashIp(ip: string): string {
  const salt = process.env.IP_HASH_SALT;
  if (!salt || salt.length < 16) {
    throw new Error('IP_HASH_SALT is missing or too short (expected ≥16 hex chars).');
  }
  return createHash('sha256').update(ip).update(salt).digest('hex');
}

export function extractAndHashIp(headers: Headers): string | null {
  const ip = extractClientIp(headers);
  return ip ? hashIp(ip) : null;
}
