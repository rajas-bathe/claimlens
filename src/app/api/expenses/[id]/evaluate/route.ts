import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/supabase/auth';
import { createServiceClient } from '@/lib/supabase/server';
import { evaluateExpensePolicy } from '@/lib/policy/engine';
import type { PolicyRule } from '@/types';

// POST /api/expenses/[id]/evaluate
// Deterministically evaluates an expense against the active policy rules
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireSession();
    const { id } = await params;
    const supabase = createServiceClient();

    // 1. Load target expense
    const { data: expense, error: expenseErr } = await supabase
      .from('expenses')
      .select('*')
      .eq('id', id)
      .single();

    if (expenseErr || !expense) {
      return NextResponse.json({ success: false, error: 'Expense not found' }, { status: 404 });
    }

    // 2. Load active policy version for company
    const { data: activePolicy } = await supabase
      .from('policy_versions')
      .select('*')
      .eq('company_id', expense.company_id)
      .eq('status', 'active')
      .single();

    const rules: PolicyRule[] = (activePolicy?.structured_rules as PolicyRule[]) ?? [];

    // 3. Load historical candidate expenses for duplicate check & accumulation
    const { data: history } = await supabase
      .from('expenses')
      .select('*')
      .eq('company_id', expense.company_id)
      .neq('id', expense.id)
      .order('expense_date', { ascending: false });

    // 4. Run Deterministic Policy Engine
    const evalResult = evaluateExpensePolicy({
      expense,
      activePolicyRules: rules,
      spendingHistory: history ?? [],
      candidateDuplicates: history ?? [],
    });

    // 5. Save Evaluation Record
    const { data: evaluation, error: evalSaveErr } = await supabase
      .from('evaluations')
      .insert({
        expense_id: expense.id,
        policy_version_id: activePolicy?.id ?? null,
        evaluator_version: '1.0.0',
        inputs_snapshot: {
          merchant: expense.merchant,
          expense_date: expense.expense_date,
          original_amount: expense.original_amount,
          original_currency: expense.original_currency,
          category: expense.category,
          city: expense.city,
          trip_context: expense.trip_context,
          client_name: expense.client_name,
          attendee_count: expense.attendee_count,
        },
        rule_results: evalResult.rule_results,
        overall_outcome: evalResult.overall_outcome,
        reimbursable_amount: evalResult.reimbursable_amount,
        reimbursable_currency: evalResult.reimbursable_currency,
        duplicate_findings: evalResult.duplicate_findings,
        spending_context: evalResult.spending_context,
      })
      .select()
      .single();

    if (evalSaveErr || !evaluation) {
      return NextResponse.json(
        { success: false, error: evalSaveErr?.message ?? 'Failed to record evaluation' },
        { status: 500 }
      );
    }

    // 6. Update expense review status based on deterministic outcome
    let nextStatus = expense.review_status;
    if (expense.review_status !== 'approved' && expense.review_status !== 'rejected') {
      if (evalResult.overall_outcome === 'pass') {
        nextStatus = 'ready_for_approval';
      } else if (evalResult.overall_outcome === 'fail' || evalResult.overall_outcome === 'needs_review') {
        nextStatus = 'needs_review';
      } else if (evalResult.overall_outcome === 'unknown') {
        nextStatus = 'needs_information';
      }

      await supabase
        .from('expenses')
        .update({
          review_status: nextStatus,
          policy_version_id: activePolicy?.id ?? null,
        })
        .eq('id', expense.id);
    }

    // 7. Audit log event
    await supabase.from('review_events').insert({
      expense_id: expense.id,
      company_id: expense.company_id,
      actor_id: session.id,
      actor_role: session.membership.role,
      event_type: 'evaluation_complete',
      payload: {
        overall_outcome: evalResult.overall_outcome,
        reimbursable_amount: evalResult.reimbursable_amount,
        rules_checked: evalResult.rule_results.length,
        duplicate_findings_count: evalResult.duplicate_findings.length,
        next_review_status: nextStatus,
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        evaluation,
        outcome: evalResult.overall_outcome,
        reimbursable_amount: evalResult.reimbursable_amount,
        next_review_status: nextStatus,
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Internal error';
    if (msg === 'UNAUTHORIZED') return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
