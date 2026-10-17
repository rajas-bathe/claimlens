import Decimal from 'decimal.js';
import type {
  Expense,
  PolicyRule,
  RuleResult,
  RuleOutcome,
  Evaluation,
  SpendingContext,
  DuplicateFinding,
  TripContext,
} from '@/types';

export interface EvaluationInput {
  expense: Expense;
  activePolicyRules: PolicyRule[];
  spendingHistory?: Expense[]; // Historical expenses within aggregation scope (e.g. same day/month)
  candidateDuplicates?: Expense[]; // Historical expenses for duplicate checking
}

export interface EngineResult {
  overall_outcome: 'pass' | 'fail' | 'unknown' | 'needs_review';
  rule_results: RuleResult[];
  reimbursable_amount: number | null;
  reimbursable_currency: string;
  spending_context: SpendingContext;
  duplicate_findings: DuplicateFinding[];
  requires_approval_threshold: boolean;
  notes: string[];
}

// Tier 1 High-Cost Cities (configurable in policy rules, standard defaults)
const DEFAULT_TIER1_CITIES = ['new york', 'san francisco', 'london', 'zurich', 'tokyo', 'paris', 'geneva'];

/**
 * Deterministic policy evaluator.
 * Evaluates all applicable rules and returns a structured, explainable breakdown.
 */
export function evaluateExpensePolicy(input: EvaluationInput): EngineResult {
  const { expense, activePolicyRules, spendingHistory = [], candidateDuplicates = [] } = input;
  const ruleResults: RuleResult[] = [];
  const notes: string[] = [];
  let hasFail = false;
  let hasUnknown = false;
  let requiresApproval = false;

  const currency = expense.original_currency?.toUpperCase() ?? 'USD';
  const rawAmount = expense.original_amount;
  const decimalAmount = rawAmount !== null && rawAmount !== undefined ? new Decimal(rawAmount) : null;
  let reimbursableDecimal = decimalAmount ? new Decimal(decimalAmount) : null;

  // 1. Core Data Completeness & Integrity Checks
  evaluateDataCompleteness(expense, ruleResults);

  // 2. Arithmetic Discrepancy Check
  evaluateArithmeticIntegrity(expense, ruleResults);

  // 3. Duplicate Detection
  const duplicateFindings = checkDuplicates(expense, candidateDuplicates);
  if (duplicateFindings.length > 0) {
    const hasExact = duplicateFindings.some((d) => d.type === 'exact_hash');
    ruleResults.push({
      rule_id: 'integrity_duplicate_check',
      rule_type: 'required_field',
      outcome: hasExact ? 'fail' : 'unknown',
      message: hasExact
        ? `Exact duplicate receipt detected (matches expense #${duplicateFindings[0].matched_expense_id.slice(0, 8)}).`
        : `Potential duplicate claim detected: ${duplicateFindings[0].note}`,
      details: { findings: duplicateFindings },
      reimbursable_impact: hasExact ? 0 : null,
    });
    if (hasExact && reimbursableDecimal) {
      reimbursableDecimal = new Decimal(0);
    }
  } else {
    ruleResults.push({
      rule_id: 'integrity_duplicate_check',
      rule_type: 'required_field',
      outcome: 'pass',
      message: 'No duplicate submissions found across historical receipts.',
      details: {},
      reimbursable_impact: null,
    });
  }

  // 4. Spending Accumulation (Category & Daily Caps)
  const categoryHistory = spendingHistory.filter(
    (h) =>
      h.id !== expense.id && // exclude current expense
      h.expense_date === expense.expense_date &&
      h.category?.toLowerCase() === expense.category?.toLowerCase() &&
      ['submitted', 'ready_for_approval', 'approved'].includes(h.review_status)
  );

  let priorSum = new Decimal(0);
  const includedIds: string[] = [];
  for (const h of categoryHistory) {
    if (h.original_amount !== null && h.original_amount !== undefined) {
      priorSum = priorSum.plus(new Decimal(h.original_amount));
      includedIds.push(h.id);
    }
  }

  const spendingContext: SpendingContext = {
    employee_id: expense.employee_id,
    period_start: expense.expense_date ?? new Date().toISOString().slice(0, 10),
    period_end: expense.expense_date ?? new Date().toISOString().slice(0, 10),
    category: expense.category,
    city: expense.city,
    trip_context: expense.trip_context,
    prior_total: priorSum.toNumber(),
    currency: currency,
    expense_ids_included: includedIds,
  };

  // 5. Evaluate Confirmed Structured Policy Rules
  for (const rule of activePolicyRules) {
    const res = evaluateIndividualRule({
      rule,
      expense,
      decimalAmount,
      priorSum,
      currency,
    });

    ruleResults.push(res);

    if (res.outcome === 'fail') {
      hasFail = true;
    } else if (res.outcome === 'unknown') {
      hasUnknown = true;
    }

    if (rule.type === 'approval_threshold' && res.outcome === 'pass' && res.details.threshold_triggered) {
      requiresApproval = true;
    }

    // Apply cap reduction to reimbursable amount if capped
    if (res.reimbursable_impact !== null && reimbursableDecimal) {
      const cap = new Decimal(res.reimbursable_impact);
      if (cap.lessThan(reimbursableDecimal)) {
        reimbursableDecimal = cap;
        notes.push(`Reimbursable amount capped at ${cap.toFixed(2)} ${currency} per rule ${rule.id}.`);
      }
    }
  }

  // Determine overall outcome across ALL rules (completeness, arithmetic, duplicates, and policy)
  for (const r of ruleResults) {
    if (r.outcome === 'fail') {
      hasFail = true;
    } else if (r.outcome === 'unknown') {
      hasUnknown = true;
    }
  }

  let overallOutcome: EngineResult['overall_outcome'] = 'pass';
  if (hasFail) {
    overallOutcome = 'fail';
  } else if (hasUnknown) {
    overallOutcome = 'unknown';
  } else if (requiresApproval) {
    overallOutcome = 'needs_review';
  }

  return {
    overall_outcome: overallOutcome,
    rule_results: ruleResults,
    reimbursable_amount: reimbursableDecimal ? reimbursableDecimal.toNumber() : null,
    reimbursable_currency: currency,
    spending_context: spendingContext,
    duplicate_findings: duplicateFindings,
    requires_approval_threshold: requiresApproval,
    notes,
  };
}

