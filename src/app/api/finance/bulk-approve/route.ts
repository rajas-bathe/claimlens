import { NextRequest, NextResponse } from 'next/server';
import { requireFinanceSession } from '@/lib/supabase/auth';
import { createServiceClient } from '@/lib/supabase/server';
import { evaluateExpensePolicy } from '@/lib/policy/engine';
import type { PolicyRule } from '@/types';

// POST /api/finance/bulk-approve
// Revalidates each selected claim on backend before applying atomic approval
export async function POST(req: NextRequest) {
  try {
    const session = await requireFinanceSession();
    const body = await req.json();
    const { expense_ids } = body;

    if (!Array.isArray(expense_ids) || expense_ids.length === 0) {
      return NextResponse.json(
        { success: false, error: 'expense_ids must be a non-empty array' },
        { status: 400 }
      );
    }

    const supabase = createServiceClient();

    // 1. Load active policy
    const { data: activePolicy } = await supabase
      .from('policy_versions')
      .select('*')
      .eq('company_id', session.company.id)
      .eq('status', 'active')
      .single();

    const rules: PolicyRule[] = (activePolicy?.structured_rules as PolicyRule[]) ?? [];

    // 2. Load historical expenses for cumulative cap and duplicate checking
    const { data: allExpenses } = await supabase
      .from('expenses')
      .select('*')
      .eq('company_id', session.company.id);

    const expenseMap = new Map((allExpenses ?? []).map((e) => [e.id, e]));

    let approvedCount = 0;
    let skippedCount = 0;
    const errors: Array<{ id: string; reason: string }> = [];

    for (const id of expense_ids) {
      const expense = expenseMap.get(id);
      if (!expense) {
        skippedCount++;
        errors.push({ id, reason: 'Expense not found in workspace' });
        continue;
      }

      if (expense.review_status !== 'ready_for_approval') {
        skippedCount++;
        errors.push({ id, reason: `Status is ${expense.review_status}, not ready_for_approval` });
        continue;
      }

      // 3. Revalidate claim deterministically on backend
      const otherExpenses = (allExpenses ?? []).filter((e) => e.id !== expense.id);
      const reval = evaluateExpensePolicy({
        expense,
        activePolicyRules: rules,
        spendingHistory: otherExpenses,
        candidateDuplicates: otherExpenses,
      });

      if (reval.overall_outcome !== 'pass') {
        skippedCount++;
        errors.push({
          id,
          reason: `Revalidation failed: overall outcome is ${reval.overall_outcome}`,
        });
        // Downgrade status to needs_review
        await supabase
          .from('expenses')
          .update({ review_status: 'needs_review' })
          .eq('id', expense.id);
        continue;
      }

      // 4. Atomic approval with version check
      const { data: updated, error: updateErr } = await supabase
        .from('expenses')
        .update({
          review_status: 'approved',
          version: expense.version + 1,
        })
        .eq('id', expense.id)
        .eq('version', expense.version) // Concurrency control
        .select()
        .single();

      if (updateErr || !updated) {
        skippedCount++;
        errors.push({ id, reason: 'Concurrent modification detected during approval' });
        continue;
      }

      // 5. Audit log
      await supabase.from('review_events').insert({
        expense_id: expense.id,
        company_id: session.company.id,
        actor_id: session.id,
        actor_role: 'finance',
        event_type: 'approved',
        payload: { bulk_operation: true },
        note: 'Approved via bulk review following backend revalidation.',
      });

      approvedCount++;
    }

    return NextResponse.json({
      success: true,
      data: {
        total_requested: expense_ids.length,
        approved: approvedCount,
        skipped: skippedCount,
        errors,
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Internal error';
    if (msg === 'UNAUTHORIZED') return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    if (msg === 'FORBIDDEN') return NextResponse.json({ success: false, error: 'Finance permission required' }, { status: 403 });
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
