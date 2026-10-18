import type { Expense } from "@/types";
import { inrValue, BASE_CURRENCY } from "@/lib/currency";
import { formatCurrency } from "@/lib/utils";

export function ClaimAmount({ expense }: { expense: Expense }) {
  const amount = inrValue(expense);
  return (
    <span className="claim-money">
      <strong>
        {amount === null
          ? "INR value pending"
          : formatCurrency(amount, BASE_CURRENCY)}
      </strong>
      {expense.original_currency !== BASE_CURRENCY &&
        expense.original_amount != null && (
          <small>
            Original receipt:{" "}
            {formatCurrency(expense.original_amount, expense.original_currency)}
          </small>
        )}
      {amount === null && (
        <small>Confirm currency and record a sourced INR conversion.</small>
      )}
    </span>
  );
}
