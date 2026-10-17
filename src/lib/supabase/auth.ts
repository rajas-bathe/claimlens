import { createServerComponentClient } from './server';
import type { UserSession } from '@/types';

/**
 * Get the current authenticated user session with membership and company data.
 * Returns null if not authenticated or membership is missing.
 */
export async function getSession(): Promise<UserSession | null> {
  try {
    const supabase = await createServerComponentClient();
    const { data: { user }, error } = await supabase.auth.getUser();
    
    if (error || !user) return null;

    // Get membership (includes company and role)
    const { data: membership, error: membershipError } = await supabase
      .from('memberships')
      .select('*, companies(*)')
      .eq('user_id', user.id)
      .single();

    if (membershipError || !membership) return null;

    const company = (membership as Record<string, unknown>).companies as Record<string, unknown>;
    if (!company) return null;

    return {
      id: user.id,
      email: user.email ?? '',
      membership: {
        id: membership.id,
        user_id: membership.user_id,
        company_id: membership.company_id,
        role: membership.role,
        display_name: membership.display_name,
        email: membership.email,
        created_at: membership.created_at,
      },
      company: {
        id: company.id as string,
        name: company.name as string,
        slug: company.slug as string,
        settings: (company.settings as Record<string, unknown>) ?? {},
        created_at: company.created_at as string,
        updated_at: company.updated_at as string,
      },
    };
  } catch {
    return null;
  }
}

/**
 * Get session and throw if not authenticated.
 * Use in protected server actions/route handlers.
 */
export async function requireSession(): Promise<UserSession> {
  const session = await getSession();
  if (!session) {
    throw new Error('UNAUTHORIZED');
  }
  return session;
}

/**
 * Get session and throw if not finance role.
 */
export async function requireFinanceSession(): Promise<UserSession> {
  const session = await requireSession();
  if (session.membership.role !== 'finance') {
    throw new Error('FORBIDDEN');
  }
  return session;
}
