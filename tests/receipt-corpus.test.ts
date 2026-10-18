import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { normalizeExtractionAmounts } from "../src/lib/gemini/extract";
import type { ExtractionResult } from "../src/types";
test("Current normalization preserves uncertainty and critical fields when replaying all ten recorded live extraction responses", async () => {
  const manifest = JSON.parse(
    await readFile(
      new URL("./receipts/manifest.json", import.meta.url),
      "utf8",
    ),
  ) as { cases: { id: string; expected: Record<string, unknown> }[] };
  const recorded = JSON.parse(
    await readFile(
      new URL(
        "../artifacts/receipt-evaluation/initial-results.json",
        import.meta.url,
      ),
      "utf8",
    ),
  ) as { results: { id: string; evidence?: ExtractionResult }[] };
  assert.equal(recorded.results.filter((r) => r.evidence).length, 10);
  for (const row of recorded.results) {
    assert.ok(row.evidence, row.id);
    const evidence = structuredClone(row.evidence);
    normalizeExtractionAmounts(evidence);
    const actual = {
      merchant: evidence.merchant?.value ?? null,
      date: evidence.normalized_date?.value ?? null,
      amount: evidence.amount_breakdown?.final_total ?? null,
      currency: evidence.normalized_currency?.value ?? null,
      inferred: evidence.currency_is_inferred ?? false,
      arithmetic:
        evidence.arithmetic_check?.discrepancy == null
          ? "unresolved"
          : Math.abs(evidence.arithmetic_check.discrepancy) > 0.02
            ? "inconsistent"
            : "reconciled",
      printed_total: evidence.printed_total?.value ?? null,
      addition: evidence.handwritten_addition?.value ?? null,
    };
    for (const [key, value] of Object.entries(
      manifest.cases.find((c) => c.id === row.id)!.expected,
    ))
      assert.deepEqual(
        actual[key as keyof typeof actual],
        value,
        row.id + " " + key,
      );
  }
});
