import { LoginForm } from '@/components/auth/LoginForm';
import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Sign in' };
export const dynamic = 'force-dynamic';

export default function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex items-center justify-center gap-2 mb-8">
          <div className="w-8 h-8 rounded-md bg-blue-600 flex items-center justify-center">
            <span className="text-white font-bold text-sm">CL</span>
          </div>
          <span className="font-semibold text-gray-900 text-lg">ClaimLens</span>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg p-8 shadow-sm">
          <h1 className="text-xl font-semibold text-gray-900 mb-1">Sign in</h1>
          <p className="text-sm text-gray-500 mb-6">Enter your work email to continue.</p>
          <LoginForm searchParams={searchParams} />
        </div>

        <p className="mt-6 text-center text-xs text-gray-400">
          <Link href="/" className="hover:text-gray-600 transition-colors">
            ← Back to home
          </Link>
        </p>
      </div>
    </div>
  );
}
