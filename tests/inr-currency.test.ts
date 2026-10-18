import test from "node:test";
import assert from "node:assert/strict";
import { inrValue } from "../src/lib/currency";
import { correctedExpense } from "../src/lib/review/commands";
import { formatCurrency } from "../src/lib/utils";
import type { Expense, UserSession } from "../src/types";
const foreign = {
  original_amount: 10,
  original_currency: "USD",
  confirmed_fields: {},
  converted_currency: "INR",
  converted_amount: 850,
  exchange_rate: 85,
  exchange_rate_date: "2026-10-18",
  exchange_rate_source: "Synthetic bank evidence",
} as Expense;
test("INR values preserve zero and foreign amounts require complete agreeing conversion evidence", () => {
  assert.equal(
    inrValue({ ...foreign, original_currency: "INR", original_amount: 0 }),
    0,
  );
  assert.equal(inrValue(foreign), 850);
  for (const update of [
    { exchange_rate_source: "" },
    { exchange_rate: 0 },
    { converted_amount: 10 },
    { exchange_rate_date: "2026-02-30" },
    { exchange_rate_date: "2026-99-99" },
    { converted_currency: "EUR" },
    { original_currency: null },
    { original_amount: null },
  ])
    assert.equal(inrValue({ ...foreign, ...update }), null);
});
test("Inferred source currency cannot become an INR total until explicitly confirmed", () => {
  assert.equal(
    inrValue({
      ...foreign,
      extraction_raw: {
        currency_is_inferred: true,
      } as Expense["extraction_raw"],
    }),
    null,
  );
});
test("Source money changes clear saved conversion and cannot silently reuse its rate", () => {
  const updates = { original_currency: "EUR" };
  const result = correctedExpense(foreign, updates, {
    id: "actor",
    membership: { role: "employee" },
  } as UserSession);
  assert.equal(result.exchange_rate, null);
  assert.equal(result.converted_amount, null);
  assert.equal(inrValue(result), null);
});
test("New conversion evidence only accepts INR as its target", () => {
  assert.throws(
    () =>
      correctedExpense(
        foreign,
        {
          converted_currency: "EUR",
          exchange_rate: 2,
          exchange_rate_date: "2026-10-18",
          exchange_rate_source: "Synthetic reference",
        },
        { id: "actor", membership: { role: "employee" } } as UserSession,
      ),
    /INR/,
  );
});
test("Formatting uses Indian grouping and does not assign a currency to unknown evidence", () => {
  assert.match(formatCurrency(123456.5, "INR"), /1,23,456\.50/);
  assert.match(formatCurrency(10, null), /Currency unconfirmed/);
  assert.doesNotMatch(formatCurrency(10, null), /₹|\$/);
});
