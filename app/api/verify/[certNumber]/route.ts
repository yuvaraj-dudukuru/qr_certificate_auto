import { NextResponse } from 'next/server';
import { extractAndHashIp } from '@/lib/ip';
import { checkVerifyRateLimit, retryAfterSeconds, RATE_LIMIT_CONFIG } from '@/lib/rate-limit';
import { logVerification, verifyCertificate, type VerifyResult } from '@/lib/verify-cert';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

interface RouteContext {
  params: { certNumber: string };
}

function statusToHttp(status: VerifyResult['status']): number {
  return status === 'not_found' ? 404 : 200;
}

function rateLimitHeaders(reset: number, remaining: number): HeadersInit {
  return {
    'Cache-Control': 'no-store',
    'X-RateLimit-Limit': String(RATE_LIMIT_CONFIG.windowRequests),
    'X-RateLimit-Remaining': String(Math.max(0, remaining)),
    'X-RateLimit-Reset': String(Math.ceil(reset / 1000)),
  };
}

export async function GET(request: Request, { params }: RouteContext): Promise<Response> {
  const certNumber = params.certNumber;
  const ipHash = (() => {
    try {
      return extractAndHashIp(request.headers);
    } catch {
      // IP_HASH_SALT misconfigured. Don't 500 the public endpoint — just skip
      // hashing. logVerification will store ip_hash as null.
      return null;
    }
  })();
  const userAgent = request.headers.get('user-agent');

  const limit = await checkVerifyRateLimit(ipHash);
  if (!limit.allowed) {
    return NextResponse.json(
      { status: 'rate_limited', retryAfter: retryAfterSeconds(limit.reset) },
      {
        status: 429,
        headers: {
          ...rateLimitHeaders(limit.reset, limit.remaining),
          'Retry-After': String(retryAfterSeconds(limit.reset)),
        },
      },
    );
  }

  let result: VerifyResult;
  try {
    result = await verifyCertificate(certNumber);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[verify-api] verifyCertificate failed:', err);
    return NextResponse.json(
      { status: 'error', message: 'verification temporarily unavailable' },
      { status: 503, headers: rateLimitHeaders(limit.reset, limit.remaining) },
    );
  }

  // Best-effort logging. Don't await failures into the user response.
  void logVerification({
    certNumber: result.certNumber,
    result: result.status,
    ipHash,
    userAgent,
  });

  return NextResponse.json(result, {
    status: statusToHttp(result.status),
    headers: rateLimitHeaders(limit.reset, limit.remaining),
  });
}
