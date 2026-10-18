import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/supabase/auth";
import { createServiceClient } from "@/lib/supabase/server";
import { extractReceipt } from "@/lib/gemini/extract";

// POST /api/expenses/[id]/extract
// Downloads the receipt from storage, calls Gemini, saves extraction result
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireSession();
    const { id } = await params;
    const supabase = createServiceClient();

    // Load expense
    const { data: expense, error: fetchError } = await supabase
      .from("expenses")
      .select("*")
      .eq("id", id)
      .single();

    if (fetchError || !expense) {
      return NextResponse.json(
        { success: false, error: "Expense not found" },
        { status: 404 },
      );
    }

    // Authorization
    const isOwner = expense.employee_id === session.id && expense.company_id === session.membership.company_id;
    const isFinance =
      session.membership.role === "finance" &&
      expense.company_id === session.membership.company_id;
    if (!isOwner && !isFinance) {
      return NextResponse.json(
        { success: false, error: "Forbidden" },
        { status: 403 },
      );
    }

    if (["approved", "rejected"].includes(expense.review_status))
      return NextResponse.json(
        {
          success: false,
          error:
            "Historical receipt evidence cannot be re-extracted after a final decision.",
        },
        { status: 409 },
      );
    if (!expense.receipt_storage_path) {
      return NextResponse.json(
        { success: false, error: "No receipt file found" },
        { status: 400 },
      );
    }

    // Mark as extracting
    const { data: started, error: startError } = await supabase
      .from("expenses")
      .update({ processing_status: "extracting", version: expense.version + 1 })
      .eq("id", id)
      .eq("version", expense.version)
      .select("version")
      .single();
    if (startError || !started)
      return NextResponse.json(
        {
          success: false,
          error: "This receipt changed. Refresh before retrying extraction.",
        },
        { status: 409 },
      );

    // Download file from storage
    const { data: fileData, error: downloadError } = await supabase.storage
      .from("receipts")
      .download(expense.receipt_storage_path);

    if (downloadError || !fileData) {
      await markExtractionFailed(
        supabase,
        id,
        started.version,
        "Failed to download receipt from storage",
      );
      return NextResponse.json(
        { success: false, error: "Failed to download receipt" },
        { status: 500 },
      );
    }

    const arrayBuffer = await fileData.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const mimeType = expense.receipt_mime_type ?? "image/jpeg";

    // Call AI extraction orchestrator (Primary Gemini -> Backup Groq)
    const { extractReceiptWithFallback } = await import("@/lib/gemini/extract");
    const { AIOrchestrationError } = await import("@/lib/ai/errors");

    let orchestratedResult;
    try {
      orchestratedResult = await extractReceiptWithFallback(buffer, mimeType);
    } catch (extractError) {
      const errorMsg =
        extractError instanceof Error
          ? extractError.message
          : "Extraction failed";
      const attemptLogs =
        extractError instanceof AIOrchestrationError
          ? extractError.attemptLogs
          : [];
      const attempts = attemptLogs.length || 1;

      await markExtractionFailed(
        supabase,
        id,
        started.version,
        errorMsg,
        session.id,
        session.membership.role,
        expense.company_id,
        attemptLogs,
      );

      return NextResponse.json(
        {
          success: false,
          error: errorMsg,
          data: {
            attempts,
            attempt_logs: attemptLogs,
            retryable: true,
            preserved: true,
          },
        },
        { status: 422 },
      );
    }

    const {
      extraction,
      provider,
      model,
      attempts,
      fallbackUsed,
      attemptLogs,
      totalDurationMs,
    } = orchestratedResult;

    // Compute authoritative SHA-256 hash from server buffer
    const crypto = await import("node:crypto");
    const serverHash = crypto.createHash("sha256").update(buffer).digest("hex");

    // Determine which fields to denormalize
    const updateData: Record<string, unknown> = {
      processing_status: "extracted",
      receipt_file_hash: serverHash,
      extraction_raw: extraction,
      extraction_at: new Date().toISOString(),
      extraction_model: `${provider}:${model}`,
      extraction_error: null,
      version: expense.version + 2, // +2 because we already bumped once above
    };

    // Only set denormalized fields if not already confirmed by user
    const confirmed =
      (expense.confirmed_fields as Record<string, unknown>) ?? {};
    if (!confirmed.merchant) updateData.merchant = extraction.merchant?.value;
    if (!confirmed.expense_date)
      updateData.expense_date =
        extraction.normalized_date?.value ?? extraction.printed_date?.value;
    if (!confirmed.original_currency)
      updateData.original_currency =
        extraction.normalized_currency?.value ??
        extraction.printed_currency?.value;
    if (!confirmed.original_amount) {
      updateData.original_amount =
        extraction.amount_breakdown?.final_total ?? null;
    }

    const { error: saveError } = await supabase
      .from("expenses")
      .update(updateData)
      .eq("id", id)
      .eq("version", started.version)
      .select("id")
      .single();

    if (saveError)
      return NextResponse.json(
        {
          success: false,
          error:
            "The expense changed during extraction. Your newer details were preserved. Refresh and retry.",
        },
        { status: 409 },
      );

    // Log extraction complete review event
    await supabase.from("review_events").insert({
      expense_id: id,
      company_id: expense.company_id,
      actor_id: session.id,
      actor_role: session.membership.role,
      event_type: "extraction_complete",
      payload: {
        provider,
        model,
        attempts,
        fallback_used: fallbackUsed,
        attempt_logs: attemptLogs,
        duration_ms: totalDurationMs,
        missing_fields: extraction.missing_fields,
        itemization_completeness: extraction.itemization_completeness,
        has_arithmetic_discrepancy:
          extraction.arithmetic_check?.discrepancy !== null &&
          extraction.arithmetic_check?.discrepancy !== 0,
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        extraction,
        provider,
        model,
        attempts,
        fallback_used: fallbackUsed,
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Internal error";
    if (msg === "UNAUTHORIZED") {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 },
      );
    }
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

async function markExtractionFailed(
  supabase: ReturnType<typeof createServiceClient>,
  expenseId: string,
  currentVersion: number,
  errorMsg: string,
  actorId?: string,
  actorRole?: string,
  companyId?: string,
  attemptLogs?: unknown[],
) {
  await supabase
    .from("expenses")
    .update({
      processing_status: "extraction_failed",
      extraction_error: errorMsg,
      version: currentVersion + 1,
    })
    .eq("id", expenseId)
    .eq("version", currentVersion);

  if (companyId && actorId) {
    await supabase.from("review_events").insert({
      expense_id: expenseId,
      company_id: companyId,
      actor_id: actorId,
      actor_role: (actorRole as any) ?? "employee",
      event_type: "extraction_failed",
      payload: {
        error: errorMsg,
        attempt_logs: attemptLogs ?? [],
      },
      note: errorMsg,
    });
  }
}
