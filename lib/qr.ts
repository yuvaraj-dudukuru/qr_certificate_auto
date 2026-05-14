import QRCode from 'qrcode';
import { isValidCertNumber } from './cert-number';

const DEFAULT_VERIFY_BASE_URL = 'https://verify.fraylontech.com';

function getVerifyBaseUrl(): string {
  const fromEnv = process.env.NEXT_PUBLIC_VERIFY_BASE_URL;
  const base = (fromEnv && fromEnv.trim().length > 0 ? fromEnv : DEFAULT_VERIFY_BASE_URL).replace(
    /\/+$/,
    '',
  );
  return base;
}

export function buildVerifyUrl(certNumber: string): string {
  if (!isValidCertNumber(certNumber)) {
    throw new Error(`buildVerifyUrl: invalid cert number ${certNumber}`);
  }
  return `${getVerifyBaseUrl()}/c/${certNumber}`;
}

export interface CertQrOptions {
  /** PNG canvas size in pixels. Default 600 — large enough for crisp print. */
  size?: number;
  /** Pixel margin around the QR. `qrcode` default is 4 modules. */
  marginModules?: number;
}

export interface CertQrResult {
  url: string;
  pngBuffer: Buffer;
  pngBase64: string;
}

export async function generateCertQr(
  certNumber: string,
  options: CertQrOptions = {},
): Promise<CertQrResult> {
  const url = buildVerifyUrl(certNumber);
  const pngBuffer = await QRCode.toBuffer(url, {
    errorCorrectionLevel: 'H',
    type: 'png',
    width: options.size ?? 600,
    margin: options.marginModules ?? 1,
    color: { dark: '#000000', light: '#FFFFFF' },
  });
  return {
    url,
    pngBuffer,
    pngBase64: pngBuffer.toString('base64'),
  };
}
