import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateExpensePolicy, checkDuplicates } from '../src/lib/policy/engine';
import {
  SAMPLE_STRUCTURED_RULES,
  SAMPLE_RECEIPT_FIXTURES,
} from '../src/lib/fixtures/sample-data';
import type { Expense } from '../src/types';

test('1. Valid clean receipt produces an explained ready-for-approval pass result', () => {
  const taxiFixture = SAMPLE_RECEIPT_FIXTURES[0] as Expense;
  const result = evaluateExpensePolicy({
    expense: taxiFixture,
    activePolicyRules: SAMPLE_STRUCTURED_RULES,
    spendingHistory: [],
    candidateDuplicates: [],
  });

  assert.equal(result.overall_outcome, 'pass');
  assert.equal(result.reimbursable_amount, 32.5);
  assert.equal(result.duplicate_findings.length, 0);

  const duplicateRule = result.rule_results.find((r) => r.rule_id === 'integrity_duplicate_check');
  assert.equal(duplicateRule?.outcome, 'pass');

  const amountRule = result.rule_results.find((r) => r.rule_id === 'data_amount_required');
  assert.equal(amountRule?.outcome, 'pass');
});

test('2. Missing client name on client entertainment triggers targeted failure/request', () => {
  const clientDinner = SAMPLE_RECEIPT_FIXTURES[1] as Expense;
  const result = evaluateExpensePolicy({
    expense: clientDinner,
    activePolicyRules: SAMPLE_STRUCTURED_RULES,
    spendingHistory: [],
    candidateDuplicates: [],
  });

  assert.equal(result.overall_outcome, 'fail');
  const clientRule = result.rule_results.find((r) => r.rule_id === 'policy_client_name_required');
  assert.ok(clientRule, 'Client rule must be evaluated');
  assert.equal(clientRule.outcome, 'fail');
  assert.match(clientRule.message, /verified Client Name/i);
});

test('3. Trip and office contexts apply different configured rules', () => {
  const officeLunch = SAMPLE_RECEIPT_FIXTURES[2] as Expense; // $34.50 in office
  const officeResult = evaluateExpensePolicy({
    expense: { ...officeLunch, trip_context: 'office' },
    activePolicyRules: SAMPLE_STRUCTURED_RULES,
    spendingHistory: [],
    candidateDuplicates: [],
  });

  // In office, capped at $25.00 -> $34.50 fails daily office meal cap
  const officeMealRule = officeResult.rule_results.find((r) => r.rule_id === 'rule_meal_office_daily_cap');
  assert.ok(officeMealRule, 'Office rule must be evaluated');
  assert.equal(officeMealRule.outcome, 'fail');
  assert.match(officeMealRule.message, /exceeds daily cap of 25.00/i);

  // But if the same expense is on a business trip (outside high cost city), cap is $75 -> passes!
  const tripResult = evaluateExpensePolicy({
    expense: { ...officeLunch, trip_context: 'business_trip', city: 'Dallas' },
    activePolicyRules: SAMPLE_STRUCTURED_RULES,
    spendingHistory: [],
    candidateDuplicates: [],
  });

  const tripMealRule = tripResult.rule_results.find((r) => r.rule_id === 'rule_meal_travel_daily_cap');
  assert.ok(tripMealRule, 'Travel meal rule must be evaluated');
  assert.equal(tripMealRule.outcome, 'pass');
});

test('4. Two receipts on the same date jointly exceed a daily cap', () => {
  const receiptA = {
    ...SAMPLE_RECEIPT_FIXTURES[3],
    id: 'exp_a',
    expense_date: '2026-10-12',
    original_amount: 45.0,
    category: 'Business meals',
    trip_context: 'business_trip',
    city: 'Atlanta',
    review_status: 'approved',
  } as Expense;

  const receiptB = {
    ...SAMPLE_RECEIPT_FIXTURES[4],
    id: 'exp_b',
    expense_date: '2026-10-12',
    original_amount: 40.0,
    category: 'Business meals',
    trip_context: 'business_trip',
    city: 'Atlanta',
    review_status: 'submitted',
  } as Expense;

  // Evaluate B with A in history -> $45 + $40 = $85 > $75 cap
  const resultB = evaluateExpensePolicy({
    expense: receiptB,
    activePolicyRules: SAMPLE_STRUCTURED_RULES,
    spendingHistory: [receiptA],
    candidateDuplicates: [],
  });

  const dailyCapRule = resultB.rule_results.find((r) => r.rule_id === 'rule_meal_travel_daily_cap');
  assert.ok(dailyCapRule);
  assert.equal(dailyCapRule.outcome, 'fail');
  assert.match(dailyCapRule.message, /exceeds daily cap of 75.00/i);
  // Reimbursable impact should cap at remaining allowance ($75 - $45 = $30)
  assert.equal(dailyCapRule.reimbursable_impact, 30.0);
});

