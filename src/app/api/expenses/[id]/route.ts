import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/supabase/auth';
import { createServiceClient } from '@/lib/supabase/server';
import { evaluateAndPersistExpense, findApplicablePolicy } from '@/lib/policy/service';
import Decimal from 'decimal.js';

const ALLOWED_REVIEW_TRANSITIONS: Record<string, string[]> = {
  draft: ['submitted', 'draft'],
  submitted: ['needs_information', 'needs_review', 'ready_for_approval', 'approved', 'rejected'],
  needs_information: ['submitted'],
  needs_review: ['ready_for_approval', 'rejected', 'needs_information', 'approved'],
  ready_for_approval: ['approved', 'rejected', 'needs_review', 'needs_information'],
  approved: ['reopened'],
  rejected: ['submitted', 'reopened'],
};

// PATCH /api/expenses/[id]
// Updates expense fields, validates transitions, and triggers policy evaluations
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireSession();
    const { id } = await params;
    const body = await req.json();

    const supabase = createServiceClient();

    // 1. Load existing expense
    const { data: expense, error: fetchError } = await supabase
      .from('expenses')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchError || !expense) {
      return NextResponse.json({ success: false, error: 'Expense not found' }, { status: 404 });
    }

    // 2. Authorization
    const isOwner = expense.employee_id === session.id;
    const isFinance = session.membership.role === 'finance' && expense.company_id === session.membership.company_id;
    if (!isOwner && !isFinance) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    // 3. Build updates with field-level provenance
    const updateData: Record<string, unknown> = {};
    const confirmedFields = { ...(expense.confirmed_fields ?? {}) };
    const fieldSource = isFinance ? 'finance' : 'employee';
    const now = new Date().toISOString();

    const EDITABLE_FIELDS = [
      'merchant', 'expense_date', 'original_amount', 'original_currency',
      'category', 'city', 'trip_context', 'business_purpose',
      'client_name', 'attendee_count', 'attendee_names', 'invoice_number',
    ];

    let fieldsChangedCount = 0;
    const changedFieldNames: string[] = [];

    for (const field of EDITABLE_FIELDS) {
      if (field in body && body[field] !== undefined && body[field] !== expense[field]) {
        updateData[field] = body[field];
        fieldsChangedCount++;
        changedFieldNames.push(field);
        confirmedFields[field] = {
          value: body[field],
          source: fieldSource,
          updated_at: now,
          updated_by: session.id,
        };
      }
    }
    updateData.confirmed_fields = confirmedFields;

    // 4. Validate review status transition
    const requestedStatus = body.review_status as string | undefined;
    let isOverride = false;

    if (requestedStatus && requestedStatus !== expense.review_status) {
      const allowed = ALLOWED_REVIEW_TRANSITIONS[expense.review_status] ?? [];
      if (!allowed.includes(requestedStatus)) {
        return NextResponse.json(
          { success: false, error: `Cannot transition from ${expense.review_status} to ${requestedStatus}` },
          { status: 400 }
        );
      }

      // Check approval requirements
      if (requestedStatus === 'approved') {
        if (!isFinance) {
          return NextResponse.json({ success: false, error: 'Only Finance can approve expenses' }, { status: 403 });
        }

        // Fetch latest evaluation
        const { data: latestEvaluation } = await supabase
          .from('evaluations')
          .select('*')
          .eq('expense_id', id)
          .order('evaluated_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        // If no evaluation or evaluation did not cleanly pass, approval requires an explicit reason
        if (!latestEvaluation || latestEvaluation.overall_outcome !== 'pass') {
          if (!body.note || body.note.trim().length === 0) {
            return NextResponse.json(
              {
                success: false,
                error: 'Approval of a claim without a passing evaluation is a Policy Override and requires an explicit justification note.',
              },
              { status: 400 }
            );
          }
          isOverride = true;
        }

        // Check concurrent daily allowance on target date
        const targetDate = updateData.expense_date ?? expense.expense_date;
        const targetCategory = updateData.category ?? expense.category;
        const targetAmount = updateData.original_amount ?? expense.original_amount;

        if (targetDate && targetCategory && targetAmount) {
          const { data: sameDayApproved } = await supabase
            .from('expenses')
            .select('id, original_amount')
            .eq('company_id', expense.company_id)
            .eq('employee_id', expense.employee_id)
            .eq('expense_date', targetDate)
            .eq('category', targetCategory)
            .eq('review_status', 'approved')
            .neq('id', id);

          const priorApprovedSum = (sameDayApproved ?? []).reduce(
            (acc, curr) => acc.plus(new Decimal(curr.original_amount ?? 0)),
            new Decimal(0)
          );

          // Get applicable policy cap
          const policy = await findApplicablePolicy(expense.company_id, targetDate as string, supabase);
          const mealRule = policy?.structured_rules?.find(
            (r: any) => r.type === 'daily_cap' && r.categories?.includes(targetCategory)
          );

          if (mealRule && mealRule.limit) {
            const totalWithThis = priorApprovedSum.plus(new Decimal(targetAmount as number));
            if (totalWithThis.greaterThan(new Decimal(mealRule.limit)) && !body.note) {
              return NextResponse.json(
                {
                  success: false,
                  error: `Approving this claim breaches the daily allowance of $${mealRule.limit} (prior approved: $${priorApprovedSum.toFixed(2)}, this: $${targetAmount}). Provide a justification note to override.`,
                },
                { status: 400 }
              );
            }
          }
        }
      }

      updateData.review_status = requestedStatus;
    }

    // 5. Optimistic Concurrency Update
    updateData.version = expense.version + 1;

    const { data: updated, error: updateError } = await supabase
      .from('expenses')
      .update(updateData)
      .eq('id', id)
      .eq('version', expense.version)
      .select()
      .single();

    if (updateError || !updated) {
      return NextResponse.json(
        { success: false, error: 'Update failed — concurrent modification detected. Please refresh.' },
        { status: 409 }
      );
    }

    // 6. Record Audit Trail Events
    if (fieldsChangedCount > 0) {
      await supabase.from('review_events').insert({
        expense_id: id,
        company_id: expense.company_id,
        actor_id: session.id,
        actor_role: session.membership.role,
        event_type: isFinance ? 'finance_adjustment' : 'employee_correction',
        payload: {
          fields_updated: changedFieldNames,
          previous: Object.fromEntries(changedFieldNames.map((k) => [k, expense[k]])),
          new_values: Object.fromEntries(changedFieldNames.map((k) => [k, updateData[k]])),
        },
        note: body.note ?? null,
      });
    }

    if (requestedStatus && requestedStatus !== expense.review_status) {
      const eventType = isOverride
        ? 'policy_override'
        : {
            submitted: 'submitted',
            approved: 'approved',
            rejected: 'rejected',
            needs_information: 'information_requested',
          }[requestedStatus] ?? 'status_changed';

      await supabase.from('review_events').insert({
        expense_id: id,
        company_id: expense.company_id,
        actor_id: session.id,
        actor_role: session.membership.role,
        event_type: eventType,
        payload: {
          from: expense.review_status,
          to: requestedStatus,
          is_override: isOverride,
        },
        note: body.note ?? null,
      });
    }

    // 7. Automatic Evaluation on Submission or Field Correction
    // If the claim is submitted or modified while active, trigger deterministic evaluation!
    if (
      requestedStatus === 'submitted' ||
      (fieldsChangedCount > 0 && ['submitted', 'needs_information', 'needs_review'].includes(expense.review_status))
    ) {
      await evaluateAndPersistExpense({
        expenseId: id,
        actorId: session.id,
        actorRole: session.membership.role,
        supabase,
      });
    }

    // Fetch refreshed record
    const { data: finalRecord } = await supabase
      .from('expenses')
      .select('*')
      .eq('id', id)
      .single();

    return NextResponse.json({ success: true, data: finalRecord });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Internal error';
    if (msg === 'UNAUTHORIZED') return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

// GET /api/expenses/[id]
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireSession();
    const { id } = await params;
    const supabase = createServiceClient();

    const { data: expense, error } = await supabase
      .from('expenses')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !expense) {
      return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 });
    }

    const isOwner = expense.employee_id === session.id;
    const isFinance = session.membership.role === 'finance' && expense.company_id === session.membership.company_id;
    if (!isOwner && !isFinance) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    // Generate signed URL for receipt (1 hour)
    let receiptUrl: string | null = null;
    if (expense.receipt_storage_path) {
      const { data: signedData } = await supabase.storage
        .from('receipts')
        .createSignedUrl(expense.receipt_storage_path, 3600);
      receiptUrl = signedData?.signedUrl ?? null;
    }

    return NextResponse.json({ success: true, data: { ...expense, receipt_url: receiptUrl } });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Internal error';
    if (msg === 'UNAUTHORIZED') return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
