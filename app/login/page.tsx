import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { createSupabaseRouteClient } from '@/lib/supabase/route';
import { isAdminEmail } from '@/lib/admin-allowlist';
import { LoginForm } from './login-form';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export const metadata: Metadata = {
  title: 'Sign in · Fraylon Admin',
  robots: { index: false, follow: false },
};

interface PageProps {
  searchParams: { next?: string; error?: string };
}

export default async function LoginPage({ searchParams }: PageProps) {
  // Already signed in + allowlisted? Skip the form.
  const supabase = createSupabaseRouteClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (user && isAdminEmail(user.email)) {
    redirect(searchParams.next || '/admin');
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-fraylon-paper px-4 py-10">
      <section className="w-full max-w-sm rounded-2xl border border-black/5 bg-white p-8 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_24px_-12px_rgba(15,42,58,0.18)]">
        <header className="mb-6 text-center">
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-fraylon-teal">
            Fraylon
          </p>
          <h1 className="mt-1 font-serif text-2xl text-fraylon-teal-dark">Admin sign in</h1>
        </header>
        <LoginForm next={searchParams.next} initialError={searchParams.error} />
        <p className="mt-6 text-center text-[11px] text-fraylon-ink/50">
          Access is restricted to allowlisted Fraylon emails.
        </p>
      </section>
    </main>
  );
}
