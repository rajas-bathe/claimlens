import type { Metadata } from 'next';
import { getSession } from '@/lib/supabase/auth';
import { redirect } from 'next/navigation';
import { createServerComponentClient } from '@/lib/supabase/server';
import { FinanceOverviewDashboard } from '@/components/finance/FinanceOverviewDashboard';

export const metadata: Metadata = { title: 'Finance Overview' };

export default async function FinanceOverviewPage() {
  const session = await getSession();
  if (!session) redirect('/login');
  if (session.membership.role !== 'finance') redirect('/dashboard/expenses');

  const supabase = await createServerComponentClient();

  // Load all expenses, evaluations, policy versions, and memberships for this company
  const [
    { data: expenses, error: expensesError },
    { data: evaluations },
    { data: memberships },
    { data: policyVersions },
  ] = await Promise.all([
    supabase
      .from('expenses')
      .select('*')
      .eq('company_id', session.company.id)
      .order('created_at', { ascending: false }),
    supabase
      .from('evaluations')
      .select('*')
      .order('evaluated_at', { ascending: false }),
    supabase
      .from('memberships')
      .select('*')
      .eq('company_id', session.company.id),
    supabase
      .from('policy_versions')
      .select('*')
      .eq('company_id', session.company.id)
      .order('version_number', { ascending: false }),
  ]);

  if (expensesError) {
    return (
      <div className="rounded-md bg-red-50 border border-red-200 p-4">
        <p className="text-sm text-red-700">Failed to load finance overview. Please refresh.</p>
      </div>
    );
  }

  return (
    <FinanceOverviewDashboard
      expenses={expenses ?? []}
      evaluations={evaluations ?? []}
      memberships={memberships ?? []}
      policyVersions={policyVersions ?? []}
      session={session}
    />
  );
}
