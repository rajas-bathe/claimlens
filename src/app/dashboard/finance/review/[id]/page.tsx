import type { Metadata } from 'next';
import { getSession } from '@/lib/supabase/auth';
import { redirect, notFound } from 'next/navigation';
import { createServerComponentClient, createServiceClient } from '@/lib/supabase/server';
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
  const serviceClient = createServiceClient();

  const [
    { data: expense },
    { data: evaluations },
    { data: events },
    { data: queueList },
    { data: activePolicy },
  ] = await Promise.all([
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
    supabase
      .from('expenses')
      .select('id')
      .eq('company_id', session.company.id)
      .neq('review_status', 'draft')
      .order('created_at', { ascending: false }),
    supabase
      .from('policy_versions')
      .select('*')
      .eq('company_id', session.company.id)
      .eq('status', 'active')
      .single(),
  ]);

  if (!expense) notFound();

  // Secondary queries for employee, same-day expenses, and candidate duplicates
  const [
    { data: submitter },
    { data: sameDayExpenses },
    { data: candidateDuplicates },
    signedData,
  ] = await Promise.all([
    supabase
      .from('memberships')
      .select('*')
      .eq('id', expense.employee_id)
      .single(),
    expense.expense_date
      ? supabase
          .from('expenses')
          .select('*')
          .eq('company_id', session.company.id)
          .eq('employee_id', expense.employee_id)
          .eq('expense_date', expense.expense_date)
          .neq('review_status', 'draft')
      : Promise.resolve({ data: [] }),
    // Search for duplicates: exact hash or same employee + date + amount
    supabase
      .from('expenses')
      .select('*')
      .eq('company_id', session.company.id)
      .neq('id', expense.id)
      .or(
        `receipt_file_hash.eq.${expense.receipt_file_hash}${
          expense.expense_date && expense.original_amount
            ? `,and(expense_date.eq.${expense.expense_date},original_amount.eq.${expense.original_amount})`
            : ''
        }`
      ),
    expense.receipt_storage_path
      ? serviceClient.storage
          .from('receipts')
          .createSignedUrl(expense.receipt_storage_path, 3600)
      : Promise.resolve({ data: null }),
  ]);

  const receiptUrl = signedData?.data?.signedUrl ?? null;

  // Previous / Next queue navigation
  const currentIndex = (queueList ?? []).findIndex((item) => item.id === id);
  const prevId = currentIndex > 0 ? queueList![currentIndex - 1].id : null;
  const nextId =
    currentIndex >= 0 && currentIndex < (queueList?.length ?? 0) - 1
      ? queueList![currentIndex + 1].id
      : null;

  return (
    <FinanceExpenseReview
      expense={expense}
      evaluations={evaluations ?? []}
      events={events ?? []}
      session={session}
      receiptUrl={receiptUrl}
      prevId={prevId}
      nextId={nextId}
      queuePosition={
        currentIndex >= 0
          ? { current: currentIndex + 1, total: queueList?.length ?? 0 }
          : undefined
      }
      submitter={submitter ?? null}
      sameDayExpenses={sameDayExpenses ?? []}
      candidateDuplicates={candidateDuplicates ?? []}
      activePolicy={activePolicy ?? null}
    />
  );
}
