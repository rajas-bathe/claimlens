import type { Metadata } from 'next';
import { getSession } from '@/lib/supabase/auth';
import { redirect } from 'next/navigation';
import { createServerComponentClient } from '@/lib/supabase/server';
import { ExpenseList } from '@/components/expenses/ExpenseList';
import Link from 'next/link';
import { Plus } from 'lucide-react';

export const metadata: Metadata = { title: 'My Expenses' };

export default async function ExpensesPage() {
  const session = await getSession();
  if (!session) redirect('/login');
  if (session.membership.role !== 'employee') redirect('/dashboard/finance/review');

  const supabase = await createServerComponentClient();
  const { data: expenses, error } = await supabase
    .from('expenses')
    .select('*')
    .eq('employee_id', session.id)
    .order('created_at', { ascending: false });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">My Expenses</h1>
          <p className="text-sm text-gray-500 mt-1">
            Submit and track your expense reimbursements.
          </p>
        </div>
        <Link
          href="/dashboard/expenses/new"
          className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 transition-colors focus-ring"
        >
          <Plus className="w-4 h-4" />
          New Expense
        </Link>
      </div>

      {error ? (
        <div className="rounded-md bg-red-50 border border-red-200 p-4">
          <p className="text-sm text-red-700">Failed to load expenses. Please refresh.</p>
        </div>
      ) : (
        <ExpenseList expenses={expenses ?? []} />
      )}
    </div>
  );
}
