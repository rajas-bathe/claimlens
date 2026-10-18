import Decimal from "decimal.js";
import type { Expense } from "@/types";
import { currencyConfirmed } from "@/lib/evidence";

export const BASE_CURRENCY = "INR";

/** Reporting uses INR only; original receipt money is never relabelled. */
export function inrValue(expense: Expense): number | null {
  const amount = expense.original_amount;
  if (
    typeof amount !== "number" ||
    !Number.isFinite(amount) ||
    amount < 0 ||
    !currencyConfirmed(expense)
  )
    return null;
  if (expense.original_currency === BASE_CURRENCY) return amount;
  if (
    expense.converted_currency !== BASE_CURRENCY ||
    !expense.exchange_rate ||
    !Number.isFinite(expense.exchange_rate) ||
    expense.exchange_rate <= 0 ||
    !expense.exchange_rate_source?.trim() ||
    !/^\d{4}-\d{2}-\d{2}$/.test(expense.exchange_rate_date ?? "") ||
    Number.isNaN(Date.parse(expense.exchange_rate_date!)) ||
    new Date(expense.exchange_rate_date!).toISOString().slice(0, 10) !==
      expense.exchange_rate_date ||
    typeof expense.converted_amount !== "number" ||
    !Number.isFinite(expense.converted_amount)
  )
    return null;
  const expected = new Decimal(amount).times(expense.exchange_rate);
  if (expected.minus(expense.converted_amount).abs().gt(".005")) return null;
  return expected.toDecimalPlaces(2).toNumber();
}
