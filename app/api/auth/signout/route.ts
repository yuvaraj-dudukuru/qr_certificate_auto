import { NextResponse } from 'next/server';
import { createSupabaseRouteClient } from '@/lib/supabase/route';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(): Promise<Response> {
  const supabase = createSupabaseRouteClient();
  await supabase.auth.signOut();
  return NextResponse.json({ ok: true });
}
