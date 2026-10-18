import type { Expense, PolicyRule, UnsupportedClause } from '@/types';

export const SAMPLE_COMPANY = {
  name: 'Acme Global Technologies',
  slug: 'acme-tech',
};

export const SAMPLE_USERS = [
  {
    email: 'finance@acme.com',
    role: 'finance' as const,
    displayName: 'Elena Rostova (Finance Lead)',
  },
  {
    email: 'alex.chen@acme.com',
    role: 'employee' as const,
    displayName: 'Alex Chen (Sales Director)',
  },
  {
    email: 'sarah.miller@acme.com',
    role: 'employee' as const,
    displayName: 'Sarah Miller (Senior Engineer)',
  },
];

export const SAMPLE_POLICY_DOCUMENT = `ACME GLOBAL CORP - TRAVEL & EXPENSE POLICY (REV 2026.1)

1. SUBMISSION INTEGRITY & DOCUMENTATION
1.1 Every expense submission must be accompanied by a legible receipt showing printed merchant name, transaction date, and total amount.
1.2 Itemized receipts are mandatory for all hotel accommodations and for any meal claim exceeding $50.00 USD. Summarized credit card slips without item breakdown are unacceptable for these expenses.
1.3 Printed receipt figures must match line-item arithmetic. Discrepancies between printed totals and line item sums must be explained prior to reimbursement approval.

2. MEAL & SUBSISTENCE ALLOWANCES
2.1 Routine Local / Office Meals: Reimbursable up to a maximum daily cap of $25.00 USD per employee.
2.2 Business Travel Meals: For employees traveling on approved business trips outside their home office radius, the daily meal limit is $75.00 USD.
2.3 Tier 1 High-Cost Cities (New York, San Francisco, London, Zurich, Tokyo): The daily travel meal limit is elevated to $100.00 USD.
2.4 Cumulative Daily Cap: Multiple meal receipts submitted on the same calendar day accumulate toward the applicable daily cap. Spending exceeding the cap is non-reimbursable.

3. CLIENT ENTERTAINMENT & DINING
3.1 Client entertainment expenses require explicit entry of the verified Client/Company Name and the Total Number of Attendees.
3.2 Client meals are capped at $100.00 USD per attendee.
3.3 Executive Approval Threshold: Any single client entertainment expense exceeding $500.00 USD requires formal Senior Executive review before approval.

4. LODGING & AIR TRAVEL
4.1 Hotel lodging is capped at $250.00 USD per night standard, or $350.00 USD per night in Tier 1 high-cost cities.
4.2 Discretionary: Employees should choose standard rooms and avoid luxury boutique hotels whenever reasonably practical.

5. NON-REIMBURSABLE / PROHIBITED ITEMS
5.1 Personal purchases, tobacco, gambling, lottery tickets, hotel minibar consumables, and personal in-room movies are strictly prohibited and non-reimbursable.
5.2 Alcoholic beverages are only permissible during authorized client entertainment dinners, subject to a maximum of $30.00 USD per attendee.

6. CURRENCY CONVERSION & PAYMENTS
6.1 Claims incurred in foreign currencies must cite recognizable ISO currency codes. Transactions with ambiguous currency markers cannot be automatically reimbursed.`;

