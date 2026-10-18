import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/supabase/auth";
import { createServiceClient } from "@/lib/supabase/server";

const MAX_FILE_SIZE = 20 * 1024 * 1024;
const ALLOWED_MIME = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/tiff",
  "application/pdf",
];

// POST /api/expenses
// Creates an expense record and returns a signed upload URL
export async function POST(req: NextRequest) {
  try {
    const session = await requireSession();
    if (session.membership.role !== "employee") {
      return NextResponse.json(
        { success: false, error: "Only employees can submit expenses" },
        { status: 403 },
      );
    }

    const body = await req.json();
    const { file_hash, file_name, file_size, mime_type } = body;

    // Validate
    if (!file_hash || !file_name || !file_size || !mime_type) {
      return NextResponse.json(
        { success: false, error: "Missing required file metadata" },
        { status: 400 },
      );
    }
    if (file_size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { success: false, error: "File exceeds 20 MB limit" },
        { status: 400 },
      );
    }
    if (!ALLOWED_MIME.includes(mime_type)) {
      return NextResponse.json(
        { success: false, error: "File type not allowed" },
        { status: 400 },
      );
    }

    const supabase = createServiceClient();

    // Check for exact duplicate by hash
    const { data: existing } = await supabase
      .from("expenses")
      .select("id, review_status")
      .eq("receipt_file_hash", file_hash)
      .eq("employee_id", session.id)
      .single();

    // Create expense record
    const storagePath = `${session.membership.company_id}/${session.id}/${Date.now()}_${file_name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;

    const { data: expense, error: expenseError } = await supabase
      .from("expenses")
      .insert({
        company_id: session.membership.company_id,
        employee_id: session.id,
        processing_status: "uploading",
        review_status: "draft",
        receipt_file_hash: file_hash,
        receipt_storage_path: storagePath,
        receipt_mime_type: mime_type,
        receipt_file_size: file_size,
      })
      .select("id")
      .single();

    if (expenseError || !expense) {
      return NextResponse.json(
        {
          success: false,
          error: expenseError?.message ?? "Failed to create expense",
        },
        { status: 500 },
      );
    }

    // Create signed upload URL (valid for 5 minutes)
    const { data: signedData, error: signedError } = await supabase.storage
      .from("receipts")
      .createSignedUploadUrl(storagePath);

    if (signedError || !signedData) {
      // Clean up expense record
      await supabase.from("expenses").delete().eq("id", expense.id);
      return NextResponse.json(
        { success: false, error: "Failed to create upload URL" },
        { status: 500 },
      );
    }

    // Log event
    await supabase.from("review_events").insert({
      expense_id: expense.id,
      company_id: session.membership.company_id,
      actor_id: session.id,
      actor_role: "employee",
      event_type: "status_changed",
      payload: { processing_status: "uploading" },
    });

    return NextResponse.json({
      success: true,
      data: {
        expense_id: expense.id,
        upload_path: storagePath,
        upload_token: signedData.token,
        possible_duplicate: existing
          ? { id: existing.id, status: existing.review_status }
          : null,
      },
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
