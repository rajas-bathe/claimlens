"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Expense, Evaluation } from "@/types";
import { ArrowRightLeft, Loader2 } from "lucide-react";
export function ConversionResolution({
  expense,
  evaluation,
}: {
  expense: Expense;
  evaluation: Evaluation | null;
}) {
  const targets = [
    ...new Set(
      (evaluation?.rule_results ?? [])
        .filter((r) => r.outcome === "unknown" && r.details.comparison_currency)
        .map((r) => String(r.details.comparison_currency)),
    ),
  ];
  const [target, setTarget] = useState(targets[0] ?? "");
  const [rate, setRate] = useState("");
  const [date, setDate] = useState(expense.expense_date ?? "");
  const [source, setSource] = useState("");
  const [checked, setChecked] = useState(false);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();
  if (!targets.length) return null;
  function save(e: React.FormEvent) {
    e.preventDefault();
    start(async () => {
      setError("");
      try {
        const response = await fetch("/api/expenses/" + expense.id, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            converted_currency: target,
            exchange_rate: Number(rate),
            exchange_rate_date: date,
            exchange_rate_source: source,
            expected_version: expense.version,
          }),
        });
        const data = await response.json();
        if (!response.ok)
          throw new Error(data.error ?? "Could not record this conversion.");
        router.refresh();
      } catch (error) {
        setError(error instanceof Error ? error.message : "Could not save.");
      }
    });
  }
  return (
    <details className="evidence-resolution">
      <summary className="flex gap-2 items-center">
        <ArrowRightLeft size={17} />
        Record conversion evidence for this receipt
      </summary>
      <p>
        Keep the original amount. Add the rate actually used by the bank, card
        statement or approved company source. Other unresolved receipts must be
        corrected separately.
      </p>
      <form onSubmit={save}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <label>
            Compare in
            <select
              aria-label="Conversion target currency"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
            >
              {targets.map((code) => (
                <option key={code}>{code}</option>
              ))}
            </select>
          </label>
          <label>
            Rate: 1 {expense.original_currency} in {target}
            <input
              type="number"
              min=".00000001"
              step="any"
              value={rate}
              onChange={(e) => setRate(e.target.value)}
              required
            />
          </label>
          <label>
            Rate date
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              required
            />
          </label>
          <label>
            Source or statement reference
            <input
              value={source}
              onChange={(e) => setSource(e.target.value)}
              placeholder="e.g. Card statement, 12 October"
              required
            />
          </label>
        </div>
        <label className="confirmation-checkbox">
          <input
            type="checkbox"
            checked={checked}
            onChange={(e) => setChecked(e.target.checked)}
            required
          />
          I verified this rate against the stated source.
        </label>
        <button
          type="submit"
          className="button button-small"
          disabled={pending || !checked}
        >
          {pending && <Loader2 size={14} className="animate-spin" />}Save
          conversion evidence
        </button>
        {error && (
          <p role="alert" className="text-red-700 mt-3">
            {error}
          </p>
        )}
      </form>
    </details>
  );
}
