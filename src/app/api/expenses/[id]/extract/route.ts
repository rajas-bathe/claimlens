import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/supabase/auth';
import { createServiceClient } from '@/lib/supabase/server';
import { extractReceipt } from '@/lib/gemini/extract';

// POST /api/expenses/[id]/extract
// Downloads the receipt from storage, calls Gemini, saves extraction result
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireSession();
    const { id } = await params;
    const supabase = createServiceClient();

    // Load expense
    const { data: expense, error: fetchError } = await supabase
      .from('expenses')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchError || !expense) {
      return NextResponse.json({ success: false, error: 'Expense not found' }, { status: 404 });
    }

    // Authorization
    const isOwner = expense.employee_id === session.id;
    const isFinance =
      session.membership.role === 'finance' &&
      expense.company_id === session.membership.company_id;
    if (!isOwner && !isFinance) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    if (!expense.receipt_storage_path) {
      return NextResponse.json(
        { success: false, error: 'No receipt file found' },
        { status: 400 }
      );
    }

    // Mark as extracting
    await supabase
      .from('expenses')
      .update({ processing_status: 'extracting', version: expense.version + 1 })
      .eq('id', id)
      .eq('version', expense.version);

    // Download file from storage
    const { data: fileData, error: downloadError } = await supabase.storage
      .from('receipts')
      .download(expense.receipt_storage_path);

    if (downloadError || !fileData) {
      await markExtractionFailed(supabase, id, expense.version + 1, 'Failed to download receipt from storage');
      return NextResponse.json(
        { success: false, error: 'Failed to download receipt' },
        { status: 500 }
      );
    }

    const arrayBuffer = await fileData.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const mimeType = expense.receipt_mime_type ?? 'image/jpeg';

    // Call Gemini
    let extraction;
    try {
      extraction = await extractReceipt(buffer, mimeType);
    } catch (geminiError) {
      const errorMsg =
        geminiError instanceof Error ? geminiError.message : 'Extraction failed';
      await markExtractionFailed(supabase, id, expense.version + 1, errorMsg);
      return NextResponse.json(
        { success: false, error: errorMsg },
        { status: 422 }
      );
    }

    // Compute authoritative SHA-256 hash from server buffer
    const crypto = await import('node:crypto');
    const serverHash = crypto.createHash('sha256').update(buffer).digest('hex');

    // Determine which fields to denormalize
    const updateData: Record<string, unknown> = {
      processing_status: 'extracted',
      receipt_file_hash: serverHash,
      extraction_raw: extraction,
      extraction_at: new Date().toISOString(),
      extraction_model: process.env.GEMINI_MODEL ?? 'gemini-3.8-flash',
      extraction_error: null,
      version: expense.version + 2, // +2 because we already bumped once above
    };

    // Only set denormalized fields if not already confirmed by user
    const confirmed = (expense.confirmed_fields as Record<string, unknown>) ?? {};
    if (!confirmed.merchant) updateData.merchant = extraction.merchant?.value;
    if (!confirmed.expense_date) updateData.expense_date = extraction.normalized_date?.value ?? extraction.printed_date?.value;
    if (!confirmed.original_currency) updateData.original_currency = extraction.normalized_currency?.value ?? extraction.printed_currency?.value;
    if (!confirmed.original_amount) {
      updateData.original_amount = extraction.amount_breakdown?.final_total ?? extraction.total?.value ?? null;
    }

    await supabase
      .from('expenses')
      .update(updateData)
      .eq('id', id);

    // Log event
    await supabase.from('review_events').insert({
      expense_id: id,
      company_id: expense.company_id,
      actor_id: session.id,
      actor_role: session.membership.role,
      event_type: 'extraction_complete',
      payload: {
        model: updateData.extraction_model,
        missing_fields: extraction.missing_fields,
        itemization_completeness: extraction.itemization_completeness,
        has_arithmetic_discrepancy:
          extraction.arithmetic_check?.discrepancy !== null &&
          extraction.arithmetic_check?.discrepancy !== 0,
      },
    });

    return NextResponse.json({ success: true, data: { extraction } });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Internal error';
    if (msg === 'UNAUTHORIZED') {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

async function markExtractionFailed(
  supabase: ReturnType<typeof createServiceClient>,
  expenseId: string,
  currentVersion: number,
  errorMsg: string
) {
  await supabase
    .from('expenses')
    .update({
      processing_status: 'extraction_failed',
      extraction_error: errorMsg,
      version: currentVersion + 1,
    })
    .eq('id', expenseId);
}
