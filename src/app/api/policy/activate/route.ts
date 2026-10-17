import { NextRequest, NextResponse } from 'next/server';
import { requireFinanceSession } from '@/lib/supabase/auth';
import { createServiceClient } from '@/lib/supabase/server';

// POST /api/policy/activate
// Confirms and activates a proposed policy version
export async function POST(req: NextRequest) {
  try {
    const session = await requireFinanceSession();
    const body = await req.json();
    const { policy_version_id } = body;

    if (!policy_version_id) {
      return NextResponse.json({ success: false, error: 'policy_version_id is required' }, { status: 400 });
    }

    const supabase = createServiceClient();

    // Verify policy version belongs to company
    const { data: targetVersion, error: fetchErr } = await supabase
      .from('policy_versions')
      .select('*')
      .eq('id', policy_version_id)
      .eq('company_id', session.company.id)
      .single();

    if (fetchErr || !targetVersion) {
      return NextResponse.json({ success: false, error: 'Policy version not found' }, { status: 404 });
    }

    const now = new Date().toISOString();
    const today = now.slice(0, 10);

    // 1. Mark currently active policy as superseded
    await supabase
      .from('policy_versions')
      .update({ status: 'superseded', effective_to: today })
      .eq('company_id', session.company.id)
      .eq('status', 'active');

    // 2. Activate target policy
    const { data: activated, error: activateErr } = await supabase
      .from('policy_versions')
      .update({
        status: 'active',
        confirmed_by: session.id,
        confirmed_at: now,
        effective_from: today,
      })
      .eq('id', policy_version_id)
      .select()
      .single();

    if (activateErr || !activated) {
      return NextResponse.json(
        { success: false, error: activateErr?.message ?? 'Failed to activate policy' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        activated_id: activated.id,
        version_number: activated.version_number,
        status: activated.status,
        effective_from: activated.effective_from,
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Internal error';
    if (msg === 'UNAUTHORIZED') return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    if (msg === 'FORBIDDEN') return NextResponse.json({ success: false, error: 'Finance permission required' }, { status: 403 });
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