export const SAMPLE_STRUCTURED_RULES: PolicyRule[] = [
  {
    id: 'rule_meal_office_daily_cap',
    type: 'daily_cap',
    source_clause: 'Clause 2.1',
    supporting_text: 'Routine Local / Office Meals: Reimbursable up to a maximum daily cap of $25.00 USD per employee.',
    conditions: [{ field: 'trip_context', operator: 'eq', value: 'office' }],
    limit: 25.0,
    limit_currency: 'USD',
    aggregation_scope: 'daily',
    required_field: null,
    prohibited_values: null,
    exceptions: [],
    outcome: 'block',
    categories: ['Business meals'],
    cities: null,
    trip_contexts: ['office'],
  },
  {
    id: 'rule_meal_travel_daily_cap',
    type: 'daily_cap',
    source_clause: 'Clause 2.2 & 2.3',
    supporting_text: 'Business Travel Meals: daily limit is $75.00 USD standard, or $100.00 USD in Tier 1 High-Cost Cities.',
    conditions: [{ field: 'trip_context', operator: 'eq', value: 'business_trip' }],
    limit: 75.0,
    limit_currency: 'USD',
    aggregation_scope: 'daily',
    required_field: null,
    prohibited_values: null,
    exceptions: [{condition:{field:'city',operator:'in',value:['New York','San Francisco','London','Zurich','Tokyo']},override:{limit:100},note:'Clause 2.3 explicitly increases the daily travel allowance in these cities.'}],
    outcome: 'block',
    categories: ['Business meals'],
    cities: null,
    trip_contexts: ['business_trip'],
  },
  {
    id: 'rule_client_entertainment_attendee_cap',
    limit_basis: 'per_attendee',
    type: 'per_expense_cap',
    source_clause: 'Clause 3.2',
    supporting_text: 'Client meals are capped at $100.00 USD per attendee.',
    conditions: [],
    limit: 100.0,
    limit_currency: 'USD',
    aggregation_scope: 'per_expense',
    required_field: 'client_name',
    prohibited_values: null,
    exceptions: [],
    outcome: 'block',
    categories: ['Client entertainment'],
    cities: null,
    trip_contexts: null,
  },
  {
    id: 'rule_client_entertainment_exec_threshold',
    type: 'approval_threshold',
    source_clause: 'Clause 3.3',
    supporting_text: 'Any single client entertainment expense exceeding $500.00 USD requires formal Senior Executive review before approval.',
    conditions: [],
    limit: 500.0,
    limit_currency: 'USD',
    aggregation_scope: 'per_expense',
    required_field: null,
    prohibited_values: null,
    exceptions: [],
    outcome: 'require_approval',
    categories: ['Client entertainment'],
    cities: null,
    trip_contexts: null,
  },
  {
    id: 'rule_prohibited_items',
    type: 'prohibited_item',
    source_clause: 'Clause 5.1',
    supporting_text: 'Personal purchases, tobacco, gambling, lottery tickets, hotel minibar consumables are strictly prohibited.',
    conditions: [],
    limit: null,
    limit_currency: null,
    aggregation_scope: null,
    required_field: null,
    prohibited_values: ['tobacco', 'gambling', 'minibar', 'cigarette', 'cigar', 'lottery'],
    exceptions: [],
    outcome: 'block',
    categories: null,
    cities: null,
    trip_contexts: null,
  },
  {
    id:'policy_client_name_required',type:'client_entertainment_requirement',source_clause:'Clause 3.1',supporting_text:'Client entertainment expenses require explicit entry of the verified Client/Company Name and the Total Number of Attendees.',
    conditions:[],exceptions:[],limit:null,limit_currency:null,aggregation_scope:null,required_field:'client_name',prohibited_values:null,outcome:'require_field',categories:['Client entertainment'],cities:null,trip_contexts:null
  },
  {
    id:'policy_client_attendees_required',type:'required_field',source_clause:'Clause 3.1',supporting_text:'Client entertainment expenses require explicit entry of the verified Client/Company Name and the Total Number of Attendees.',
    conditions:[],exceptions:[],limit:null,limit_currency:null,aggregation_scope:null,required_field:'attendee_count',prohibited_values:null,outcome:'require_field',categories:['Client entertainment'],cities:null,trip_contexts:null
  },
  {
    id:'policy_itemization_mandatory',type:'itemization_requirement',source_clause:'Clause 1.2',supporting_text:'Itemized receipts are mandatory for all hotel accommodations and for any meal claim exceeding $50.00 USD.',
    conditions:[{field:'original_amount',operator:'gt',value:50}],exceptions:[],limit:null,limit_currency:null,aggregation_scope:null,required_field:null,prohibited_values:null,outcome:'require_field',categories:['Business meals'],cities:null,trip_contexts:null
  },
];

