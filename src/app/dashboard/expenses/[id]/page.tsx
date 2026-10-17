import type { Metadata } from 'next';
import { getSession } from '@/lib/supabase/auth';
import { redirect, notFound } from 'next/navigation';
import { createServerComponentClient } from '@/lib/supabase/server';
import { ExpenseDetail } from '@/components/expenses/ExpenseDetail';

export const metadata: Metadata = { title: 'Expense Details' };

export default async function ExpenseDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getSession();
  if (!session) redirect('/login');

  const { id } = await params;
  const supabase = await createServerComponentClient();

  const { data: expense, error } = await supabase
    .from('expenses')
    .select('*')
    .eq('id', id)
    .single();

  if (error || !expense) notFound();

  // Employees can only view their own expenses (RLS enforces this; explicit check for UX)
  if (session.membership.role === 'employee' && expense.employee_id !== session.id) {
    notFound();
  }

  // Fetch evaluations and review events
  const [{ data: evaluations }, { data: events }] = await Promise.all([
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

  return (
    <ExpenseDetail
      expense={expense}
      evaluations={evaluations ?? []}
      events={events ?? []}
      session={session}
    />
  );
}
