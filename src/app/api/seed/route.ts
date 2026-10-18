import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import {
  SAMPLE_COMPANY,
  SAMPLE_STRUCTURED_RULES,
  SAMPLE_UNSUPPORTED_CLAUSES,
  SAMPLE_POLICY_DOCUMENT,
  SAMPLE_RECEIPT_FIXTURES,
} from '@/lib/fixtures/sample-data';
import { evaluateExpensePolicy } from '@/lib/policy/engine';
import { requireFinanceSession } from '@/lib/supabase/auth';

// POST /api/seed
// Populates the workspace with sample company, active policy, and initial fixtures
export async function POST(req: NextRequest) {
  try {
    await requireFinanceSession();
    if(process.env.ENABLE_SAMPLE_SEED !== 'true') return NextResponse.json({success:false,error:'Sample initialization is disabled. Existing workspace data is preserved.'},{status:403});
    const supabase = createServiceClient();

    // 1. Get or create sample company
    let { data: company } = await supabase
      .from('companies')
      .select('*')
      .eq('slug', SAMPLE_COMPANY.slug)
      .single();

    if (!company) {
      const { data: createdCompany, error: compErr } = await supabase
        .from('companies')
        .insert({
          name: SAMPLE_COMPANY.name,
          slug: SAMPLE_COMPANY.slug,
          settings: { default_currency: 'USD' },
        })
        .select()
        .single();

      if (compErr || !createdCompany) {
        return NextResponse.json(
          { success: false, error: compErr?.message ?? 'Failed to create sample company' },
          { status: 500 }
        );
      }
      company = createdCompany;
    }

    // 2. Get or create active policy version
    let { data: policyVersion } = await supabase
      .from('policy_versions')
      .select('*')
      .eq('company_id', company.id)
      .eq('version_number', 1)
      .single();

    if (!policyVersion) {
      const { data: createdPolicy, error: polErr } = await supabase
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

      if (polErr || !createdPolicy) {
        return NextResponse.json(
          { success: false, error: polErr?.message ?? 'Failed to create active policy version' },
          { status: 500 }
        );
      }
      policyVersion = createdPolicy;
    }

    // 3. Find any existing employee user or fallback
    const { data: memberships } = await supabase
      .from('memberships')
      .select('*')
      .eq('company_id', company.id);

    let defaultEmployeeId = memberships?.find((m) => m.role === 'employee')?.user_id;

    if (!defaultEmployeeId) {
      // Use any existing auth user or system ID
      const { data: authUsers } = await supabase.auth.admin.listUsers();
      if (authUsers?.users && authUsers.users.length > 0) {
        defaultEmployeeId = authUsers.users[0].id;
      } else {
        // Generate a random UUID for demo seeding
        defaultEmployeeId = '00000000-0000-0000-0000-000000000001';
      }
    }

    // 4. Seed sample expense fixtures
    const createdExpenses = [];
    for (const fixture of SAMPLE_RECEIPT_FIXTURES) {
      // Check if already seeded
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
            employee_id: defaultEmployeeId,
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

        if (exp) {
          createdExpenses.push(exp);

          // Run deterministic evaluation
          const evalResult = evaluateExpensePolicy({
            expense: exp,
            activePolicyRules: SAMPLE_STRUCTURED_RULES,
            spendingHistory: createdExpenses,
            candidateDuplicates: createdExpenses,
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
            actor_id: defaultEmployeeId,
            actor_role: 'employee',
            event_type: 'submitted',
            payload: { label: fixture.label, test_case: fixture.testCaseNote },
            note: `Sample fixture: ${fixture.testCaseNote}`,
          });
        }
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        company_id: company.id,
        policy_version_id: policyVersion.id,
        seeded_expenses_count: createdExpenses.length,
        message: 'Workspace successfully initialized with company, policy rules, and sample expense fixtures.',
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Internal error';
    return NextResponse.json({ success: false, error: msg }, { status: msg === 'UNAUTHORIZED' ? 401 : msg === 'FORBIDDEN' ? 403 : 500 });
  }
}

export async function GET() { return NextResponse.json({error:'Use the explicitly enabled finance-only POST action.'},{status:405,headers:{Allow:'POST'}}); }
