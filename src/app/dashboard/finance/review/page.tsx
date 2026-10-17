import type { Metadata } from 'next';
import { getSession } from '@/lib/supabase/auth';
import { redirect } from 'next/navigation';
import { createServerComponentClient } from '@/lib/supabase/server';
import { FinanceReviewQueue } from '@/components/finance/FinanceReviewQueue';

export const metadata: Metadata = { title: 'Review Queue' };

export default async function FinanceReviewPage() {
  const session = await getSession();
  if (!session) redirect('/login');
  if (session.membership.role !== 'finance') redirect('/dashboard/expenses');

  const supabase = await createServerComponentClient();

  // Load all non-draft expenses, memberships, and evaluations
  const [
    { data: expenses, error },
    { data: memberships },
    { data: evaluations },
  ] = await Promise.all([
    supabase
      .from('expenses')
      .select('*')
      .eq('company_id', session.company.id)
      .neq('review_status', 'draft')
      .order('created_at', { ascending: false }),
    supabase
      .from('memberships')
      .select('*')
      .eq('company_id', session.company.id),
    supabase
      .from('evaluations')
      .select('*')
      .order('evaluated_at', { ascending: false }),
  ]);

  if (error) {
    return (
      <div className="rounded-md bg-red-50 border border-red-200 p-4">
        <p className="text-sm text-red-700">Failed to load review queue. Please refresh.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Review Queue</h1>
        <p className="text-sm text-gray-500 mt-1">
          Review, validate, and approve submitted claims across the organization.
        </p>
      </div>
      <FinanceReviewQueue
        expenses={expenses ?? []}
        evaluations={evaluations ?? []}
        memberships={memberships ?? []}
        session={session}
      />
    </div>
  );
}
