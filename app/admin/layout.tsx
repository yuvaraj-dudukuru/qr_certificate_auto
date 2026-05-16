import { redirect } from 'next/navigation';
import { isAdminEmail } from '@/lib/admin-allowlist';
import { createSupabaseRouteClient } from '@/lib/supabase/route';
import { AdminNav } from './_components/admin-nav';
import { ToastProvider } from './_components/toast';

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
      <ToastProvider>
        <AdminNav email={user.email ?? ''} />
        <main>{children}</main>
      </ToastProvider>
    </div>
  );
}