export const SAMPLE_UNSUPPORTED_CLAUSES: UnsupportedClause[] = [
  {
    clause_id: 'Clause 4.2',
    source_text: 'Employees should choose standard rooms and avoid luxury boutique hotels whenever reasonably practical.',
    reason: 'Discretionary recommendation without a computable pricing limit or measurable threshold.',
  },
];

/**
 * Fixture expenses covering all 15 acceptance criteria:
 * 1. Clean valid claim -> ready_for_approval
 * 2. Missing client name -> needs_information / fail
 * 3. Trip vs Office meal rules
 * 4. Two receipts jointly exceeding daily cap
 * 5. Exact & transformed duplicates
 * 6. Incomplete itemization on >$50 meal
 * 7. Missing or ambiguous currency
 * 8. Arithmetic inconsistency
 * 9. Executive approval threshold ($500+)
 */
export const SAMPLE_RECEIPT_FIXTURES: Array<Partial<Expense> & { label: string; testCaseNote: string }> = [
  {
    label: 'Clean Taxi Claim',
    testCaseNote: 'Criterion 1: Valid clean receipt with complete fields -> ready for approval',
    merchant: 'Yellow Cab Co',
    expense_date: '2026-10-05',
    original_amount: 32.5,
    original_currency: 'USD',
    category: 'Ground transport',
    city: 'Chicago',
    trip_context: 'office',
    business_purpose: 'Transit to client quarterly review',
    review_status: 'ready_for_approval',
    processing_status: 'extracted',
    receipt_file_hash: 'hash_taxi_001_clean',
    extraction_raw: {
      merchant: { value: 'Yellow Cab Co', confidence: 'high', source: 'printed', supporting_text: 'Yellow Cab Co', page_ref: 'p1' },
      invoice_number: { value: 'YC-88219', confidence: 'high', source: 'printed', supporting_text: 'Invoice: YC-88219', page_ref: 'p1' },
      printed_date: { value: '10/05/2026', confidence: 'high', source: 'printed', supporting_text: '10/05/2026', page_ref: 'p1' },
      normalized_date: { value: '2026-10-05', confidence: 'high', source: 'printed', supporting_text: '2026-10-05', page_ref: 'p1' },
      printed_currency: { value: '$', confidence: 'high', source: 'printed', supporting_text: '$', page_ref: 'p1' },
      normalized_currency: { value: 'USD', confidence: 'high', source: 'printed', supporting_text: 'USD', page_ref: 'p1' },
      subtotal: { value: 28.0, confidence: 'high', source: 'printed', supporting_text: 'Fare: 28.00', page_ref: 'p1' },
      tax: { value: 0, confidence: 'high', source: 'printed', supporting_text: null, page_ref: 'p1' },
      service_charge: { value: 0, confidence: 'high', source: 'printed', supporting_text: null, page_ref: 'p1' },
      tip: { value: 4.5, confidence: 'high', source: 'printed', supporting_text: 'Tip: 4.50', page_ref: 'p1' },
      discount: { value: 0, confidence: 'high', source: 'printed', supporting_text: null, page_ref: 'p1' },
      total: { value: 32.5, confidence: 'high', source: 'printed', supporting_text: 'Total: $32.50', page_ref: 'p1' },
      line_items: [{ description: 'Taxi meter fare', quantity: 1, unit_price: 28.0, amount: 28.0, page_ref: 'p1' }],
      itemization_completeness: 'complete',
      missing_fields: [],
      ambiguous_fields: [],
      unreadable_regions: [],
      conflicting_fields: [],
      arithmetic_check: { calculated_total: 32.5, printed_total: 32.5, discrepancy: 0, note: 'Matches exactly' },
      suggested_category: 'Ground transport',
      extraction_notes: [],
      page_references: { p1: 'Front page' },
    },
  },
  {
    label: 'Client Dinner Missing Client Name',
    testCaseNote: 'Criterion 2: Client entertainment missing client name triggers targeted request',
    merchant: 'The Capital Grille',
    expense_date: '2026-10-06',
    original_amount: 180.0,
    original_currency: 'USD',
    category: 'Client entertainment',
    city: 'New York',
    trip_context: 'business_trip',
    business_purpose: 'Dinner discussing contract extension',
    client_name: '', // MISSING!
    attendee_count: 2,
    review_status: 'needs_information',
    processing_status: 'extracted',
    receipt_file_hash: 'hash_capital_grille_002',
    extraction_raw: {
      merchant: { value: 'The Capital Grille', confidence: 'high', source: 'printed', supporting_text: 'The Capital Grille', page_ref: 'p1' },
      invoice_number: { value: 'CG-4011', confidence: 'high', source: 'printed', supporting_text: 'Check 4011', page_ref: 'p1' },
      printed_date: { value: '10/06/2026', confidence: 'high', source: 'printed', supporting_text: '10/06/2026', page_ref: 'p1' },
      normalized_date: { value: '2026-10-06', confidence: 'high', source: 'printed', supporting_text: '2026-10-06', page_ref: 'p1' },
      printed_currency: { value: '$', confidence: 'high', source: 'printed', supporting_text: '$', page_ref: 'p1' },
      normalized_currency: { value: 'USD', confidence: 'high', source: 'printed', supporting_text: 'USD', page_ref: 'p1' },
      subtotal: { value: 150.0, confidence: 'high', source: 'printed', supporting_text: 'Food: 150.00', page_ref: 'p1' },
      tax: { value: 13.5, confidence: 'high', source: 'printed', supporting_text: 'Tax: 13.50', page_ref: 'p1' },
      service_charge: { value: 0, confidence: 'high', source: 'printed', supporting_text: null, page_ref: 'p1' },
      tip: { value: 16.5, confidence: 'high', source: 'printed', supporting_text: 'Tip: 16.50', page_ref: 'p1' },
      discount: { value: 0, confidence: 'high', source: 'printed', supporting_text: null, page_ref: 'p1' },
      total: { value: 180.0, confidence: 'high', source: 'printed', supporting_text: 'Total: $180.00', page_ref: 'p1' },
      line_items: [
        { description: 'Steak Entree', quantity: 2, unit_price: 60.0, amount: 120.0, page_ref: 'p1' },
        { description: 'Dessert Platter', quantity: 1, unit_price: 30.0, amount: 30.0, page_ref: 'p1' },
      ],
      itemization_completeness: 'complete',
      missing_fields: [],
      ambiguous_fields: [],
      unreadable_regions: [],
      conflicting_fields: [],
      arithmetic_check: { calculated_total: 180.0, printed_total: 180.0, discrepancy: 0, note: 'Matches' },
      suggested_category: 'Client entertainment',
      extraction_notes: [],
      page_references: { p1: 'Bill receipt' },
    },
  },
  {
    label: 'Office Lunch Exceeding $25 Office Limit',
    testCaseNote: 'Criterion 3: Trip vs Office: A $35 meal in office fails $25 office cap (Clause 2.1), while on trip it would pass',
    merchant: 'Sweetgreen Metro',
    expense_date: '2026-10-08',
    original_amount: 34.5,
    original_currency: 'USD',
    category: 'Business meals',
    city: 'Chicago',
    trip_context: 'office', // Local office meal!
    business_purpose: 'Team working lunch',
    review_status: 'needs_review',
    processing_status: 'extracted',
    receipt_file_hash: 'hash_sweetgreen_003',
  },
  {
    label: 'Daily Cap Exceeded Part A',
    testCaseNote: 'Criterion 4: Two receipts on 2026-10-12 jointly exceed the $75 travel meal cap ($45 + $40 = $85)',
    merchant: 'Pret A Manger',
    expense_date: '2026-10-12',
    original_amount: 45.0,
    original_currency: 'USD',
    category: 'Business meals',
    city: 'Atlanta',
    trip_context: 'business_trip',
    business_purpose: 'Travel breakfast & lunch',
    review_status: 'approved',
    processing_status: 'extracted',
    receipt_file_hash: 'hash_pret_004a',
  },
  {
    label: 'Daily Cap Exceeded Part B',
    testCaseNote: 'Criterion 4: Evaluated together with Part A on 2026-10-12, exceeds daily cap',
    merchant: 'Bistro 77',
    expense_date: '2026-10-12',
    original_amount: 40.0,
    original_currency: 'USD',
    category: 'Business meals',
    city: 'Atlanta',
    trip_context: 'business_trip',
    business_purpose: 'Travel dinner',
    review_status: 'needs_review',
    processing_status: 'extracted',
    receipt_file_hash: 'hash_bistro_004b',
  },
  {
    label: 'Exact Duplicate Hash Submission',
    testCaseNote: 'Criterion 5: Binary identical receipt uploaded by another claim, flagged with exact SHA-256 match',
    merchant: 'Yellow Cab Co',
    expense_date: '2026-10-05',
    original_amount: 32.5,
    original_currency: 'USD',
    category: 'Ground transport',
    city: 'Chicago',
    trip_context: 'office',
    business_purpose: 'Duplicate submission test',
    review_status: 'needs_review',
    processing_status: 'extracted',
    receipt_file_hash: 'hash_taxi_001_clean', // IDENTICAL to Taxi Claim!
  },
  {
    label: 'Incomplete Itemization On High Value Meal',
    testCaseNote: 'Criterion 6: Meal over $50 lacking line itemization fails Clause 1.2',
    merchant: 'Grand Bistro',
    expense_date: '2026-10-14',
    original_amount: 85.0,
    original_currency: 'USD',
    category: 'Business meals',
    city: 'Boston',
    trip_context: 'business_trip',
    business_purpose: 'Conference dinner',
    review_status: 'needs_information',
    processing_status: 'extracted',
    receipt_file_hash: 'hash_grand_bistro_006',
    extraction_raw: {
      merchant: { value: 'Grand Bistro', confidence: 'high', source: 'printed', supporting_text: 'Grand Bistro', page_ref: 'p1' },
      invoice_number: { value: null, confidence: null, source: null, supporting_text: null, page_ref: null },
      printed_date: { value: '10/14/2026', confidence: 'high', source: 'printed', supporting_text: '10/14/2026', page_ref: 'p1' },
      normalized_date: { value: '2026-10-14', confidence: 'high', source: 'printed', supporting_text: '2026-10-14', page_ref: 'p1' },
      printed_currency: { value: '$', confidence: 'high', source: 'printed', supporting_text: '$', page_ref: 'p1' },
      normalized_currency: { value: 'USD', confidence: 'high', source: 'printed', supporting_text: 'USD', page_ref: 'p1' },
      subtotal: { value: null, confidence: null, source: null, supporting_text: null, page_ref: null },
      tax: { value: null, confidence: null, source: null, supporting_text: null, page_ref: null },
      service_charge: { value: null, confidence: null, source: null, supporting_text: null, page_ref: null },
      tip: { value: null, confidence: null, source: null, supporting_text: null, page_ref: null },
      discount: { value: null, confidence: null, source: null, supporting_text: null, page_ref: null },
      total: { value: 85.0, confidence: 'high', source: 'printed', supporting_text: 'Total: $85.00', page_ref: 'p1' },
      line_items: [], // INCOMPLETE!
      itemization_completeness: 'none',
      missing_fields: ['line_items', 'subtotal', 'tax'],
      ambiguous_fields: [],
      unreadable_regions: [],
      conflicting_fields: [],
      arithmetic_check: null,
      suggested_category: 'Business meals',
      extraction_notes: ['Credit card slip only, no itemization breakdown'],
      page_references: { p1: 'Terminal receipt' },
    },
  },
  {
    label: 'Ambiguous Foreign Currency Claim',
    testCaseNote: 'Criterion 7: Unknown/ambiguous currency symbol prevents unsupported conversion',
    merchant: 'Cafe de Flore',
    expense_date: '2026-10-15',
    original_amount: 45.0,
    original_currency: null, // AMBIGUOUS!
    category: 'Business meals',
    city: 'Paris',
    trip_context: 'business_trip',
    business_purpose: 'European partnership meeting',
    review_status: 'needs_information',
    processing_status: 'extracted',
    receipt_file_hash: 'hash_cafe_paris_007',
  },
  {
    label: 'Arithmetic Discrepancy In Printed Bill',
    testCaseNote: 'Criterion 8: Line items ($20 + $15 + $5 tax = $40) conflict with printed total ($48) -> preserved and flagged',
    merchant: 'Downtown Print & Copy',
    expense_date: '2026-10-16',
    original_amount: 48.0,
    original_currency: 'USD',
    category: 'Office supplies',
    city: 'Chicago',
    trip_context: 'office',
    business_purpose: 'Client pitch deck binding and printing',
    review_status: 'needs_review',
    processing_status: 'extracted',
    receipt_file_hash: 'hash_print_008',
    extraction_raw: {
      merchant: { value: 'Downtown Print & Copy', confidence: 'high', source: 'printed', supporting_text: 'Downtown Print & Copy', page_ref: 'p1' },
      invoice_number: { value: 'DPC-901', confidence: 'high', source: 'printed', supporting_text: 'Inv 901', page_ref: 'p1' },
      printed_date: { value: '10/16/2026', confidence: 'high', source: 'printed', supporting_text: '10/16/2026', page_ref: 'p1' },
      normalized_date: { value: '2026-10-16', confidence: 'high', source: 'printed', supporting_text: '2026-10-16', page_ref: 'p1' },
      printed_currency: { value: '$', confidence: 'high', source: 'printed', supporting_text: '$', page_ref: 'p1' },
      normalized_currency: { value: 'USD', confidence: 'high', source: 'printed', supporting_text: 'USD', page_ref: 'p1' },
      subtotal: { value: 35.0, confidence: 'high', source: 'printed', supporting_text: 'Sub: 35.00', page_ref: 'p1' },
      tax: { value: 5.0, confidence: 'high', source: 'printed', supporting_text: 'Tax: 5.00', page_ref: 'p1' },
      service_charge: { value: 0, confidence: 'high', source: 'printed', supporting_text: null, page_ref: 'p1' },
      tip: { value: 0, confidence: 'high', source: 'printed', supporting_text: null, page_ref: 'p1' },
      discount: { value: 0, confidence: 'high', source: 'printed', supporting_text: null, page_ref: 'p1' },
      total: { value: 48.0, confidence: 'high', source: 'printed', supporting_text: 'Total: $48.00', page_ref: 'p1' }, // Printed total is 48, items sum to 40!
      line_items: [
        { description: 'Color presentations', quantity: 2, unit_price: 10.0, amount: 20.0, page_ref: 'p1' },
        { description: 'Coil binding service', quantity: 3, unit_price: 5.0, amount: 15.0, page_ref: 'p1' },
      ],
      itemization_completeness: 'complete',
      missing_fields: [],
      ambiguous_fields: [],
      unreadable_regions: [],
      conflicting_fields: [],
      arithmetic_check: {
        calculated_total: 40.0,
        printed_total: 48.0,
        discrepancy: 8.0,
        note: 'Sum of items and tax ($40.00) does not match printed total ($48.00). Unexplained $8.00 difference.',
      },
      suggested_category: 'Office supplies',
      extraction_notes: ['Discrepancy detected'],
      page_references: { p1: 'Receipt invoice' },
    },
  },
  {
    label: 'Prohibited Items (Minibar & Tobacco)',
    testCaseNote: 'Criterion 6: Receipt with prohibited item (minibar consumables) fails policy check',
    merchant: 'Marriott Downtown',
    expense_date: '2026-10-18',
    original_amount: 145.0,
    original_currency: 'USD',
    category: 'Accommodation',
    city: 'Denver',
    trip_context: 'business_trip',
    business_purpose: 'Regional sales kickoff lodging',
    review_status: 'needs_review',
    processing_status: 'extracted',
    receipt_file_hash: 'hash_marriott_minibar_009',
    extraction_raw: {
      merchant: { value: 'Marriott Downtown', confidence: 'high', source: 'printed', supporting_text: 'Marriott Downtown', page_ref: 'p1' },
      invoice_number: { value: 'MD-7712', confidence: 'high', source: 'printed', supporting_text: 'Folio 7712', page_ref: 'p1' },
      printed_date: { value: '10/18/2026', confidence: 'high', source: 'printed', supporting_text: '10/18/2026', page_ref: 'p1' },
      normalized_date: { value: '2026-10-18', confidence: 'high', source: 'printed', supporting_text: '2026-10-18', page_ref: 'p1' },
      printed_currency: { value: '$', confidence: 'high', source: 'printed', supporting_text: '$', page_ref: 'p1' },
      normalized_currency: { value: 'USD', confidence: 'high', source: 'printed', supporting_text: 'USD', page_ref: 'p1' },
      subtotal: { value: 130.0, confidence: 'high', source: 'printed', supporting_text: null, page_ref: 'p1' },
      tax: { value: 15.0, confidence: 'high', source: 'printed', supporting_text: null, page_ref: 'p1' },
      service_charge: { value: 0, confidence: 'high', source: 'printed', supporting_text: null, page_ref: 'p1' },
      tip: { value: 0, confidence: 'high', source: 'printed', supporting_text: null, page_ref: 'p1' },
      discount: { value: 0, confidence: 'high', source: 'printed', supporting_text: null, page_ref: 'p1' },
      total: { value: 145.0, confidence: 'high', source: 'printed', supporting_text: 'Total: $145.00', page_ref: 'p1' },
      line_items: [
        { description: 'Standard King Room', quantity: 1, unit_price: 110.0, amount: 110.0, page_ref: 'p1' },
        { description: 'Minibar snack selection', quantity: 1, unit_price: 20.0, amount: 20.0, page_ref: 'p1' }, // PROHIBITED!
      ],
      itemization_completeness: 'complete',
      missing_fields: [],
      ambiguous_fields: [],
      unreadable_regions: [],
      conflicting_fields: [],
      arithmetic_check: { calculated_total: 145.0, printed_total: 145.0, discrepancy: 0, note: 'Matches' },
      suggested_category: 'Accommodation',
      extraction_notes: [],
      page_references: { p1: 'Hotel Folio' },
    },
  },
  {
    label: 'Executive Approval Threshold Trigger ($720)',
    testCaseNote: 'Criterion 1: Client dining exceeding $500 threshold triggers Executive Approval escalation flag',
    merchant: 'Nobu Downtown',
    expense_date: '2026-10-20',
    original_amount: 720.0,
    original_currency: 'USD',
    category: 'Client entertainment',
    city: 'New York',
    trip_context: 'business_trip',
    business_purpose: 'Enterprise account closing banquet',
    client_name: 'Vertex Financial Holdings',
    attendee_count: 8, // $720 / 8 = $90 per attendee (under $100 per attendee cap!)
    review_status: 'needs_review',
    processing_status: 'extracted',
    receipt_file_hash: 'hash_nobu_exec_010',
  },
];
