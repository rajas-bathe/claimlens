'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import type { UserSession } from '@/types';
import { cn, getInitials } from '@/lib/utils';
import {
  LayoutDashboard,
  ClipboardList,
  FileText,
  Upload,
  LogOut,
} from 'lucide-react';
import { useState } from 'react';

const navigation = [
  { label: 'Overview', href: '/dashboard/finance/overview', icon: LayoutDashboard },
  { label: 'Review Queue', href: '/dashboard/finance/review', icon: ClipboardList },
  { label: 'Policy', href: '/dashboard/finance/policy', icon: FileText },
  { label: 'Batch Import', href: '/dashboard/finance/batch', icon: Upload },
];

export function FinanceLayout({
  children,
  session,
}: {
  children: React.ReactNode;
  session: UserSession;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);

  async function handleSignOut() {
    setSigningOut(true);
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/');
    router.refresh();
  }

  const displayName =
    session.membership.display_name || session.email.split('@')[0];

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Sidebar */}
      <aside className="w-56 bg-white border-r border-gray-200 flex-shrink-0 flex flex-col sticky top-0 h-screen">
        {/* Logo */}
        <div className="h-14 flex items-center px-4 border-b border-gray-200">
          <Link href="/dashboard/finance/overview" className="flex items-center gap-2">
            <div className="w-7 h-7 rounded bg-blue-600 flex items-center justify-center">
              <span className="text-white font-bold text-xs">CL</span>
            </div>
            <span className="font-semibold text-gray-900">ClaimLens</span>
          </Link>
        </div>

        {/* Company badge */}
        <div className="px-4 py-3 border-b border-gray-100">
          <p className="text-xs text-gray-400 uppercase tracking-wide font-medium">Workspace</p>
          <p className="text-sm font-medium text-gray-900 truncate mt-0.5">{session.company.name}</p>
          <span className="inline-block text-xs bg-amber-50 text-amber-700 border border-amber-200 rounded px-1.5 py-0.5 mt-1 font-medium">
            Finance
          </span>
        </div>

        {/* Nav */}
        <nav className="flex-1 py-3 px-2 space-y-0.5">
          {navigation.map((item) => {
            const Icon = item.icon;
            const isActive = pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex items-center gap-2.5 px-3 py-2 rounded-md text-sm font-medium transition-colors w-full',
                  isActive
                    ? 'bg-blue-50 text-blue-700'
                    : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                )}
              >
                <Icon className="w-4 h-4 flex-shrink-0" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* User */}
        <div className="border-t border-gray-200 p-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center flex-shrink-0">
              <span className="text-xs font-medium text-gray-600">
                {getInitials(displayName)}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">{displayName}</p>
              <p className="text-xs text-gray-400 truncate">{session.email}</p>
            </div>
            <button
              onClick={handleSignOut}
              disabled={signingOut}
              className="p-1.5 text-gray-400 hover:text-gray-600 rounded-md hover:bg-gray-100 transition-colors flex-shrink-0"
              title="Sign out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 min-w-0 overflow-auto">
        <div className="max-w-6xl mx-auto px-6 py-8">{children}</div>
      </main>
    </div>
  );
}
