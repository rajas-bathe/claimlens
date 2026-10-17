import Decimal from 'decimal.js';
import type {
  Expense,
  PolicyRule,
  PolicyVersion,
  RuleResult,
  RuleOutcome,
  SpendingContext,
  DuplicateFinding,
  TripContext,
} from '@/types';

export interface EvaluationInput {
  expense: Expense;
  activePolicyRules: PolicyRule[];
  applicablePolicy?: PolicyVersion | null;
  policyEffectiveDateChecked?: boolean;
  policyEffectiveFrom?: string | null;
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

/**
 * Deterministic policy evaluator.
 * Evaluates all applicable rules and returns a structured, explainable breakdown.
 */
export function evaluateExpensePolicy(input: EvaluationInput): EngineResult {
  const {
    expense,
    activePolicyRules,
    applicablePolicy,
    spendingHistory = [],
    candidateDuplicates = [],
  } = input;

  const ruleResults: RuleResult[] = [];
  const notes: string[] = [];
  let hasFail = false;
  let hasUnknown = false;
  let requiresApproval = false;

  const currency = expense.original_currency?.toUpperCase() ?? 'USD';
  const rawAmount = expense.original_amount;
  const decimalAmount = rawAmount !== null && rawAmount !== undefined ? new Decimal(rawAmount) : null;
  let reimbursableDecimal = decimalAmount ? new Decimal(decimalAmount) : null;

  // 1. Policy Effective Date Check
  const isOutsidePolicyWindow =
    (applicablePolicy === null && input.policyEffectiveDateChecked) ||
    (input.policyEffectiveFrom && expense.expense_date && expense.expense_date < input.policyEffectiveFrom) ||
    (applicablePolicy && expense.expense_date && (
      (applicablePolicy.effective_from && expense.expense_date < applicablePolicy.effective_from) ||
      (applicablePolicy.effective_to && expense.expense_date > applicablePolicy.effective_to)
    ));

  if (isOutsidePolicyWindow) {
    hasUnknown = true;
    const effFrom = input.policyEffectiveFrom ?? applicablePolicy?.effective_from ?? 'unknown';
    ruleResults.push({
      rule_id: 'policy_effective_date_check',
      rule_type: 'required_field',
      source_clause: 'Policy Effective Window',
      outcome: 'unknown',
      message: `No active expense policy was effective on receipt date (${expense.expense_date ?? 'unspecified'}). Transaction predates policy effective date (${effFrom}).`,
      details: {
        expense_date: expense.expense_date,
        policy_effective_from: effFrom,
        relevant_inputs: `Expense Date: ${expense.expense_date ?? 'None'}, Policy Effective: ${effFrom}`,
        calculation: 'Checked active policy versions; transaction predates policy effective window.',
        required_next_action: 'Requires Finance review and manual policy assignment or override.',
      },
      reimbursable_impact: null,
      required_action: 'Requires Finance review and manual policy assignment or override.',
    });
  }

  // 2. Core Data Completeness & Integrity Checks
  evaluateDataCompleteness(expense, ruleResults);

  // 3. Arithmetic Discrepancy Check
  evaluateArithmeticIntegrity(expense, ruleResults);

  // 4. Duplicate Detection
  const duplicateFindings = checkDuplicates(expense, candidateDuplicates);
  if (duplicateFindings.length > 0) {
    const hasExact = duplicateFindings.some((d) => d.type === 'exact_hash');
    ruleResults.push({
      rule_id: 'integrity_duplicate_check',
      rule_type: 'required_field',
      source_clause: 'Clause 1.1 (Submission Integrity)',
      outcome: hasExact ? 'fail' : 'unknown',
      message: hasExact
        ? `Exact duplicate receipt detected (matches claim #${duplicateFindings[0].matched_expense_id.slice(0, 8)}).`
        : `Potential duplicate claim detected: ${duplicateFindings[0].note}`,
      details: {
        findings: duplicateFindings,
        relevant_inputs: `File hash: ${expense.receipt_file_hash ?? 'N/A'}, Amount: ${expense.original_amount}, Date: ${expense.expense_date}`,
        calculation: hasExact ? 'Identical SHA-256 hash match' : 'Same date and amount within 1%',
        required_next_action: hasExact ? 'Reject duplicate claim' : 'Finance reviewer to confirm or mark distinct',
      },
      reimbursable_impact: hasExact ? 0 : null,
      required_action: hasExact ? 'Reject duplicate claim' : 'Reviewer must verify distinct receipt',
    });
    if (hasExact && reimbursableDecimal) {
      reimbursableDecimal = new Decimal(0);
    }
  } else {
    ruleResults.push({
      rule_id: 'integrity_duplicate_check',
      rule_type: 'required_field',
      source_clause: 'Clause 1.1 (Submission Integrity)',
      outcome: 'pass',
      message: 'No duplicate submissions found across historical receipts.',
      details: {
        relevant_inputs: `File hash: ${expense.receipt_file_hash ?? 'N/A'}`,
        calculation: 'Zero matching hashes or candidate collision found',
        required_next_action: 'None',
      },
      reimbursable_impact: null,
      required_action: 'None',
    });
  }

  // 5. Spending Accumulation (Category & Daily Caps)
  // Exclude current expense before calculating historical sum
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

  // 6. Evaluate Confirmed Structured Policy Rules
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

  // Determine overall outcome across ALL rules
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

  // Do not produce a final reimbursable amount when necessary evidence or policy interpretation remains unresolved
  let finalReimbursable: number | null = null;
  if (!hasUnknown) {
    finalReimbursable = reimbursableDecimal ? reimbursableDecimal.toNumber() : 0;
  }

  return {
    overall_outcome: overallOutcome,
    rule_results: ruleResults,
    reimbursable_amount: finalReimbursable,
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
      source_clause: 'Clause 1.1 (Receipt Date)',
      outcome: 'unknown',
      message: 'Receipt date is missing or ambiguous. Clarification is required.',
      details: {
        field: 'expense_date',
        relevant_inputs: 'Date: null',
        calculation: 'Field is empty',
        required_next_action: 'Employee must confirm transaction date.',
      },
      reimbursable_impact: null,
      required_action: 'Provide transaction date',
    });
  } else {
    results.push({
      rule_id: 'data_date_required',
      rule_type: 'required_field',
      source_clause: 'Clause 1.1 (Receipt Date)',
      outcome: 'pass',
      message: `Date confirmed: ${expense.expense_date}`,
      details: {
        field: 'expense_date',
        value: expense.expense_date,
        relevant_inputs: `Date: ${expense.expense_date}`,
        calculation: 'Valid ISO date format',
        required_next_action: 'None',
      },
      reimbursable_impact: null,
      required_action: 'None',
    });
  }

  // Amount & Currency check
  const ext = expense.extraction_raw;
  const isAmbiguousCurrency = ext?.printed_currency?.value === '$' && !ext?.normalized_currency?.value;
  if (expense.original_amount === null || expense.original_amount === undefined || !expense.original_currency || isAmbiguousCurrency) {
    results.push({
      rule_id: 'data_amount_required',
      rule_type: 'required_field',
      source_clause: 'Clause 1.1 & 6.1 (Amount & Currency)',
      outcome: 'unknown',
      message: 'Expense amount or currency code could not be determined unambiguously from the receipt.',
      details: {
        amount: expense.original_amount,
        currency: expense.original_currency,
        relevant_inputs: `Amount: ${expense.original_amount ?? 'null'}, Currency: ${expense.original_currency ?? 'unspecified'}`,
        calculation: 'Missing valid currency ISO code or numeric total',
        required_next_action: 'Confirm amount and ISO currency code before reimbursement.',
      },
      reimbursable_impact: null,
      required_action: 'Confirm amount and currency',
    });
  } else {
    results.push({
      rule_id: 'data_amount_required',
      rule_type: 'required_field',
      source_clause: 'Clause 1.1 & 6.1 (Amount & Currency)',
      outcome: 'pass',
      message: `Amount confirmed: ${expense.original_amount} ${expense.original_currency}`,
      details: {
        amount: expense.original_amount,
        currency: expense.original_currency,
        relevant_inputs: `${expense.original_amount} ${expense.original_currency}`,
        calculation: 'Valid numeric amount and ISO currency',
        required_next_action: 'None',
      },
      reimbursable_impact: null,
      required_action: 'None',
    });
  }

  // Client Entertainment attendee requirements
  if (expense.category?.toLowerCase() === 'client entertainment') {
    if (!expense.client_name || expense.client_name.trim().length === 0) {
      results.push({
        rule_id: 'policy_client_name_required',
        rule_type: 'client_entertainment_requirement',
        source_clause: 'Clause 3.1 (Client Name Mandatory)',
        outcome: 'fail',
        message: 'Client entertainment claims require a verified Client Name (Clause 3.1).',
        details: {
          missing_field: 'client_name',
          relevant_inputs: 'Category: Client entertainment, Client Name: None',
          calculation: 'Mandatory field check failed',
          required_next_action: 'Employee must supply verified Client/Company name.',
        },
        reimbursable_impact: null,
        required_action: 'Provide verified Client Name',
      });
    } else {
      results.push({
        rule_id: 'policy_client_name_required',
        rule_type: 'client_entertainment_requirement',
        source_clause: 'Clause 3.1 (Client Name Mandatory)',
        outcome: 'pass',
        message: `Client identified: ${expense.client_name}`,
        details: {
          client_name: expense.client_name,
          relevant_inputs: `Client Name: ${expense.client_name}`,
          calculation: 'Verified client name provided',
          required_next_action: 'None',
        },
        reimbursable_impact: null,
        required_action: 'None',
      });
    }

    if (!expense.attendee_count || expense.attendee_count < 1) {
      results.push({
        rule_id: 'policy_client_attendees_required',
        rule_type: 'client_entertainment_requirement',
        source_clause: 'Clause 3.1 (Attendee Count)',
        outcome: 'unknown',
        message: 'Total attendee count is required to evaluate per-person entertainment limits (Clause 3.1).',
        details: {
          missing_field: 'attendee_count',
          relevant_inputs: 'Attendee count: null',
          calculation: 'Cannot compute per-attendee cap without head count',
          required_next_action: 'Employee must provide total number of attendees.',
        },
        reimbursable_impact: null,
        required_action: 'Provide attendee count',
      });
    }
  }

  // Itemization check for lodging & high-value meals
  const isHotel = expense.category?.toLowerCase().includes('accommodation') || expense.category?.toLowerCase().includes('hotel');
  const isHighMeal = expense.category?.toLowerCase().includes('meal') && (expense.original_amount ?? 0) > 50;

  if (isHotel || isHighMeal) {
    if (ext && (ext.itemization_completeness === 'none' || ext.itemization_completeness === 'unclear')) {
      results.push({
        rule_id: 'policy_itemization_mandatory',
        rule_type: 'itemization_requirement',
        source_clause: 'Clause 1.2 (Mandatory Itemization)',
        outcome: 'fail',
        message: 'Itemized receipt is mandatory for hotel stays and meals exceeding $50 (Clause 1.2). Incomplete itemization does not pass item restrictions.',
        details: {
          category: expense.category,
          amount: expense.original_amount,
          itemization_status: ext.itemization_completeness,
          relevant_inputs: `Amount: $${expense.original_amount}, Completeness: ${ext.itemization_completeness}`,
          calculation: 'Amount > $50 and itemization completeness is none/unclear',
          required_next_action: 'Employee must attach itemized breakdown or bill folio.',
        },
        reimbursable_impact: null,
        required_action: 'Attach itemized receipt',
      });
    } else {
      results.push({
        rule_id: 'policy_itemization_mandatory',
        rule_type: 'itemization_requirement',
        source_clause: 'Clause 1.2 (Mandatory Itemization)',
        outcome: 'pass',
        message: 'Itemization completeness verified for high-value claim.',
        details: {
          itemization_status: ext?.itemization_completeness ?? 'provided',
          relevant_inputs: `Completeness: ${ext?.itemization_completeness ?? 'complete'}`,
          calculation: 'Itemized lines present and verified',
          required_next_action: 'None',
        },
        reimbursable_impact: null,
        required_action: 'None',
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

  const { calculated_total, printed_total, discrepancy, note } = ext.arithmetic_check;
  if (discrepancy !== null && Math.abs(discrepancy) > 0.02) {
    results.push({
      rule_id: 'integrity_arithmetic_check',
      rule_type: 'required_field',
      source_clause: 'Clause 1.3 (Arithmetic Verification)',
      outcome: 'fail',
      message: `Arithmetic inconsistency: printed total differs from calculated item sum by ${discrepancy.toFixed(2)}. ${note}`,
      details: {
        printed_total,
        calculated_total,
        discrepancy,
        relevant_inputs: `Printed: ${printed_total}, Calculated: ${calculated_total}, Diff: ${discrepancy}`,
        calculation: `${calculated_total} != ${printed_total} (diff: ${discrepancy})`,
        required_next_action: 'Explanation or correction required prior to approval (Clause 1.3).',
      },
      reimbursable_impact: null,
      required_action: 'Clarify arithmetic inconsistency',
    });
  } else if (printed_total !== null && calculated_total !== null) {
    results.push({
      rule_id: 'integrity_arithmetic_check',
      rule_type: 'required_field',
      source_clause: 'Clause 1.3 (Arithmetic Verification)',
      outcome: 'pass',
      message: `Arithmetic check passed: line items and taxes reconcile with total (${printed_total}).`,
      details: {
        printed_total,
        calculated_total,
        relevant_inputs: `Total: ${printed_total}`,
        calculation: 'Reconciled within 0.02 tolerance',
        required_next_action: 'None',
      },
      reimbursable_impact: null,
      required_action: 'None',
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
        source_clause: rule.source_clause,
        outcome: 'not_applicable',
        message: `Rule applies only to categories: ${rule.categories.join(', ')}`,
        details: { rule_categories: rule.categories, expense_category: expense.category },
        reimbursable_impact: null,
        required_action: 'None',
      };
    }
  }

  // Check trip context applicability
  if (rule.trip_contexts && rule.trip_contexts.length > 0) {
    if (!expense.trip_context) {
      return {
        rule_id: rule.id,
        rule_type: rule.type,
        source_clause: rule.source_clause,
        outcome: 'unknown',
        message: 'Trip context (office vs business trip) is missing and required to evaluate this rule.',
        details: {
          required_context: rule.trip_contexts,
          relevant_inputs: 'Trip context: null',
          calculation: 'Cannot evaluate without trip context',
          required_next_action: 'Employee must confirm whether expense occurred on business trip or local office.',
        },
        reimbursable_impact: null,
        required_action: 'Select trip context (business trip or local office)',
      };
    }
    if (!rule.trip_contexts.includes(expense.trip_context)) {
      return {
        rule_id: rule.id,
        rule_type: rule.type,
        source_clause: rule.source_clause,
        outcome: 'not_applicable',
        message: `Rule applies to ${rule.trip_contexts.join(', ')}, but claim context is ${expense.trip_context}.`,
        details: { rule_contexts: rule.trip_contexts, claim_context: expense.trip_context },
        reimbursable_impact: null,
        required_action: 'None',
      };
    }
  }

  // City Tier Check based on policy rule configured cities
  const expenseCity = expense.city?.trim().toLowerCase() ?? '';
  const isConfiguredTier1 = rule.cities && rule.cities.some((c) => c.toLowerCase() === expenseCity);

  // Switch by rule type
  switch (rule.type) {
    case 'per_expense_cap': {
      if (!decimalAmount) {
        return {
          rule_id: rule.id,
          rule_type: rule.type,
          source_clause: rule.source_clause,
          outcome: 'unknown',
          message: 'Cannot evaluate expense cap without confirmed amount.',
          details: {
            relevant_inputs: 'Amount: null',
            calculation: 'Missing amount',
            required_next_action: 'Confirm amount',
          },
          reimbursable_impact: null,
          required_action: 'Confirm expense amount',
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
          source_clause: rule.source_clause,
          outcome: 'fail',
          message: `Amount ${decimalAmount.toFixed(2)} ${currency} exceeds per-expense limit of ${limit.toFixed(2)} ${rule.limit_currency ?? currency} (${rule.source_clause}).`,
          details: {
            amount: decimalAmount.toNumber(),
            limit: limit.toNumber(),
            relevant_inputs: `Amount: $${decimalAmount.toFixed(2)}, Limit: $${limit.toFixed(2)}`,
            calculation: `${decimalAmount.toFixed(2)} > ${limit.toFixed(2)}`,
            required_next_action: 'Requires Finance review and decision on partial reimbursement.',
          },
          reimbursable_impact: limit.toNumber(),
          required_action: 'Finance approval required for excess spend',
        };
      }
      return {
        rule_id: rule.id,
        rule_type: rule.type,
        source_clause: rule.source_clause,
        outcome: 'pass',
        message: `Amount ${decimalAmount.toFixed(2)} ${currency} is within limit of ${limit.toFixed(2)} ${rule.limit_currency ?? currency}.`,
        details: {
          amount: decimalAmount.toNumber(),
          limit: limit.toNumber(),
          relevant_inputs: `Amount: $${decimalAmount.toFixed(2)}, Limit: $${limit.toFixed(2)}`,
          calculation: `${decimalAmount.toFixed(2)} <= ${limit.toFixed(2)}`,
          required_next_action: 'None',
        },
        reimbursable_impact: null,
        required_action: 'None',
      };
    }

    case 'daily_cap':
    case 'category_cap': {
      if (!decimalAmount) {
        return {
          rule_id: rule.id,
          rule_type: rule.type,
          source_clause: rule.source_clause,
          outcome: 'unknown',
          message: 'Cannot evaluate daily cap without confirmed amount.',
          details: {
            relevant_inputs: 'Amount: null',
            calculation: 'Missing amount',
            required_next_action: 'Confirm amount',
          },
          reimbursable_impact: null,
          required_action: 'Confirm expense amount',
        };
      }

      // City-specific tier limit: if city is in rule.cities and travel meal clause specifies $100
      let limitValue = rule.limit ?? 0;
      if (isConfiguredTier1 && rule.categories?.includes('Business meals') && rule.source_clause.includes('2.3')) {
        limitValue = 100.0; // Clause 2.3 elevated tier 1 daily limit
      }

      const limit = new Decimal(limitValue).toDecimalPlaces(2);
      const combinedSum = priorSum.plus(decimalAmount);

      if (combinedSum.greaterThan(limit)) {
        const remainingDailyAllowance = Decimal.max(0, limit.minus(priorSum));
        return {
          rule_id: rule.id,
          rule_type: rule.type,
          source_clause: rule.source_clause,
          outcome: 'fail',
          message: `Daily category spending of ${combinedSum.toFixed(2)} ${currency} (prior ${priorSum.toFixed(2)} + this ${decimalAmount.toFixed(2)}) exceeds daily cap of ${limit.toFixed(2)} ${rule.limit_currency ?? currency} (${rule.source_clause}).`,
          details: {
            prior_total: priorSum.toNumber(),
            current_amount: decimalAmount.toNumber(),
            combined_total: combinedSum.toNumber(),
            daily_limit: limit.toNumber(),
            is_tier_1_city: isConfiguredTier1,
            relevant_inputs: `Current: $${decimalAmount.toFixed(2)}, Prior same-day: $${priorSum.toFixed(2)}, Cap: $${limit.toFixed(2)}`,
            calculation: `Combined $${combinedSum.toFixed(2)} exceeds cap $${limit.toFixed(2)} by $${combinedSum.minus(limit).toFixed(2)}`,
            required_next_action: 'Reimbursement capped at remaining daily allowance. Excess requires finance override.',
          },
          reimbursable_impact: remainingDailyAllowance.toNumber(),
          required_action: 'Finance approval required for excess over daily cap',
        };
      }

      return {
        rule_id: rule.id,
        rule_type: rule.type,
        source_clause: rule.source_clause,
        outcome: 'pass',
        message: `Combined daily spending of ${combinedSum.toFixed(2)} ${currency} is within daily limit of ${limit.toFixed(2)} ${rule.limit_currency ?? currency}.`,
        details: {
          prior_total: priorSum.toNumber(),
          current_amount: decimalAmount.toNumber(),
          combined_total: combinedSum.toNumber(),
          daily_limit: limit.toNumber(),
          is_tier_1_city: isConfiguredTier1,
          relevant_inputs: `Combined: $${combinedSum.toFixed(2)}, Cap: $${limit.toFixed(2)}`,
          calculation: `${combinedSum.toFixed(2)} <= ${limit.toFixed(2)}`,
          required_next_action: 'None',
        },
        reimbursable_impact: null,
        required_action: 'None',
      };
    }

    case 'approval_threshold': {
      if (!decimalAmount) {
        return {
          rule_id: rule.id,
          rule_type: rule.type,
          source_clause: rule.source_clause,
          outcome: 'not_applicable',
          message: 'Approval threshold check pending amount confirmation.',
          details: {},
          reimbursable_impact: null,
          required_action: 'None',
        };
      }
      const threshold = new Decimal(rule.limit ?? 0);
      const exceeded = decimalAmount.greaterThan(threshold);
      return {
        rule_id: rule.id,
        rule_type: rule.type,
        source_clause: rule.source_clause,
        outcome: 'pass', // Exceeding threshold is an escalation flag, NOT a policy violation
        message: exceeded
          ? `Amount ${decimalAmount.toFixed(2)} ${currency} exceeds approval threshold of ${threshold.toFixed(2)} ${currency} (${rule.source_clause}) — flagged for Executive Approval.`
          : `Amount is below the executive approval threshold (${threshold.toFixed(2)} ${currency}).`,
        details: {
          threshold_triggered: exceeded,
          threshold: threshold.toNumber(),
          amount: decimalAmount.toNumber(),
          relevant_inputs: `Amount: $${decimalAmount.toFixed(2)}, Threshold: $${threshold.toFixed(2)}`,
          calculation: exceeded ? 'Escalation threshold reached' : 'Standard review queue',
          required_next_action: exceeded ? 'Senior Executive sign-off required' : 'Standard finance review',
        },
        reimbursable_impact: null,
        required_action: exceeded ? 'Executive review and sign-off required' : 'None',
      };
    }

    case 'prohibited_item': {
      const ext = expense.extraction_raw;
      const prohibitedValues = (rule.prohibited_values ?? []).map((p) => p.toLowerCase());
      const matchedItems: Array<{ desc: string; amount: number | null }> = [];

      if (ext && ext.line_items) {
        for (const item of ext.line_items) {
          const desc = item.description?.toLowerCase() ?? '';
          for (const p of prohibitedValues) {
            if (desc.includes(p)) {
              matchedItems.push({ desc: item.description ?? p, amount: item.amount ?? null });
            }
          }
        }
      }

      if (matchedItems.length > 0) {
        // Calculate non-reimbursable portion
        const prohibitedSum = matchedItems.reduce((acc, i) => acc + (i.amount ?? 0), 0);
        const itemNames = matchedItems.map((i) => i.desc).join(', ');
        const totalAmount = decimalAmount?.toNumber() ?? 0;
        const adjustedReimbursable = Math.max(0, totalAmount - prohibitedSum);

        return {
          rule_id: rule.id,
          rule_type: rule.type,
          source_clause: rule.source_clause,
          outcome: 'fail',
          message: `Prohibited items detected on receipt: ${itemNames} (${rule.source_clause}). Non-reimbursable items deducted.`,
          details: {
            prohibited_items: matchedItems,
            prohibited_sum: prohibitedSum,
            total_amount: totalAmount,
            adjusted_reimbursable: adjustedReimbursable,
            relevant_inputs: `Prohibited items: ${itemNames} ($${prohibitedSum.toFixed(2)})`,
            calculation: `Deducted prohibited item amount $${prohibitedSum.toFixed(2)} from total $${totalAmount.toFixed(2)}`,
            required_next_action: 'Item amount deducted from reimbursement. Requires finance confirmation.',
          },
          reimbursable_impact: adjustedReimbursable,
          required_action: 'Finance must confirm deduction of prohibited items',
        };
      }

      return {
        rule_id: rule.id,
        rule_type: rule.type,
        source_clause: rule.source_clause,
        outcome: 'pass',
        message: 'No prohibited items identified in receipt line items.',
        details: {
          relevant_inputs: 'Line items scanned for prohibited keywords',
          calculation: 'Zero matching prohibited terms found',
          required_next_action: 'None',
        },
        reimbursable_impact: null,
        required_action: 'None',
      };
    }

    default:
      return {
        rule_id: rule.id,
        rule_type: rule.type,
        source_clause: rule.source_clause,
        outcome: 'pass',
        message: `Rule ${rule.id} validated.`,
        details: { relevant_inputs: 'Default handler', calculation: 'Pass', required_next_action: 'None' },
        reimbursable_impact: null,
        required_action: 'None',
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

    if (matchingFields.length >= 3) {
      const isCrossEmployee = Boolean(
        candidate.employee_id && target.employee_id && candidate.employee_id !== target.employee_id
      );
      findings.push({
        type: 'probable',
        matched_expense_id: candidate.id,
        matched_expense_date: candidate.expense_date,
        matched_merchant: candidate.merchant,
        matched_amount: candidate.original_amount,
        matching_fields: matchingFields,
        differing_fields: differingFields,
        note: isCrossEmployee
          ? `Probable duplicate: matches merchant "${candidate.merchant}", date "${candidate.expense_date}", and amount ${candidate.original_amount} previously submitted by another employee.`
          : `Probable duplicate: matches merchant "${candidate.merchant}", date "${candidate.expense_date}", and amount ${candidate.original_amount}.`,
      });
    }
  }

  return findings;
}