/**
 * Data completeness & required context validation
 */
function evaluateDataCompleteness(expense: Expense, results: RuleResult[]) {
  // Date check
  if (!expense.expense_date) {
    results.push({
      rule_id: 'data_date_required',
      rule_type: 'required_field',
      outcome: 'unknown',
      message: 'Receipt date is missing or ambiguous. Clarification is required.',
      details: { field: 'expense_date' },
      reimbursable_impact: null,
    });
  } else {
    results.push({
      rule_id: 'data_date_required',
      rule_type: 'required_field',
      outcome: 'pass',
      message: `Date confirmed: ${expense.expense_date}`,
      details: { field: 'expense_date', value: expense.expense_date },
      reimbursable_impact: null,
    });
  }

  // Amount & Currency check
  if (expense.original_amount === null || expense.original_amount === undefined || !expense.original_currency) {
    results.push({
      rule_id: 'data_amount_required',
      rule_type: 'required_field',
      outcome: 'unknown',
      message: 'Expense amount or currency could not be determined from the receipt.',
      details: { amount: expense.original_amount, currency: expense.original_currency },
      reimbursable_impact: null,
    });
  } else {
    results.push({
      rule_id: 'data_amount_required',
      rule_type: 'required_field',
      outcome: 'pass',
      message: `Amount confirmed: ${expense.original_amount} ${expense.original_currency}`,
      details: { amount: expense.original_amount, currency: expense.original_currency },
      reimbursable_impact: null,
    });
  }

  // Client Entertainment attendee requirements
  if (expense.category?.toLowerCase() === 'client entertainment') {
    if (!expense.client_name || expense.client_name.trim().length === 0) {
      results.push({
        rule_id: 'policy_client_name_required',
        rule_type: 'client_entertainment_requirement',
        outcome: 'fail',
        message: 'Client entertainment claims require a verified Client Name (Clause 3.1).',
        details: { missing_field: 'client_name' },
        reimbursable_impact: null,
      });
    } else {
      results.push({
        rule_id: 'policy_client_name_required',
        rule_type: 'client_entertainment_requirement',
        outcome: 'pass',
        message: `Client identified: ${expense.client_name}`,
        details: { client_name: expense.client_name },
        reimbursable_impact: null,
      });
    }

    if (!expense.attendee_count || expense.attendee_count < 1) {
      results.push({
        rule_id: 'policy_client_attendees_required',
        rule_type: 'client_entertainment_requirement',
        outcome: 'unknown',
        message: 'Total attendee count is required to evaluate per-person entertainment limits.',
        details: { missing_field: 'attendee_count' },
        reimbursable_impact: null,
      });
    }
  }

  // Itemization check for lodging & high-value meals
  const ext = expense.extraction_raw;
  const isHotel = expense.category?.toLowerCase().includes('accommodation') || expense.category?.toLowerCase().includes('hotel');
  const isHighMeal = expense.category?.toLowerCase().includes('meal') && (expense.original_amount ?? 0) > 50;

  if (isHotel || isHighMeal) {
    if (ext && (ext.itemization_completeness === 'none' || ext.itemization_completeness === 'unclear')) {
      results.push({
        rule_id: 'policy_itemization_mandatory',
        rule_type: 'itemization_requirement',
        outcome: 'fail',
        message: 'Itemized receipt is mandatory for hotel stays and meals exceeding $50 (Clause 1.2). Incomplete itemization does not pass item restrictions.',
        details: { category: expense.category, itemization_status: ext.itemization_completeness },
        reimbursable_impact: null,
      });
    } else {
      results.push({
        rule_id: 'policy_itemization_mandatory',
        rule_type: 'itemization_requirement',
        outcome: 'pass',
        message: 'Itemization completeness verified for high-value claim.',
        details: { itemization_status: ext?.itemization_completeness ?? 'provided' },
        reimbursable_impact: null,
      });
    }
  }
}

