import type { Metadata } from 'next';
import { getSession } from '@/lib/supabase/auth';
import { redirect, notFound } from 'next/navigation';
import { createServerComponentClient, createServiceClient } from '@/lib/supabase/server';
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
  const serviceClient = createServiceClient();

  const { data: expense, error } = await supabase
    .from('expenses')
    .select('*')
    .eq('id', id)
    .single();

  if (error || !expense) notFound();

  // Employees can only view their own expenses
  if (session.membership.role === 'employee' && expense.employee_id !== session.id) {
    notFound();
  }

  // Fetch evaluations, events, and generate signed receipt URL in parallel
  const [{ data: evaluations }, { data: events }, signedData] = await Promise.all([
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
    expense.receipt_storage_path
      ? serviceClient.storage.from('receipts').createSignedUrl(expense.receipt_storage_path, 3600)
      : Promise.resolve({ data: null }),
  ]);

  return (
    <ExpenseDetail
      expense={expense}
      evaluations={evaluations ?? []}
      events={events ?? []}
      session={session}
      receiptUrl={signedData?.data?.signedUrl ?? null}
    />
  );
}
