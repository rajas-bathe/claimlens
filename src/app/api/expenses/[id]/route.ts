import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/supabase/auth";
import { createServiceClient } from "@/lib/supabase/server";
import {
  executeReview,
  supabaseReviewRepository,
  ReviewError,
  type ReviewAction,
} from "@/lib/review/commands";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireSession();
    const { id } = await params;
    const body = await req.json();
    const statuses: Record<string, ReviewAction> = {
      draft: "save",
      submitted: "submit",
      approved: "approve",
      rejected: "reject",
      needs_information: "request",
    };
    if (body.review_status && !statuses[body.review_status])
      throw new ReviewError(
        "INVALID_TRANSITION",
        "Choose a supported review action.",
      );
    const action = body.review_status ? statuses[body.review_status] : "save";
    const fields = [
      "evidence_verified",
      "merchant",
      "expense_date",
      "original_amount",
      "original_currency",
      "category",
      "city",
      "trip_context",
      "business_purpose",
      "client_name",
      "attendee_count",
      "attendee_names",
      "invoice_number",
      "currency_confirmed",
      "converted_currency",
      "exchange_rate",
      "exchange_rate_date",
      "exchange_rate_source",
    ];
    const updates = Object.fromEntries(
      fields
        .filter((field) => field in body)
        .map((field) => [field, body[field]]),
    );
    const result = await executeReview(
      supabaseReviewRepository(createServiceClient()),
      session,
      id,
      {
        action,
        updates,
        note: body.note,
        overrideReason: body.is_override
          ? body.override_reason || body.note
          : undefined,
        expectedVersion: body.expected_version,
        requestId: body.request_id,
      },
    );
    return NextResponse.json({
      success: true,
      data: result.expense,
      already_applied: result.already_applied,
    });
  } catch (error) {
    const status =
      error instanceof ReviewError
        ? error.status
        : error instanceof Error && error.message === "UNAUTHORIZED"
          ? 401
          : 500;
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "The expense could not be saved.",
        code: error instanceof ReviewError ? error.code : undefined,
      },
      { status },
    );
  }
}

// GET /api/expenses/[id]
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireSession();
    const { id } = await params;
    const supabase = createServiceClient();

    const { data: expense, error } = await supabase
      .from("expenses")
      .select("*")
      .eq("id", id)
      .single();

    if (error || !expense) {
      return NextResponse.json(
        { success: false, error: "Not found" },
        { status: 404 },
      );
    }

    const isOwner =
      expense.employee_id === session.id &&
      expense.company_id === session.membership.company_id;
    const isFinance =
      session.membership.role === "finance" &&
      expense.company_id === session.membership.company_id;
    if (!isOwner && !isFinance) {
      return NextResponse.json(
        { success: false, error: "Forbidden" },
        { status: 403 },
      );
    }

    // Generate signed URL for receipt (1 hour)
    let receiptUrl: string | null = null;
    if (expense.receipt_storage_path) {
      const { data: signedData } = await supabase.storage
        .from("receipts")
        .createSignedUrl(expense.receipt_storage_path, 3600);
      receiptUrl = signedData?.signedUrl ?? null;
    }

    return NextResponse.json({
      success: true,
      data: { ...expense, receipt_url: receiptUrl },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Internal error";
    if (msg === "UNAUTHORIZED")
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 },
      );
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