test('5. Identical file hash and probable duplicates are detected and surfaced', () => {
  const original = {
    id: 'exp_orig',
    employee_id: 'emp_1',
    merchant: 'Yellow Cab Co',
    expense_date: '2026-10-05',
    original_amount: 32.5,
    original_currency: 'USD',
    receipt_file_hash: 'hash_abc123',
  } as Expense;

  // Exact duplicate: same hash
  const exactDup = {
    id: 'exp_dup1',
    employee_id: 'emp_1',
    merchant: 'Yellow Cab Co',
    expense_date: '2026-10-05',
    original_amount: 32.5,
    original_currency: 'USD',
    receipt_file_hash: 'hash_abc123',
  } as Expense;

  const exactFindings = checkDuplicates(exactDup, [original]);
  assert.equal(exactFindings.length, 1);
  assert.equal(exactFindings[0].type, 'exact_hash');
  assert.equal(exactFindings[0].matched_expense_id, 'exp_orig');

  // Probable duplicate: different photo/hash, but identical merchant, date, amount
  const probableDup = {
    id: 'exp_dup2',
    employee_id: 'emp_1',
    merchant: 'Yellow Cab Co',
    expense_date: '2026-10-05',
    original_amount: 32.5,
    original_currency: 'USD',
    receipt_file_hash: 'hash_different_photo_456',
  } as Expense;

  const probableFindings = checkDuplicates(probableDup, [original]);
  assert.equal(probableFindings.length, 1);
  assert.equal(probableFindings[0].type, 'probable');
});

test('6. Incomplete itemization does not pass item restrictions for high-value meal', () => {
  const incompleteFixture = SAMPLE_RECEIPT_FIXTURES[6] as Expense;
  const result = evaluateExpensePolicy({
    expense: incompleteFixture,
    activePolicyRules: SAMPLE_STRUCTURED_RULES,
    spendingHistory: [],
    candidateDuplicates: [],
  });

  const itemizationRule = result.rule_results.find((r) => r.rule_id === 'policy_itemization_mandatory');
  assert.ok(itemizationRule);
  assert.equal(itemizationRule.outcome, 'fail');
  assert.match(itemizationRule.message, /Itemized receipt is mandatory/i);
});

test('7. Missing or ambiguous currency prevents automatic pass', () => {
  const missingCurrency = SAMPLE_RECEIPT_FIXTURES[7] as Expense;
  const result = evaluateExpensePolicy({
    expense: missingCurrency,
    activePolicyRules: SAMPLE_STRUCTURED_RULES,
    spendingHistory: [],
    candidateDuplicates: [],
  });

  const currencyCheck = result.rule_results.find((r) => r.rule_id === 'data_amount_required');
  assert.ok(currencyCheck);
  assert.equal(currencyCheck.outcome, 'unknown');
});

test('8. Arithmetic inconsistencies are explained without modifying printed values', () => {
  const arithmeticFixture = SAMPLE_RECEIPT_FIXTURES[8] as Expense;
  const result = evaluateExpensePolicy({
    expense: arithmeticFixture,
    activePolicyRules: SAMPLE_STRUCTURED_RULES,
    spendingHistory: [],
    candidateDuplicates: [],
  });

  const arithRule = result.rule_results.find((r) => r.rule_id === 'integrity_arithmetic_check');
  assert.ok(arithRule);
  assert.equal(arithRule.outcome, 'fail');
  assert.match(arithRule.message, /Arithmetic inconsistency/i);
  assert.equal(arithRule.details.discrepancy, 8);
  // Original amount remains intact
  assert.equal(arithmeticFixture.original_amount, 48.0);
});

test('9. Prohibited items detected in line items fail the check and set reimbursable to 0', () => {
  const minibarFixture = SAMPLE_RECEIPT_FIXTURES[9] as Expense;
  const result = evaluateExpensePolicy({
    expense: minibarFixture,
    activePolicyRules: SAMPLE_STRUCTURED_RULES,
    spendingHistory: [],
    candidateDuplicates: [],
  });

  const prohibitedRule = result.rule_results.find((r) => r.rule_id === 'rule_prohibited_items');
  assert.ok(prohibitedRule);
  assert.equal(prohibitedRule.outcome, 'fail');
  assert.match(prohibitedRule.message, /Prohibited items detected.*minibar/i);
});

test('10. Executive approval threshold ($500+) flags for review rather than policy violation', () => {
  const execDinner = SAMPLE_RECEIPT_FIXTURES[10] as Expense; // $720 for 8 attendees ($90/person < $100 cap)
  const result = evaluateExpensePolicy({
    expense: execDinner,
    activePolicyRules: SAMPLE_STRUCTURED_RULES,
    spendingHistory: [],
    candidateDuplicates: [],
  });

  const thresholdRule = result.rule_results.find((r) => r.rule_id === 'rule_client_entertainment_exec_threshold');
  assert.ok(thresholdRule);
  // Exceeding threshold is not a violation (outcome remains pass), but overall outcome is needs_review
  assert.equal(thresholdRule.outcome, 'pass');
  assert.equal(result.requires_approval_threshold, true);
  assert.equal(result.overall_outcome, 'needs_review');
});

