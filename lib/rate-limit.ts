import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

// Sliding-window limiter for /api/verify/[certNumber] and the public /c page.
// Same bucket prefix means UI + API share the 30/60s allowance per IP.

const WINDOW_REQUESTS = 30;
const WINDOW_SECONDS = 60;
const KEY_PREFIX = 'verify';
const ANON_BUCKET = 'anon'; // used when no client IP is available

let cached: Ratelimit | null = null;
let initialized = false;

function buildLimiter(): Ratelimit | null {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  const redis = new Redis({ url, token });
  return new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(WINDOW_REQUESTS, `${WINDOW_SECONDS} s`),
    analytics: false,
    prefix: KEY_PREFIX,
  });
}

function getLimiter(): Ratelimit | null {
  if (!initialized) {
    cached = buildLimiter();
    initialized = true;
  }
  return cached;
}

export interface RateLimitResult {
  /** Whether the request is allowed through. */
  allowed: boolean;
  /** Remaining quota in the current window (after this request). */
  remaining: number;
  /** Total window size. */
  limit: number;
  /** Unix ms when the window resets. */
  reset: number;
  /** True when the limiter is misconfigured / unavailable. Request was allowed through. */
  unavailable: boolean;
}

const PERMISSIVE_FALLBACK: RateLimitResult = {
  allowed: true,
  remaining: WINDOW_REQUESTS,
  limit: WINDOW_REQUESTS,
  reset: Date.now() + WINDOW_SECONDS * 1000,
  unavailable: true,
};

export async function checkVerifyRateLimit(identifier: string | null): Promise<RateLimitResult> {
  const limiter = getLimiter();
  if (!limiter) return PERMISSIVE_FALLBACK;
  try {
    const key = identifier && identifier.length > 0 ? identifier : ANON_BUCKET;
    const { success, limit, remaining, reset } = await limiter.limit(key);
    return { allowed: success, limit, remaining, reset, unavailable: false };
  } catch (err) {
    // Soft-fail: never let the limiter cause a 5xx. Log and let traffic through.
    // eslint-disable-next-line no-console
    console.warn('[rate-limit] Upstash error, allowing request:', err);
    return PERMISSIVE_FALLBACK;
  }
}

export function retryAfterSeconds(reset: number): number {
  const seconds = Math.ceil((reset - Date.now()) / 1000);
  return Math.max(1, seconds);
}

export const RATE_LIMIT_CONFIG = {
  windowRequests: WINDOW_REQUESTS,
  windowSeconds: WINDOW_SECONDS,
} as const;
