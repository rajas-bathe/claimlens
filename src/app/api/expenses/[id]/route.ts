import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/supabase/auth';
import { createServiceClient } from '@/lib/supabase/server';

const ALLOWED_REVIEW_TRANSITIONS: Record<string, string[]> = {
  draft: ['submitted', 'draft'],
  submitted: ['needs_information', 'needs_review', 'ready_for_approval', 'approved', 'rejected'],
  needs_information: ['submitted'],
  needs_review: ['ready_for_approval', 'rejected', 'needs_information'],
  ready_for_approval: ['approved', 'rejected'],
  approved: [],
  rejected: ['submitted'],
};

// PATCH /api/expenses/[id]
// Updates expense fields and/or status
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireSession();
    const { id } = await params;
    const body = await req.json();

    const supabase = createServiceClient();

    // Load existing expense
    const { data: expense, error: fetchError } = await supabase
      .from('expenses')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchError || !expense) {
      return NextResponse.json({ success: false, error: 'Expense not found' }, { status: 404 });
    }

    // Authorization: employee can only edit their own; finance can edit their company's
    const isOwner = expense.employee_id === session.id;
    const isFinance = session.membership.role === 'finance' && expense.company_id === session.membership.company_id;
    if (!isOwner && !isFinance) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    // Build update
    const updateData: Record<string, unknown> = {};
    const confirmedFields = { ...(expense.confirmed_fields ?? {}) };
    const fieldSource = isFinance ? 'finance' : 'employee';
    const now = new Date().toISOString();

    const EDITABLE_FIELDS = [
      'merchant', 'expense_date', 'original_amount', 'original_currency',
      'category', 'city', 'trip_context', 'business_purpose',
      'client_name', 'attendee_count', 'attendee_names',
    ];

    for (const field of EDITABLE_FIELDS) {
      if (field in body && body[field] !== undefined) {
        updateData[field] = body[field];
        confirmedFields[field] = {
          value: body[field],
          source: fieldSource,
          updated_at: now,
          updated_by: session.id,
        };
      }
    }
    updateData.confirmed_fields = confirmedFields;

    // Status transition
    if (body.review_status && body.review_status !== expense.review_status) {
      const allowed = ALLOWED_REVIEW_TRANSITIONS[expense.review_status] ?? [];
      if (!allowed.includes(body.review_status)) {
        return NextResponse.json(
          { success: false, error: `Cannot transition from ${expense.review_status} to ${body.review_status}` },
          { status: 400 }
        );
      }
      updateData.review_status = body.review_status;
    }

    // Optimistic concurrency
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
        { success: false, error: 'Update failed — possible concurrent modification. Please retry.' },
        { status: 409 }
      );
    }

    // Log correction event
    if (Object.keys(updateData).length > 2) { // more than just version + confirmed_fields
      await supabase.from('review_events').insert({
        expense_id: id,
        company_id: expense.company_id,
        actor_id: session.id,
        actor_role: session.membership.role,
        event_type: fieldSource === 'finance' ? 'employee_correction' : 'employee_correction',
        payload: { fields_updated: Object.keys(updateData).filter(k => !['confirmed_fields', 'version'].includes(k)) },
        note: body.note ?? null,
      });
    }

    // Log status change
    if (updateData.review_status) {
      const eventType = {
        submitted: 'submitted',
        approved: 'approved',
        rejected: 'rejected',
        needs_information: 'information_requested',
      }[body.review_status as string] ?? 'status_changed';
      await supabase.from('review_events').insert({
        expense_id: id,
        company_id: expense.company_id,
        actor_id: session.id,
        actor_role: session.membership.role,
        event_type: eventType,
        payload: { from: expense.review_status, to: body.review_status },
        note: body.note ?? null,
      });
    }

    return NextResponse.json({ success: true, data: updated });
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

    // Generate signed URL for receipt
    let receiptUrl: string | null = null;
    if (expense.receipt_storage_path) {
      const { data: signedData } = await supabase.storage
        .from('receipts')
        .createSignedUrl(expense.receipt_storage_path, 3600); // 1 hour
      receiptUrl = signedData?.signedUrl ?? null;
    }

    return NextResponse.json({ success: true, data: { ...expense, receipt_url: receiptUrl } });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Internal error';
    if (msg === 'UNAUTHORIZED') return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
