import { NextRequest, NextResponse } from 'next/server';
import { requireFinanceSession } from '@/lib/supabase/auth';
import { createServiceClient } from '@/lib/supabase/server';
import { evaluateExpensePolicy } from '@/lib/policy/engine';
import { findApplicablePolicy } from '@/lib/policy/service';
import type { Expense, PolicyRule } from '@/types';
import Decimal from 'decimal.js';

// POST /api/finance/bulk-approve
// Revalidates each selected claim, enforces cumulative daily allowance within the batch, and applies atomic approval
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

    // 1. Load active historical expenses for cumulative allowance and duplicate checking
    const { data: allExpenses } = await supabase
      .from('expenses')
      .select('*')
      .eq('company_id', session.company.id);

    const expenseMap = new Map((allExpenses ?? []).map((e) => [e.id, e]));

    let approvedCount = 0;
    let skippedCount = 0;
    const errors: Array<{ id: string; reason: string }> = [];

    // Tally of amounts newly approved in this batch: key = `${employee_id}_${expense_date}_${category}`
    const batchApprovedTally = new Map<string, Decimal>();

    for (const id of expense_ids) {
      const expense = expenseMap.get(id);
      if (!expense) {
        skippedCount++;
        errors.push({ id, reason: 'Expense not found in workspace' });
        continue;
      }

      if (expense.review_status !== 'ready_for_approval') {
        skippedCount++;
        errors.push({ id, reason: `Status is "${expense.review_status}", not "ready_for_approval"` });
        continue;
      }

      // 2. Select applicable policy for transaction date
      const policy = await findApplicablePolicy(session.company.id, expense.expense_date, supabase);
      if (!policy) {
        skippedCount++;
        errors.push({ id, reason: `No active policy was effective on expense date (${expense.expense_date ?? 'unspecified'})` });
        continue;
      }

      const rules: PolicyRule[] = (policy.structured_rules as PolicyRule[]) ?? [];

      // 3. Revalidate claim deterministically on backend
      const otherExpenses = Array.from(expenseMap.values()).filter((e) => e.id !== expense.id);
      const reval = evaluateExpensePolicy({
        expense,
        activePolicyRules: rules,
        applicablePolicy: policy,
        policyEffectiveDateChecked: true,
        spendingHistory: otherExpenses as Expense[],
        candidateDuplicates: otherExpenses as Expense[],
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

      // 4. Cumulative Daily Allowance Check (including items newly approved in THIS batch)
      if (expense.expense_date && expense.category && expense.original_amount) {
        const tallyKey = `${expense.employee_id}_${expense.expense_date}_${expense.category.toLowerCase()}`;
        const alreadyApprovedInBatch = batchApprovedTally.get(tallyKey) ?? new Decimal(0);

        const mealRule = rules.find(
          (r: any) => r.type === 'daily_cap' && r.categories?.some((c: string) => c.toLowerCase() === expense.category?.toLowerCase())
        );

        if (mealRule && mealRule.limit) {
          const priorDailySum = (reval.spending_context?.prior_total ?? 0);
          const totalWithBatch = new Decimal(priorDailySum).plus(alreadyApprovedInBatch).plus(new Decimal(expense.original_amount));

          if (totalWithBatch.greaterThan(new Decimal(mealRule.limit))) {
            skippedCount++;
            errors.push({
              id,
              reason: `Approving this claim jointly breaches daily cap of $${mealRule.limit} with other claims on ${expense.expense_date}.`,
            });
            // Downgrade to needs_review
            await supabase.from('expenses').update({ review_status: 'needs_review' }).eq('id', expense.id);
            continue;
          }
        }
      }

      // 5. Atomic approval with version check
      const { data: updated, error: updateErr } = await supabase
        .from('expenses')
        .update({
          review_status: 'approved',
          version: expense.version + 1,
        })
        .eq('id', expense.id)
        .eq('version', expense.version) // Concurrency check
        .select()
        .single();

      if (updateErr || !updated) {
        skippedCount++;
        errors.push({ id, reason: 'Concurrent modification detected during approval' });
        continue;
      }

      // 6. Update in-memory state and batch tally
      expense.review_status = 'approved';
      expense.version = expense.version + 1;
      expenseMap.set(id, expense);

      if (expense.expense_date && expense.category && expense.original_amount) {
        const tallyKey = `${expense.employee_id}_${expense.expense_date}_${expense.category.toLowerCase()}`;
        const currentTally = batchApprovedTally.get(tallyKey) ?? new Decimal(0);
        batchApprovedTally.set(tallyKey, currentTally.plus(new Decimal(expense.original_amount)));
      }

      // 7. Audit log
      await supabase.from('review_events').insert({
        expense_id: expense.id,
        company_id: session.company.id,
        actor_id: session.id,
        actor_role: 'finance',
        event_type: 'approved',
        payload: { bulk_operation: true },
        note: 'Approved via bulk review following backend revalidation and allowance check.',
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