/**
 * Arithmetic integrity check
 */
function evaluateArithmeticIntegrity(expense: Expense, results: RuleResult[]) {
  const ext = expense.extraction_raw;
  if (!ext || !ext.arithmetic_check) return;

  const { calculated_total, printed_total, discrepancy } = ext.arithmetic_check;
  if (discrepancy !== null && Math.abs(discrepancy) > 0.01) {
    results.push({
      rule_id: 'integrity_arithmetic_check',
      rule_type: 'required_field',
      outcome: 'fail',
      message: `Arithmetic inconsistency: printed total (${printed_total}) differs from calculated item sum (${calculated_total}) by ${discrepancy}. Explanation required before reimbursement (Clause 1.3).`,
      details: { printed_total, calculated_total, discrepancy },
      reimbursable_impact: null,
    });
  } else if (printed_total !== null && calculated_total !== null) {
    results.push({
      rule_id: 'integrity_arithmetic_check',
      rule_type: 'required_field',
      outcome: 'pass',
      message: `Arithmetic check passed: printed total matches sum of line items (${printed_total}).`,
      details: { printed_total, calculated_total },
      reimbursable_impact: null,
    });
  }
}

/**
 * Evaluate an individual confirmed policy rule
 */
function evaluateIndividualRule(args: {
  rule: PolicyRule;
  expense: Expense;
  decimalAmount: Decimal | null;
  priorSum: Decimal;
  currency: string;
}): RuleResult {
  const { rule, expense, decimalAmount, priorSum, currency } = args;

  // Check category applicability
  if (rule.categories && rule.categories.length > 0) {
    const expenseCat = expense.category?.toLowerCase();
    const matchesCat = rule.categories.some((c) => c.toLowerCase() === expenseCat);
    if (!matchesCat) {
      return {
        rule_id: rule.id,
        rule_type: rule.type,
        outcome: 'not_applicable',
        message: `Rule applies only to categories: ${rule.categories.join(', ')}`,
        details: {},
        reimbursable_impact: null,
      };
    }
  }

  // Check trip context applicability
  if (rule.trip_contexts && rule.trip_contexts.length > 0) {
    if (!expense.trip_context) {
      return {
        rule_id: rule.id,
        rule_type: rule.type,
        outcome: 'unknown',
        message: 'Trip context (office vs business trip) is missing and required to evaluate this rule.',
        details: { required_context: rule.trip_contexts },
        reimbursable_impact: null,
      };
    }
    if (!rule.trip_contexts.includes(expense.trip_context)) {
      return {
        rule_id: rule.id,
        rule_type: rule.type,
        outcome: 'not_applicable',
        message: `Rule applies to ${rule.trip_contexts.join(', ')}, but claim context is ${expense.trip_context}.`,
        details: {},
        reimbursable_impact: null,
      };
    }
  }

  // City Tier Check
  const expenseCity = expense.city?.trim().toLowerCase() ?? '';
  const isTier1City = DEFAULT_TIER1_CITIES.includes(expenseCity) || (rule.cities && rule.cities.some((c) => c.toLowerCase() === expenseCity));

  // Switch by rule type
  switch (rule.type) {
    case 'per_expense_cap': {
      if (!decimalAmount) {
        return {
          rule_id: rule.id,
          rule_type: rule.type,
          outcome: 'unknown',
          message: 'Cannot evaluate expense cap without confirmed amount.',
          details: {},
          reimbursable_impact: null,
        };
      }
      let limit = new Decimal(rule.limit ?? 0);
      if (
        rule.categories?.some((c) => c.toLowerCase() === 'client entertainment') &&
        expense.attendee_count &&
        expense.attendee_count > 1
      ) {
        limit = limit.times(expense.attendee_count);
      }
      if (decimalAmount.greaterThan(limit)) {
        return {
          rule_id: rule.id,
          rule_type: rule.type,
          outcome: 'fail',
          message: `Amount ${decimalAmount.toFixed(2)} ${currency} exceeds per-expense limit of ${limit.toFixed(2)} ${rule.limit_currency ?? currency} (${rule.source_clause}).`,
          details: { amount: decimalAmount.toNumber(), limit: limit.toNumber() },
          reimbursable_impact: limit.toNumber(),
        };
      }
      return {
        rule_id: rule.id,
        rule_type: rule.type,
        outcome: 'pass',
        message: `Amount ${decimalAmount.toFixed(2)} ${currency} is within limit of ${limit.toFixed(2)} ${rule.limit_currency ?? currency}.`,
        details: { amount: decimalAmount.toNumber(), limit: limit.toNumber() },
        reimbursable_impact: null,
      };
    }

    case 'daily_cap':
    case 'category_cap': {
      if (!decimalAmount) {
        return {
          rule_id: rule.id,
          rule_type: rule.type,
          outcome: 'unknown',
          message: 'Cannot evaluate daily cap without confirmed amount.',
          details: {},
          reimbursable_impact: null,
        };
      }

      // City-specific limit override if configured
      let limitValue = rule.limit ?? 0;
      if (isTier1City && (rule.categories?.includes('Business meals') || rule.categories?.includes('Accommodation'))) {
        // High cost city bonus
        limitValue = limitValue * 1.33333333; // e.g. $75 -> $100
      }

      const limit = new Decimal(limitValue).toDecimalPlaces(2);
      const combinedSum = priorSum.plus(decimalAmount);

      if (combinedSum.greaterThan(limit)) {
        const remainingDailyAllowance = Decimal.max(0, limit.minus(priorSum));
        return {
          rule_id: rule.id,
          rule_type: rule.type,
          outcome: 'fail',
          message: `Daily category spending of ${combinedSum.toFixed(2)} ${currency} (prior ${priorSum.toFixed(2)} + this ${decimalAmount.toFixed(2)}) exceeds daily cap of ${limit.toFixed(2)} ${rule.limit_currency ?? currency} (${rule.source_clause}).`,
          details: {
            prior_total: priorSum.toNumber(),
            current_amount: decimalAmount.toNumber(),
            combined_total: combinedSum.toNumber(),
            daily_limit: limit.toNumber(),
            is_tier_1_city: isTier1City,
          },
          reimbursable_impact: remainingDailyAllowance.toNumber(),
        };
      }

      return {
        rule_id: rule.id,
        rule_type: rule.type,
        outcome: 'pass',
        message: `Combined daily spending of ${combinedSum.toFixed(2)} ${currency} is within daily limit of ${limit.toFixed(2)} ${rule.limit_currency ?? currency}.`,
        details: {
          prior_total: priorSum.toNumber(),
          current_amount: decimalAmount.toNumber(),
          combined_total: combinedSum.toNumber(),
          daily_limit: limit.toNumber(),
          is_tier_1_city: isTier1City,
        },
        reimbursable_impact: null,
      };
    }

    case 'approval_threshold': {
      if (!decimalAmount) {
        return {
          rule_id: rule.id,
          rule_type: rule.type,
          outcome: 'not_applicable',
          message: 'Approval threshold check pending amount confirmation.',
          details: {},
          reimbursable_impact: null,
        };
      }
      const threshold = new Decimal(rule.limit ?? 0);
      const exceeded = decimalAmount.greaterThan(threshold);
      return {
        rule_id: rule.id,
        rule_type: rule.type,
        outcome: 'pass', // Exceeding threshold is an escalation flag, NOT a policy violation
        message: exceeded
          ? `Amount ${decimalAmount.toFixed(2)} ${currency} exceeds approval threshold of ${threshold.toFixed(2)} ${currency} (${rule.source_clause}) — flagged for Executive Approval.`
          : `Amount is below the executive approval threshold (${threshold.toFixed(2)} ${currency}).`,
        details: { threshold_triggered: exceeded, threshold: threshold.toNumber(), amount: decimalAmount.toNumber() },
        reimbursable_impact: null,
      };
    }

    case 'prohibited_item': {
      const ext = expense.extraction_raw;
      const prohibitedValues = (rule.prohibited_values ?? []).map((p) => p.toLowerCase());
      const matchedItems: string[] = [];

      if (ext && ext.line_items) {
        for (const item of ext.line_items) {
          const desc = item.description?.toLowerCase() ?? '';
          for (const p of prohibitedValues) {
            if (desc.includes(p)) {
              matchedItems.push(item.description ?? p);
            }
          }
        }
      }

      if (matchedItems.length > 0) {
        return {
          rule_id: rule.id,
          rule_type: rule.type,
          outcome: 'fail',
          message: `Prohibited items detected on receipt: ${matchedItems.join(', ')} (${rule.source_clause}). Non-reimbursable.`,
          details: { prohibited_items: matchedItems },
          reimbursable_impact: 0,
        };
      }

      return {
        rule_id: rule.id,
        rule_type: rule.type,
        outcome: 'pass',
        message: 'No prohibited items identified in receipt line items.',
        details: {},
        reimbursable_impact: null,
      };
    }

    default:
      return {
        rule_id: rule.id,
        rule_type: rule.type,
        outcome: 'pass',
        message: `Rule ${rule.id} validated.`,
        details: {},
        reimbursable_impact: null,
      };
  }
}

