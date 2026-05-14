export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center px-6 py-16">
      <h1 className="font-serif text-3xl text-fraylon-teal">Fraylon Certificate Verification</h1>
      <p className="mt-4 text-sm text-fraylon-ink/70">
        To verify a certificate, scan the QR code on it or open{' '}
        <code className="rounded bg-black/5 px-1.5 py-0.5 text-xs">/c/&lt;cert-number&gt;</code>{' '}
        with the ID printed on the certificate (e.g.{' '}
        <code className="rounded bg-black/5 px-1.5 py-0.5 text-xs">FRY-INT-2026-00042</code>).
      </p>
      <p className="mt-3 text-xs text-fraylon-ink/50">
        Issues? Contact{' '}
        <a className="text-fraylon-teal" href="mailto:internship@fraylontech.com">
          internship@fraylontech.com
        </a>
        .
      </p>
    </main>
  );
}
