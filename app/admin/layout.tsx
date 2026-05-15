import Link from 'next/link';
import { redirect } from 'next/navigation';
import { isAdminEmail } from '@/lib/admin-allowlist';
import { createSupabaseRouteClient } from '@/lib/supabase/route';
import { SignOutButton } from './signout-button';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  // Middleware already enforces this — repeated here so the layout has the
  // user's email to display, and as defense in depth if middleware config
  // changes later.
  const supabase = createSupabaseRouteClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login?next=/admin');
  if (!isAdminEmail(user.email)) redirect('/login?error=' + encodeURIComponent('Account not on the admin allowlist.'));

  return (
    <div className="min-h-screen bg-fraylon-paper">
      <header className="border-b border-black/5 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
          <nav className="flex items-center gap-6">
            <Link
              href="/admin"
              className="text-xs font-medium uppercase tracking-[0.2em] text-fraylon-teal"
            >
              Fraylon Admin
            </Link>
            <Link
              href="/admin"
              className="text-sm text-fraylon-ink/70 hover:text-fraylon-teal-dark"
            >
              Dashboard
            </Link>
            <Link
              href="/admin/issue"
              className="text-sm text-fraylon-ink/70 hover:text-fraylon-teal-dark"
            >
              Issue
            </Link>
          </nav>
          <div className="flex items-center gap-3 text-xs text-fraylon-ink/60">
            <span>{user.email}</span>
            <SignOutButton />
          </div>
        </div>
      </header>
      <main>{children}</main>
    </div>
  );
}
