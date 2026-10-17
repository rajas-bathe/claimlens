import { createClient } from '@supabase/supabase-js';
import {
  SAMPLE_COMPANY,
  SAMPLE_STRUCTURED_RULES,
  SAMPLE_UNSUPPORTED_CLAUSES,
  SAMPLE_POLICY_DOCUMENT,
  SAMPLE_RECEIPT_FIXTURES,
} from '../src/lib/fixtures/sample-data.ts';
import { evaluateExpensePolicy } from '../src/lib/policy/engine.ts';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

async function runSeed() {
  console.log('Seeding ClaimLane workspace...');

  // 1. Get or create company
  let { data: company, error: cErr } = await supabase
    .from('companies')
    .select('*')
    .eq('slug', SAMPLE_COMPANY.slug)
    .single();

  if (cErr || !company) {
    const { data: newComp, error: createCErr } = await supabase
      .from('companies')
      .insert({
        name: SAMPLE_COMPANY.name,
        slug: SAMPLE_COMPANY.slug,
        settings: { default_currency: 'USD' },
      })
      .select()
      .single();
    if (createCErr) throw createCErr;
    company = newComp;
  }
  console.log('Company:', company.name, `(${company.id})`);

  // 2. Active policy
  let { data: policyVersion } = await supabase
    .from('policy_versions')
    .select('*')
    .eq('company_id', company.id)
    .eq('version_number', 1)
    .single();

  if (!policyVersion) {
    const { data: newPolicy, error: polErr } = await supabase
      .from('policy_versions')
      .insert({
        company_id: company.id,
        version_number: 1,
        status: 'active',
        source_document: SAMPLE_POLICY_DOCUMENT,
        structured_rules: SAMPLE_STRUCTURED_RULES,
        unsupported_clauses: SAMPLE_UNSUPPORTED_CLAUSES,
        confirmed_at: new Date().toISOString(),
        effective_from: '2026-01-01',
      })
      .select()
      .single();
    if (polErr) throw polErr;
    policyVersion = newPolicy;
  }
  console.log('Policy v1 active:', policyVersion.id);

  // 3. Employee ID
  const { data: memberships } = await supabase
    .from('memberships')
    .select('*')
    .eq('company_id', company.id);

  let employeeId = memberships?.find((m) => m.role === 'employee')?.user_id;
  if (!employeeId) {
    const { data: users } = await supabase.auth.admin.listUsers();
    employeeId = users?.users?.find(u => u.email === 'alex.chen@acme.com')?.id || users?.users?.[0]?.id;
  }
  console.log('Employee ID for claims:', employeeId);

  // 4. Seed sample expense fixtures
  let seededCount = 0;
  const existingExpenses = [];

  for (const fixture of SAMPLE_RECEIPT_FIXTURES) {
    const { data: existing } = await supabase
      .from('expenses')
      .select('id')
      .eq('company_id', company.id)
      .eq('receipt_file_hash', fixture.receipt_file_hash ?? '')
      .maybeSingle();

    if (!existing && fixture.receipt_file_hash) {
      const { data: exp, error: expErr } = await supabase
        .from('expenses')
        .insert({
          company_id: company.id,
          employee_id: employeeId,
          processing_status: fixture.processing_status ?? 'extracted',
          review_status: fixture.review_status ?? 'submitted',
          merchant: fixture.merchant,
          expense_date: fixture.expense_date,
          original_amount: fixture.original_amount,
          original_currency: fixture.original_currency,
          converted_amount: fixture.original_amount,
          converted_currency: fixture.original_currency ?? 'USD',
          category: fixture.category,
          city: fixture.city,
          trip_context: fixture.trip_context,
          business_purpose: fixture.business_purpose,
          client_name: fixture.client_name ?? null,
          attendee_count: fixture.attendee_count ?? null,
          receipt_file_hash: fixture.receipt_file_hash,
          extraction_raw: fixture.extraction_raw ?? null,
          policy_version_id: policyVersion.id,
        })
        .select()
        .single();

      if (expErr) {
        console.error('Error inserting fixture:', fixture.label, expErr.message);
        continue;
      }

      existingExpenses.push(exp);
      seededCount++;

      // Run deterministic evaluation
      const evalResult = evaluateExpensePolicy({
        expense: exp,
        activePolicyRules: SAMPLE_STRUCTURED_RULES,
        spendingHistory: existingExpenses,
        candidateDuplicates: existingExpenses,
      });

      await supabase.from('evaluations').insert({
        expense_id: exp.id,
        policy_version_id: policyVersion.id,
        evaluator_version: '1.0.0',
        inputs_snapshot: {
          merchant: exp.merchant,
          expense_date: exp.expense_date,
          original_amount: exp.original_amount,
          original_currency: exp.original_currency,
          category: exp.category,
          city: exp.city,
          trip_context: exp.trip_context,
        },
        rule_results: evalResult.rule_results,
        overall_outcome: evalResult.overall_outcome,
        reimbursable_amount: evalResult.reimbursable_amount,
        reimbursable_currency: evalResult.reimbursable_currency,
        duplicate_findings: evalResult.duplicate_findings,
        spending_context: evalResult.spending_context,
      });

      await supabase.from('review_events').insert({
        expense_id: exp.id,
        company_id: company.id,
        actor_id: employeeId,
        actor_role: 'employee',
        event_type: 'submitted',
        payload: { label: fixture.label, test_case: fixture.testCaseNote },
        note: `Sample fixture: ${fixture.testCaseNote}`,
      });
    }
  }

  console.log(`Seeding complete: ${seededCount} expenses created with evaluations and audit history.`);
}

runSeed().catch(console.error);
