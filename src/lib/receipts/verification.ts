import type { Expense } from "@/types";
export function evidenceSnapshot(expense: Expense) {
  return {
    extraction_at: expense.extraction_at ?? null,
    quality_checked_at: expense.capture_quality?.checked_at ?? null,
    ocr_checked_at: expense.ocr_evidence?.checked_at ?? null,
    merchant: expense.merchant,
    expense_date: expense.expense_date,
    original_amount: expense.original_amount,
    original_currency: expense.original_currency,
  };
}
export function evidenceReviewValid(expense: Expense): boolean {
  const review = expense.confirmed_fields?.critical_evidence;
  if (
    !review ||
    !["employee", "finance", "manual"].includes(review.source) ||
    !review.updated_by ||
    !review.updated_at ||
    typeof review.value !== "object" ||
    !review.value
  )
    return false;
  const value = review.value as Record<string, unknown>;
  return Object.entries(evidenceSnapshot(expense)).every(
    ([key, v]) => value[key] === v,
  );
}
export function uncertainEvidence(expense: Expense): string[] {
  const ext = expense.extraction_raw;
  const reasons: string[] = [];
  if (expense.capture_quality?.issues.length)
    reasons.push(
      "Capture-quality warnings need a comparison with the original receipt.",
    );
  for (const [name, field] of [
    ["merchant", ext?.merchant],
    ["date", ext?.normalized_date],
    ["amount", ext?.total],
    ["currency", ext?.normalized_currency],
  ] as const) {
    if (
      field?.confidence === "low" ||
      (field?.source === "derived" &&
        (name === "amount" ||
          name === "merchant" ||
          (name === "date" && !ext?.printed_date?.value)))
    )
      reasons.push(
        "The extracted " +
          name +
          " is low-confidence or lacks direct supporting evidence.",
      );
  }
  if (
    ext?.ambiguous_fields?.some((f) =>
      /total|amount|date|currency|merchant/i.test(f.field),
    ) ||
    ext?.conflicting_fields?.some((f) =>
      /total|amount|date|currency|merchant/i.test(f.field),
    )
  )
    reasons.push(
      "The reader reported ambiguous or conflicting critical fields.",
    );
  if (ext?.unreadable_regions?.length)
    reasons.push("The reader reported unreadable regions.");
  if (expense.ocr_evidence) {
    if (expense.ocr_evidence.confidence < 60)
      reasons.push("Independent printed-text OCR has low confidence.");
    if (typeof expense.original_amount === "number") {
      const amount = expense.original_amount.toFixed(2),
        tokens = expense.ocr_evidence.text.replaceAll(",", "");
      if (!tokens.includes(amount))
        reasons.push(
          "Independent OCR did not find the current amount. This is a discrepancy signal, not proof of an error.",
        );
    }
  }
  return reasons;
}
