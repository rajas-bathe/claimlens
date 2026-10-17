import { redirect } from 'next/navigation';
import { getSession } from '@/lib/supabase/auth';
import { EmployeeLayout } from '@/components/layout/EmployeeLayout';
import { FinanceLayout } from '@/components/layout/FinanceLayout';

export const dynamic = 'force-dynamic';

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();

  if (!session) {
    redirect('/login');
  }

  if (session.membership.role === 'finance') {
    return <FinanceLayout session={session}>{children}</FinanceLayout>;
  }

  return <EmployeeLayout session={session}>{children}</EmployeeLayout>;
}
