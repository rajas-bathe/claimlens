import type { Metadata } from 'next';
import { getSession } from '@/lib/supabase/auth';
import { redirect, notFound } from 'next/navigation';
import { createServerComponentClient } from '@/lib/supabase/server';
import { FinanceExpenseReview } from '@/components/finance/FinanceExpenseReview';

export const metadata: Metadata = { title: 'Review Expense' };

export default async function FinanceReviewExpensePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getSession();
  if (!session) redirect('/login');
  if (session.membership.role !== 'finance') redirect('/dashboard/expenses');

  const { id } = await params;
  const supabase = await createServerComponentClient();

  const [{ data: expense }, { data: evaluations }, { data: events }] =
    await Promise.all([
      supabase
        .from('expenses')
        .select('*')
        .eq('id', id)
        .eq('company_id', session.company.id)
        .single(),
      supabase
        .from('evaluations')
        .select('*')
        .eq('expense_id', id)
        .order('evaluated_at', { ascending: false }),
      supabase
        .from('review_events')
        .select('*')
        .eq('expense_id', id)
        .order('created_at', { ascending: false }),
    ]);

  if (!expense) notFound();

  return (
    <FinanceExpenseReview
      expense={expense}
      evaluations={evaluations ?? []}
      events={events ?? []}
      session={session}
    />
  );
}
