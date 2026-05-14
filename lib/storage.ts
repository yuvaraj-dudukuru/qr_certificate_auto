import { getServiceSupabase } from './supabase/server';

const BUCKET = 'certificates';
const SIGNED_URL_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days

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
    .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
  if (signErr || !signed?.signedUrl) {
    throw new Error(
      `storage sign failed for ${path}: ${signErr?.message ?? 'no signedUrl in response'}`,
    );
  }

  return {
    path,
    signedUrl: signed.signedUrl,
    expiresAt: new Date(Date.now() + SIGNED_URL_TTL_SECONDS * 1000).toISOString(),
  };
}

/**
 * Recreate a signed URL for an existing PDF without re-uploading. Returns
 * null if the object isn't in Storage (e.g. cert exists in DB but PDF was
 * never generated, or got deleted).
 */
export async function getCertPdfSignedUrl(certNumber: string): Promise<UploadCertPdfResult | null> {
  const supabase = getServiceSupabase();
  const path = pathFor(certNumber);

  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
  if (error) {
    // Storage returns 400 "Object not found" — treat as missing, not error.
    if (/not.found/i.test(error.message)) return null;
    throw new Error(`storage sign failed for ${path}: ${error.message}`);
  }
  if (!data?.signedUrl) return null;

  return {
    path,
    signedUrl: data.signedUrl,
    expiresAt: new Date(Date.now() + SIGNED_URL_TTL_SECONDS * 1000).toISOString(),
  };
}
