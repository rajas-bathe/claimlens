import { redirect } from 'next/navigation';
import { getSession } from '@/lib/supabase/auth';

export default async function DashboardRedirectPage() {
  const session = await getSession();
  if (!session) redirect('/login');
  
  if (session.membership.role === 'finance') {
    redirect('/dashboard/finance/review');
  } else {
    redirect('/dashboard/expenses');
  }
}
