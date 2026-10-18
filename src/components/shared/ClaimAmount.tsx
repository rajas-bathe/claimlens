import type { Expense } from "@/types";
import { inrValue, BASE_CURRENCY } from "@/lib/currency";
import { formatCurrency } from "@/lib/utils";

export function ClaimAmount({ expense }: { expense: Expense }) {
  const amount =
    inrValue(expense) ??
    (typeof expense.converted_amount === "number" &&
    Number.isFinite(expense.converted_amount)
      ? expense.converted_amount
      : typeof expense.original_amount === "number" &&
          Number.isFinite(expense.original_amount)
        ? expense.original_amount
        : null);

  return (
    <span className="claim-money">
      <strong>
        {amount === null ? "—" : formatCurrency(amount, BASE_CURRENCY)}
      </strong>
    </span>
  );
}
