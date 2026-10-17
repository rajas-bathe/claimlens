import type { Metadata } from 'next';
import { getSession } from '@/lib/supabase/auth';
import { redirect } from 'next/navigation';
import { createServerComponentClient } from '@/lib/supabase/server';
import { PolicyWorkspace } from '@/components/finance/PolicyWorkspace';

export const metadata: Metadata = { title: 'Policy' };

export default async function PolicyPage() {
  const session = await getSession();
  if (!session) redirect('/login');
  if (session.membership.role !== 'finance') redirect('/dashboard/expenses');

  const supabase = await createServerComponentClient();
  const { data: versions } = await supabase
    .from('policy_versions')
    .select('*')
    .eq('company_id', session.company.id)
    .order('version_number', { ascending: false });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Policy</h1>
        <p className="text-sm text-gray-500 mt-1">
          Manage your company expense policy and structured rules.
        </p>
      </div>
      <PolicyWorkspace versions={versions ?? []} session={session} />
    </div>
  );
}