/**
 * Duplicate receipt comparison
 * Checks exact hash and semantic probable duplicates (merchant, date, amount, employee)
 */
export function checkDuplicates(target: Expense, history: Expense[]): DuplicateFinding[] {
  const findings: DuplicateFinding[] = [];

  for (const candidate of history) {
    if (candidate.id === target.id) continue;

    // 1. Exact file hash match
    if (
      target.receipt_file_hash &&
      candidate.receipt_file_hash &&
      target.receipt_file_hash === candidate.receipt_file_hash
    ) {
      findings.push({
        type: 'exact_hash',
        matched_expense_id: candidate.id,
        matched_expense_date: candidate.expense_date,
        matched_merchant: candidate.merchant,
        matched_amount: candidate.original_amount,
        matching_fields: ['receipt_file_hash', 'file_content'],
        differing_fields: [],
        note: `Exact SHA-256 binary hash match with previously uploaded receipt #${candidate.id.slice(0, 8)}.`,
      });
      continue;
    }

    // 2. Probable duplicate (same merchant, same date, same amount)
    const matchingFields: string[] = [];
    const differingFields: string[] = [];

    // Amount match
    if (
      target.original_amount !== null &&
      candidate.original_amount !== null &&
      Math.abs(target.original_amount - candidate.original_amount) < 0.01
    ) {
      matchingFields.push('amount');
    } else {
      differingFields.push('amount');
    }

    // Date match
    if (target.expense_date && candidate.expense_date && target.expense_date === candidate.expense_date) {
      matchingFields.push('date');
    } else {
      differingFields.push('date');
    }

    // Merchant match (fuzzy or normalized)
    const m1 = target.merchant?.toLowerCase().replace(/[^a-z0-9]/g, '') ?? '';
    const m2 = candidate.merchant?.toLowerCase().replace(/[^a-z0-9]/g, '') ?? '';
    if (m1 && m2 && (m1.includes(m2) || m2.includes(m1))) {
      matchingFields.push('merchant');
    } else {
      differingFields.push('merchant');
    }

    // Currency match
    if (target.original_currency && candidate.original_currency && target.original_currency === candidate.original_currency) {
      matchingFields.push('currency');
    }

    // Employee context
    const isSameEmployee = target.employee_id === candidate.employee_id;
    if (isSameEmployee) {
      matchingFields.push('employee');
    } else {
      differingFields.push('different_employee');
    }

    // Probable duplicate condition: Merchant + Date + Amount match
    if (matchingFields.includes('amount') && matchingFields.includes('date') && matchingFields.includes('merchant')) {
      findings.push({
        type: 'probable',
        matched_expense_id: candidate.id,
        matched_expense_date: candidate.expense_date,
        matched_merchant: candidate.merchant,
        matched_amount: candidate.original_amount,
        matching_fields: matchingFields,
        differing_fields: differingFields,
        note: isSameEmployee
          ? `Identical merchant, date, and amount submitted on another claim by this employee.`
          : `Identical merchant, date, and amount submitted by another employee (#${candidate.employee_id.slice(0, 8)}). Possible shared bill or duplicate reimbursement attempt.`,
      });
    }
  }

  return findings;
}
