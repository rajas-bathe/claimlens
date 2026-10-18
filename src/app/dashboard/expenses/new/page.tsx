import type { Metadata } from 'next';
import { getSession } from '@/lib/supabase/auth';
import { redirect } from 'next/navigation';
import { NewExpenseForm } from '@/components/expenses/NewExpenseForm';

export const metadata: Metadata = { title: 'New Expense' };

export default async function NewExpensePage() {
  const session = await getSession();
  if (!session) redirect('/login');
  if (session.membership.role !== 'employee') redirect('/dashboard/finance/review');

  return (
    <div className="max-w-3xl">
      <div className="mb-6">
        <p className="page-kicker">A LITTLE DETAIL. A CLEARER PICTURE.</p><h1 className="text-2xl font-semibold text-gray-900">New expense</h1>
        <p className="text-sm text-gray-500 mt-1">
          Capture the receipt. Check the details. We’ll take it from there.
        </p>
      </div>
      <NewExpenseForm session={session} />
    </div>
  );
}
