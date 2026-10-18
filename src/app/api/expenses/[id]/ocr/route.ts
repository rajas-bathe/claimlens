import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/supabase/auth";
import { createServiceClient } from "@/lib/supabase/server";
import { runLocalOcr } from "@/lib/receipts/ocr";
import { checkCapture } from "@/lib/receipts/images";
export const runtime = "nodejs";
export const maxDuration = 60;
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireSession(),
      { id } = await params,
      supabase = createServiceClient();
    const { data: expense, error } = await supabase
      .from("expenses")
      .select("*")
      .eq("id", id)
      .eq("company_id", session.company.id)
      .single();
    if (error || !expense)
      return NextResponse.json({ error: "Claim not found." }, { status: 404 });
    if (
      session.membership.role !== "finance" &&
      expense.employee_id !== session.id
    )
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    if (["approved", "rejected"].includes(expense.review_status))
      return NextResponse.json(
        {
          error:
            "Final claims retain their recorded evidence. OCR can only be added before a decision.",
        },
        { status: 409 },
      );
    if (!Object.prototype.hasOwnProperty.call(expense, "capture_quality"))
      return NextResponse.json(
        {
          error:
            "Receipt review setup is incomplete. Your administrator must apply migration 20261018000005_evidence_and_workflow.sql. The claim has not been changed.",
        },
        { status: 503 },
      );
    if (expense.receipt_mime_type === "application/pdf")
      return NextResponse.json(
        {
          error:
            "Local OCR currently supports images only. Inspect the PDF in the original viewer; it is not marked OCR-verified.",
        },
        { status: 422 },
      );
    if (expense.processing_status === "extracting")
      return NextResponse.json(
        { error: "Wait for extraction to finish before running OCR." },
        { status: 409 },
      );
    const { data: file, error: readError } = await supabase.storage
      .from("receipts")
      .download(expense.receipt_storage_path);
    if (readError || !file)
      throw new Error("The original receipt could not be loaded.");
    const buffer = Buffer.from(await file.arrayBuffer());
    const quality = await checkCapture(
      buffer,
      expense.receipt_mime_type ?? "image/jpeg",
    );
    const ocr = await runLocalOcr(buffer);
    quality.issues.push(...(ocr.quality_issues ?? []));
    // Compare-and-swap: never overwrite a newer correction, extraction or decision.
    const { data: saved, error: saveError } = await supabase.rpc(
      "claimlens_store_ocr",
      {
        p_expense_id: id,
        p_company_id: session.company.id,
        p_actor_id: session.id,
        p_expected_version: expense.version,
        p_ocr: ocr,
        p_quality: quality,
      },
    );
    if (saveError || !saved)
      return NextResponse.json(
        {
          error:
            "The claim changed or evidence checks are not installed. Refresh; apply the evidence-review migration if needed.",
        },
        { status: 409 },
      );
    return NextResponse.json(
      { success: true, ocr, quality, reevaluation_required: true },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "OCR check failed.";
    return NextResponse.json(
      { error: message },
      { status: message === "UNAUTHORIZED" ? 401 : 503 },
    );
  }
}
