"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, Globe2 } from "lucide-react";
import type { Expense } from "@/types";
import { currencyConfirmed } from "@/lib/evidence";
export function CurrencyResolution({ expense }: { expense: Expense }) {
  const [amount, setAmount] = useState(
    expense.original_amount == null ? "" : String(expense.original_amount),
  );
  const [currency, setCurrency] = useState(expense.original_currency ?? "");
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();
  if (currencyConfirmed(expense) && expense.original_amount !== null)
    return null;
  function save(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    start(async () => {
      try {
        const response = await fetch("/api/expenses/" + expense.id, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            original_amount: amount === "" ? null : Number(amount),
            original_currency: currency,
            currency_confirmed: confirmed,
            expected_version: expense.version,
          }),
        });
        const data = await response.json();
        if (!response.ok)
          throw new Error(data.error ?? "Could not save the confirmation.");
        setSuccess(
          "Currency confirmation saved. The current policy checks have been refreshed.",
        );
        router.refresh();
      } catch (error) {
        setError(error instanceof Error ? error.message : "Could not save.");
      }
    });
  }
  return (
    <section className="evidence-resolution">
      <div className="flex gap-3 items-start">
        <Globe2 size={20} />
        <div>
          <h2>Let’s confirm the money details.</h2>
          <p>
            The receipt does not establish a verified amount or currency. Check
            the original receipt or payment record before confirming.
          </p>
        </div>
      </div>
      <form onSubmit={save}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <label>
            Amount
            <input
              aria-label="Confirm expense amount"
              type="number"
              min="0"
              step=".01"
              required
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </label>
          <label>
            ISO currency code
            <input
              aria-label="Confirm ISO currency"
              required
              pattern="[A-Z]{3}"
              maxLength={3}
              placeholder="e.g. USD"
              value={currency}
              onChange={(e) => {
                setCurrency(e.target.value.toUpperCase());
                setConfirmed(false);
              }}
            />
          </label>
        </div>
        <label className="confirmation-checkbox">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(e) => setConfirmed(e.target.checked)}
            required
          />
          I checked the original receipt or payment record and confirm this
          currency.
        </label>
        <button
          type="submit"
          className="button button-small"
          disabled={pending || !confirmed}
        >
          {pending ? (
            <Loader2 size={15} className="animate-spin" />
          ) : (
            <Check size={15} />
          )}
          Save confirmation
        </button>
        {error && (
          <p role="alert" className="text-red-700 mt-3">
            {error}
          </p>
        )}
        {success && (
          <p role="status" className="mt-3">
            {success}
          </p>
        )}
      </form>
    </section>
  );
}
