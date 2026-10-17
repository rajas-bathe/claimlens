'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import type { UserSession } from '@/types';
import { cn, getInitials } from '@/lib/utils';
import {
  ReceiptText,
  Plus,
  LogOut,
  ChevronDown,
} from 'lucide-react';
import { useState } from 'react';

const navigation = [
  { label: 'My Expenses', href: '/dashboard/expenses', icon: ReceiptText },
];

export function EmployeeLayout({
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
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Top Nav */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-30">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          {/* Logo */}
          <Link href="/dashboard/expenses" className="flex items-center gap-2">
            <div className="w-7 h-7 rounded bg-blue-600 flex items-center justify-center flex-shrink-0">
              <span className="text-white font-bold text-xs">CL</span>
            </div>
            <span className="font-semibold text-gray-900 hidden sm:block">ClaimLane</span>
          </Link>

          {/* Nav links */}
          <nav className="flex items-center gap-1">
            {navigation.map((item) => {
              const Icon = item.icon;
              const isActive = pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors',
                    isActive
                      ? 'bg-blue-50 text-blue-700'
                      : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                  )}
                >
                  <Icon className="w-4 h-4" />
                  {item.label}
                </Link>
              );
            })}
          </nav>

          {/* User menu */}
          <div className="flex items-center gap-3">
            <Link
              href="/dashboard/expenses/new"
              className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              New
            </Link>
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-full bg-gray-200 flex items-center justify-center flex-shrink-0">
                <span className="text-xs font-medium text-gray-600">
                  {getInitials(displayName)}
                </span>
              </div>
              <span className="text-sm text-gray-700 hidden sm:block truncate max-w-[120px]">
                {displayName}
              </span>
              <button
                onClick={handleSignOut}
                disabled={signingOut}
                className="p-1.5 text-gray-400 hover:text-gray-600 rounded-md hover:bg-gray-100 transition-colors"
                title="Sign out"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main */}
      <main className="flex-1">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">{children}</div>
      </main>
    </div>
  );
}
