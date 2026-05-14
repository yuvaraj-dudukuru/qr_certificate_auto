// Test-only env. Real values are loaded from .env.local in dev and from
// hosting env in prod — never from this file.
process.env.CERT_SIGNING_SECRET ??= 'a'.repeat(64); // 32-byte hex
process.env.IP_HASH_SALT ??= 'b'.repeat(32);
process.env.NEXT_PUBLIC_VERIFY_BASE_URL ??= 'https://verify.fraylontech.com';
