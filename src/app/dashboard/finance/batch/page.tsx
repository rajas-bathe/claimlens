import type { Metadata } from 'next';
import { getSession } from '@/lib/supabase/auth';
import { redirect } from 'next/navigation';
import { createServerComponentClient } from '@/lib/supabase/server';
import { BatchImportWorkspace } from '@/components/finance/BatchImportWorkspace';

export const metadata: Metadata = { title: 'Batch Import' };

export default async function BatchImportPage() {
  const session = await getSession();
  if (!session) redirect('/login');
  if (session.membership.role !== 'finance') redirect('/dashboard/expenses');

  const supabase = await createServerComponentClient();
  const { data: members } = await supabase
    .from('memberships')
    .select('*')
    .eq('company_id', session.company.id)
    .eq('role', 'employee');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Batch Import</h1>
        <p className="text-sm text-gray-500 mt-1">
          Upload multiple receipts and assign them to employees.
        </p>
      </div>
      <BatchImportWorkspace members={members ?? []} session={session} />
    </div>
  );
}
