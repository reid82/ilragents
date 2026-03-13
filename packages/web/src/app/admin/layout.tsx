import { redirect } from 'next/navigation';
import { getAuthenticatedUserId } from '@/lib/supabase-server';
import { getSupabaseClient } from '@/lib/supabase';
import Link from 'next/link';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const userId = await getAuthenticatedUserId();
  if (!userId) {
    redirect('/login');
  }

  const supabase = getSupabaseClient();
  const { data } = await supabase
    .from('user_profiles')
    .select('role')
    .eq('id', userId)
    .single();

  if (!data || data.role !== 'admin') {
    return (
      <div className="min-h-screen bg-zinc-950 text-white flex items-center justify-center">
        <div className="text-center space-y-4">
          <h1 className="text-2xl font-bold">403 - Access Denied</h1>
          <p className="text-zinc-400">You do not have admin access.</p>
          <Link href="/" className="text-emerald-400 hover:text-emerald-300 text-sm">
            Back to app
          </Link>
        </div>
      </div>
    );
  }

  const tabs = [
    { label: 'Overview', href: '/admin' },
    { label: 'Feedback', href: '/admin/feedback' },
    { label: 'Conversations', href: '/admin/conversations' },
    { label: 'Quality', href: '/admin/quality' },
    { label: 'Knowledge', href: '/admin/knowledge' },
    { label: 'Personas', href: '/admin/personas' },
  ];

  return (
    <div className="min-h-screen bg-zinc-950 text-white flex flex-col">
      <header className="border-b border-zinc-800 px-6 py-4">
        <div className="flex items-center justify-between mb-4">
          <h1 className="font-semibold text-lg">Admin Dashboard</h1>
          <Link href="/" className="text-zinc-400 hover:text-white text-sm transition-colors">
            Back to app
          </Link>
        </div>
        <nav className="flex gap-1">
          {tabs.map((tab) => (
            <Link
              key={tab.href}
              href={tab.href}
              className="px-4 py-2 rounded-lg text-sm text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
            >
              {tab.label}
            </Link>
          ))}
        </nav>
      </header>
      <main className="flex-1 overflow-y-auto">
        {children}
      </main>
    </div>
  );
}
