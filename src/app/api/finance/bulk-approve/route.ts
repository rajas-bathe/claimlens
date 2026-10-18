import { NextRequest, NextResponse } from "next/server";
import { requireFinanceSession } from "@/lib/supabase/auth";
import { createServiceClient } from "@/lib/supabase/server";
import {
  executeBulkReview,
  supabaseReviewRepository,
  ReviewError,
} from "@/lib/review/commands";
export async function POST(req: NextRequest) {
  try {
    const session = await requireFinanceSession();
    const body = await req.json();
    if (!Array.isArray(body.expense_ids))
      throw new ReviewError("INVALID_IDS", "Select the claims to approve.");
    const result = await executeBulkReview(
      supabaseReviewRepository(createServiceClient()),
      session,
      body.expense_ids,
      body.expected_versions ?? {},
      body.request_id,
    );
    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Approval could not be recorded.";
    return NextResponse.json(
      { success: false, error: message },
      {
        status:
          error instanceof ReviewError
            ? error.status
            : message === "UNAUTHORIZED"
              ? 401
              : message === "FORBIDDEN"
                ? 403
                : 500,
      },
    );
  }
}
