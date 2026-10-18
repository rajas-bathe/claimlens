import { NextRequest, NextResponse } from "next/server";
import { requireFinanceSession } from "@/lib/supabase/auth";
import { createServiceClient } from "@/lib/supabase/server";

const MAX_FILE_SIZE = 20 * 1024 * 1024;
const ALLOWED_MIME = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/tiff",
  "application/pdf",
];

// POST /api/expenses/batch-create
// Finance uploads receipts on behalf of designated employees
export async function POST(req: NextRequest) {
  try {
    const session = await requireFinanceSession();
    const body = await req.json();
    const {
      file_hash,
      file_name,
      file_size,
      mime_type,
      employee_id,
      batch_import_id,
    } = body;

    if (!file_hash || !file_name || !file_size || !mime_type || !employee_id) {
      return NextResponse.json(
        { success: false, error: "Missing required file or employee metadata" },
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

    // Verify employee belongs to company
    const { data: member, error: memberErr } = await supabase
      .from("memberships")
      .select("id, user_id")
      .eq("user_id", employee_id)
      .eq("company_id", session.company.id)
      .single();

    if (memberErr || !member) {
      return NextResponse.json(
        {
          success: false,
          error: "Designated employee is not a member of this company",
        },
        { status: 400 },
      );
    }

    const storagePath = `${session.company.id}/${employee_id}/${Date.now()}_${file_name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;

    // Create expense record
    const { data: expense, error: expenseError } = await supabase
      .from("expenses")
      .insert({
        company_id: session.company.id,
        employee_id: employee_id,
        processing_status: "uploading",
        review_status: "draft",
        receipt_file_hash: file_hash,
        receipt_storage_path: storagePath,
        receipt_mime_type: mime_type,
        receipt_file_size: file_size,
        batch_import_id: batch_import_id ?? null,
      })
      .select("id")
      .single();

    if (expenseError || !expense) {
      return NextResponse.json(
        {
          success: false,
          error: expenseError?.message ?? "Failed to initialize expense",
        },
        { status: 500 },
      );
    }

    // Signed upload URL
    const { data: signedData, error: signedError } = await supabase.storage
      .from("receipts")
      .createSignedUploadUrl(storagePath);

    if (signedError || !signedData) {
      await supabase.from("expenses").delete().eq("id", expense.id);
      return NextResponse.json(
        { success: false, error: "Failed to generate signed upload URL" },
        { status: 500 },
      );
    }

    // Audit log
    await supabase.from("review_events").insert({
      expense_id: expense.id,
      company_id: session.company.id,
      actor_id: session.id,
      actor_role: "finance",
      event_type: "batch_imported",
      payload: { employee_id, file_name, file_size },
      note: "Imported via finance batch workspace.",
    });

    return NextResponse.json({
      success: true,
      data: {
        expense_id: expense.id,
        upload_path: storagePath,
        upload_token: signedData.token,
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Internal error";
    if (msg === "UNAUTHORIZED")
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 },
      );
    if (msg === "FORBIDDEN")
      return NextResponse.json(
        { success: false, error: "Finance permission required" },
        { status: 403 },
      );
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