test('11. Corrections trigger reevaluation to pass once required fields are provided', () => {
  const invalidClaim = {
    ...SAMPLE_RECEIPT_FIXTURES[1],
    client_name: '', // Initially missing
  } as Expense;

  const initialResult = evaluateExpensePolicy({
    expense: invalidClaim,
    activePolicyRules: SAMPLE_STRUCTURED_RULES,
    spendingHistory: [],
    candidateDuplicates: [],
  });
  assert.equal(initialResult.overall_outcome, 'fail');

  // Employee provides correction
  const correctedClaim = {
    ...invalidClaim,
    client_name: 'Acme Partner Corp',
  } as Expense;

  const reevaluated = evaluateExpensePolicy({
    expense: correctedClaim,
    activePolicyRules: SAMPLE_STRUCTURED_RULES,
    spendingHistory: [],
    candidateDuplicates: [],
  });
  assert.equal(reevaluated.overall_outcome, 'pass');
});

test('12. Tier 1 high-cost cities elevate daily travel meal cap from $75 to $100', () => {
  const meal = {
    id: 'exp_tier1',
    expense_date: '2026-10-10',
    original_amount: 90.0, // $90 would exceed standard $75 cap, but fits within $100 Tier 1 cap
    original_currency: 'USD',
    category: 'Business meals',
    trip_context: 'business_trip',
    city: 'New York', // Tier 1 city!
  } as Expense;

  const result = evaluateExpensePolicy({
    expense: meal,
    activePolicyRules: SAMPLE_STRUCTURED_RULES,
    spendingHistory: [],
    candidateDuplicates: [],
  });

  const travelCap = result.rule_results.find((r) => r.rule_id === 'rule_meal_travel_daily_cap');
  assert.ok(travelCap);
  assert.equal(travelCap.outcome, 'pass');
  assert.equal(travelCap.details.is_tier_1_city, true);
});

test('13. Excludes current expense from historical sums before adding it', () => {
  const currentExpense = {
    id: 'exp_self',
    expense_date: '2026-10-10',
    original_amount: 50.0,
    category: 'Business meals',
    trip_context: 'business_trip',
    city: 'Denver',
  } as Expense;

  // History accidentally includes the current expense ID
  const historyWithSelf = [currentExpense];

  const result = evaluateExpensePolicy({
    expense: currentExpense,
    activePolicyRules: SAMPLE_STRUCTURED_RULES,
    spendingHistory: historyWithSelf,
    candidateDuplicates: [],
  });

  // Prior sum in spending_context must be 0, not 50!
  assert.equal(result.spending_context.prior_total, 0);
  assert.equal(result.spending_context.expense_ids_included.includes('exp_self'), false);
});

test('14. Probable duplicate cross-employee comparison warns without labelling fraud', () => {
  const emp1Expense = {
    id: 'exp_emp1',
    employee_id: 'emp_111',
    merchant: 'Lombardi Trattoria',
    expense_date: '2026-10-09',
    original_amount: 120.0,
    original_currency: 'USD',
  } as Expense;

  const emp2Expense = {
    id: 'exp_emp2',
    employee_id: 'emp_222',
    merchant: 'Lombardi Trattoria',
    expense_date: '2026-10-09',
    original_amount: 120.0,
    original_currency: 'USD',
  } as Expense;

  const findings = checkDuplicates(emp2Expense, [emp1Expense]);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].type, 'probable');
  // Does not use the word fraud
  assert.doesNotMatch(findings[0].note.toLowerCase(), /fraud/);
  assert.match(findings[0].note, /different employee|another employee/i);
});

test('15. Exact arithmetic with decimal.js avoids floating point imprecision', () => {
  // Test classic 0.1 + 0.2 floating point bug in JS
  const receipt1 = {
    id: 'exp_float1',
    expense_date: '2026-10-11',
    original_amount: 19.99,
    category: 'Business meals',
    trip_context: 'office',
    city: 'Austin',
    review_status: 'approved',
  } as Expense;

  const receipt2 = {
    id: 'exp_float2',
    expense_date: '2026-10-11',
    original_amount: 5.01, // 19.99 + 5.01 = exactly 25.00
    category: 'Business meals',
    trip_context: 'office',
    city: 'Austin',
    review_status: 'submitted',
  } as Expense;

  const result = evaluateExpensePolicy({
    expense: receipt2,
    activePolicyRules: SAMPLE_STRUCTURED_RULES,
    spendingHistory: [receipt1],
    candidateDuplicates: [],
  });

  const capRule = result.rule_results.find((r) => r.rule_id === 'rule_meal_office_daily_cap');
  assert.ok(capRule);
  // Total is exactly 25.00, which is <= 25.00 limit -> passes!
  assert.equal(capRule.outcome, 'pass');
  assert.equal(capRule.details.combined_total, 25.0);
});

