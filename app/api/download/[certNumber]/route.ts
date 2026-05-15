import { NextResponse } from 'next/server';
import { extractAndHashIp } from '@/lib/ip';
import { checkVerifyRateLimit, retryAfterSeconds, RATE_LIMIT_CONFIG } from '@/lib/rate-limit';
import { getCertPdfSignedUrl, STORAGE_TTL } from '@/lib/storage';
import { verifyCertificate } from '@/lib/verify-cert';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

interface RouteContext {
  params: { certNumber: string };
}

function rateLimitHeaders(reset: number, remaining: number): HeadersInit {
  return {
    'Cache-Control': 'no-store',
    'X-RateLimit-Limit': String(RATE_LIMIT_CONFIG.windowRequests),
    'X-RateLimit-Remaining': String(Math.max(0, remaining)),
    'X-RateLimit-Reset': String(Math.ceil(reset / 1000)),
  };
}

// Issues a fresh 5-minute signed Storage URL for a cert PDF, provided the
// cert is currently in the "valid" state. Revoked / tampered / not-found
// certs do NOT get a download link — the public verify page suppresses the
// button for those states, and this endpoint refuses to mint URLs for them
// as defense in depth.
//
// Rate limit shares the verify bucket: 30 requests / 60s per IP across
// /api/verify, /c, and /api/download — a scraper hitting all three counts
// against the same allowance.
export async function GET(request: Request, { params }: RouteContext): Promise<Response> {
  const ipHash = (() => {
    try {
      return extractAndHashIp(request.headers);
    } catch {
      return null;
    }
  })();

  const limit = await checkVerifyRateLimit(ipHash);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: 'rate_limited', retryAfter: retryAfterSeconds(limit.reset) },
      {
        status: 429,
        headers: {
          ...rateLimitHeaders(limit.reset, limit.remaining),
          'Retry-After': String(retryAfterSeconds(limit.reset)),
        },
      },
    );
  }

  let result;
  try {
    result = await verifyCertificate(params.certNumber);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[download] verifyCertificate failed:', err);
    return NextResponse.json(
      { error: 'verification temporarily unavailable' },
      { status: 503, headers: rateLimitHeaders(limit.reset, limit.remaining) },
    );
  }

  if (result.status === 'not_found') {
    return NextResponse.json(
      { error: 'not_found' },
      { status: 404, headers: rateLimitHeaders(limit.reset, limit.remaining) },
    );
  }
  if (result.status === 'revoked' || result.status === 'tampered') {
    return NextResponse.json(
      { error: result.status },
      { status: 403, headers: rateLimitHeaders(limit.reset, limit.remaining) },
    );
  }
  // status === 'valid'

  let signed;
  try {
    signed = await getCertPdfSignedUrl(result.certNumber, STORAGE_TTL.SHORT);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[download] storage sign failed:', err);
    return NextResponse.json(
      { error: 'download temporarily unavailable' },
      { status: 503, headers: rateLimitHeaders(limit.reset, limit.remaining) },
    );
  }
  if (!signed) {
    // Cert is valid in DB but no PDF was uploaded (e.g. issuance failed at
    // the puppeteer stage and the row was kept per the failure policy).
    return NextResponse.json(
      { error: 'pdf_not_generated' },
      { status: 404, headers: rateLimitHeaders(limit.reset, limit.remaining) },
    );
  }

  return NextResponse.json(
    {
      url: signed.signedUrl,
      expiresAt: signed.expiresAt,
      certNumber: result.certNumber,
    },
    { status: 200, headers: rateLimitHeaders(limit.reset, limit.remaining) },
  );
}
