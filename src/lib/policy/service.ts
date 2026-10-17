import { evaluateExpensePolicy } from './engine';
import type { Expense, PolicyRule, PolicyVersion, UserSession } from '@/types';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Selects the policy version covering a given expense date
 */
export function selectPolicyForDate(
  policies: PolicyVersion[],
  expenseDate: string | null | undefined
): PolicyVersion | null {
  if (!policies || policies.length === 0 || !expenseDate) return null;

  const matched = policies.find((p: PolicyVersion) => {
    const fromOk = !p.effective_from || p.effective_from <= expenseDate;
    const toOk = !p.effective_to || p.effective_to >= expenseDate;
    return fromOk && toOk;
  });

  return (matched as PolicyVersion) ?? null;
}

/**
 * Finds the confirmed active policy covering the transaction date
 */
export async function findApplicablePolicy(
  companyId: string,
  expenseDate: string | null | undefined,
  supabase: SupabaseClient
): Promise<PolicyVersion | null> {
  const { data: policies } = await supabase
    .from('policy_versions')
    .select('*')
    .eq('company_id', companyId)
    .eq('status', 'active')
    .order('version_number', { ascending: false });

  return selectPolicyForDate(policies ?? [], expenseDate);
}

/**
 * Evaluates an expense, persists the evaluation record, updates status, and logs audit event
 */
export async function evaluateAndPersistExpense(args: {
  expenseId: string;
  actorId?: string | null;
  actorRole?: 'employee' | 'finance' | null;
  supabase: SupabaseClient;
}) {
  const { expenseId, actorId, actorRole, supabase } = args;

  // 1. Fetch current expense
  const { data: expense, error: fetchErr } = await supabase
    .from('expenses')
    .select('*')
    .eq('id', expenseId)
    .single();

  if (fetchErr || !expense) {
    throw new Error(`Expense not found: ${expenseId}`);
  }

  // 2. Find applicable policy based on transaction date
  const applicablePolicy = await findApplicablePolicy(
    expense.company_id,
    expense.expense_date,
    supabase
  );

  const rules: PolicyRule[] = (applicablePolicy?.structured_rules as PolicyRule[]) ?? [];

  // 3. Load historical company candidates for duplicate and accumulation checks
  const { data: history } = await supabase
    .from('expenses')
    .select('*')
    .eq('company_id', expense.company_id)
    .neq('id', expense.id)
    .order('expense_date', { ascending: false });

  // 4. Run deterministic policy engine
  const evalResult = evaluateExpensePolicy({
    expense,
    activePolicyRules: rules,
    applicablePolicy,
    policyEffectiveDateChecked: true,
    spendingHistory: (history as Expense[]) ?? [],
    candidateDuplicates: (history as Expense[]) ?? [],
  });

  // 5. Persist evaluation record
  const { data: evaluation, error: evalErr } = await supabase
    .from('evaluations')
    .insert({
      expense_id: expense.id,
      policy_version_id: applicablePolicy?.id ?? null,
      evaluator_version: '2.0.0',
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
        file_hash: expense.receipt_file_hash,
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

  if (evalErr || !evaluation) {
    throw new Error(`Failed to record evaluation: ${evalErr?.message}`);
  }

  // 6. Determine review status transition (if not already approved or rejected)
  let nextStatus = expense.review_status;
  if (expense.review_status !== 'approved' && expense.review_status !== 'rejected') {
    if (evalResult.overall_outcome === 'pass') {
      nextStatus = 'ready_for_approval';
    } else if (evalResult.overall_outcome === 'unknown') {
      nextStatus = 'needs_information';
    } else {
      nextStatus = 'needs_review';
    }

    await supabase
      .from('expenses')
      .update({
        review_status: nextStatus,
        policy_version_id: applicablePolicy?.id ?? null,
      })
      .eq('id', expense.id);
  }

  // 7. Record evaluation audit event
  await supabase.from('review_events').insert({
    expense_id: expense.id,
    company_id: expense.company_id,
    actor_id: actorId ?? null,
    actor_role: actorRole ?? 'employee',
    event_type: 'evaluation_complete',
    payload: {
      overall_outcome: evalResult.overall_outcome,
      reimbursable_amount: evalResult.reimbursable_amount,
      rules_checked: evalResult.rule_results.length,
      policy_version: applicablePolicy?.version_number ?? 'none',
      next_review_status: nextStatus,
    },
    note: applicablePolicy
      ? `Evaluated against Policy v${applicablePolicy.version_number}. Outcome: ${evalResult.overall_outcome}.`
      : `Evaluated without applicable policy on date ${expense.expense_date ?? 'unspecified'}.`,
  });

  return { evaluation, evalResult, nextStatus };
}
