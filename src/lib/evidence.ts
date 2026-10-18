import type { Expense } from "@/types";
export function currencyConfirmed(expense: Expense): boolean {
  const code = expense.original_currency?.trim().toUpperCase();
  if (!code || !/^[A-Z]{3}$/.test(code)) return false;
  const field = expense.confirmed_fields?.original_currency;
  const confirmed =
    field &&
    ["employee", "finance", "manual"].includes(field.source) &&
    String(field.value).toUpperCase() === code &&
    Boolean(field.updated_by) &&
    Boolean(field.updated_at);
  const ext = expense.extraction_raw;
  const inferred =
    ext?.currency_is_inferred ||
    ext?.normalized_currency?.source === "derived" ||
    (["$", "€", "£", "¥"].includes(ext?.printed_currency?.value ?? "") &&
      !ext?.normalized_currency?.value);
  return !inferred || Boolean(confirmed);
}
