import { getServiceSupabase } from './supabase/server';

const BUCKET = 'certificates';
const DEFAULT_SIGNED_URL_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days (admin issuance flow)
const SHORT_SIGNED_URL_TTL_SECONDS = 5 * 60;             // 5 minutes (public download button)

export const STORAGE_TTL = {
  DEFAULT: DEFAULT_SIGNED_URL_TTL_SECONDS,
  SHORT:   SHORT_SIGNED_URL_TTL_SECONDS,
} as const;

function pathFor(certNumber: string): string {
  return `${certNumber}.pdf`;
}

export interface UploadCertPdfResult {
  path: string;        // full path inside the bucket (e.g. 'FRY-INT-2026-00004.pdf')
  signedUrl: string;   // 7-day signed URL for download
  expiresAt: string;   // ISO timestamp of signed-URL expiry
}

/**
 * Upload a cert PDF to Supabase Storage (idempotent — overwrites if present)
 * and return a 7-day signed URL.
 *
 * Service-role only. The bucket is private; signed URLs are the only public
 * access path.
 */
export async function uploadCertPdf(
  certNumber: string,
  pdf: Buffer,
  ttlSeconds: number = DEFAULT_SIGNED_URL_TTL_SECONDS,
): Promise<UploadCertPdfResult> {
  const supabase = getServiceSupabase();
  const path = pathFor(certNumber);

  const { error: upErr } = await supabase.storage
    .from(BUCKET)
    .upload(path, pdf, {
      contentType: 'application/pdf',
      upsert: true,
      cacheControl: 'no-store',
    });
  if (upErr) {
    throw new Error(`storage upload failed for ${path}: ${upErr.message}`);
  }

  const { data: signed, error: signErr } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, ttlSeconds);
  if (signErr || !signed?.signedUrl) {
    throw new Error(
      `storage sign failed for ${path}: ${signErr?.message ?? 'no signedUrl in response'}`,
    );
  }

  return {
    path,
    signedUrl: signed.signedUrl,
    expiresAt: new Date(Date.now() + ttlSeconds * 1000).toISOString(),
  };
}

/**
 * Recreate a signed URL for an existing PDF without re-uploading. Returns
 * null if the object isn't in Storage (e.g. cert exists in DB but PDF was
 * never generated, or got deleted).
 */
export async function getCertPdfSignedUrl(
  certNumber: string,
  ttlSeconds: number = DEFAULT_SIGNED_URL_TTL_SECONDS,
): Promise<UploadCertPdfResult | null> {
  const supabase = getServiceSupabase();
  const path = pathFor(certNumber);

  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, ttlSeconds);
  if (error) {
    // Storage returns 400 "Object not found" — treat as missing, not error.
    if (/not.found/i.test(error.message)) return null;
    throw new Error(`storage sign failed for ${path}: ${error.message}`);
  }
  if (!data?.signedUrl) return null;

  return {
    path,
    signedUrl: data.signedUrl,
    expiresAt: new Date(Date.now() + ttlSeconds * 1000).toISOString(),
  };
}
