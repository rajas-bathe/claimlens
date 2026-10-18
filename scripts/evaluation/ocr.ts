/** Local-only diagnostic: synthetic receipts, no provider API calls or database writes. */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { runLocalOcr } from "../../src/lib/receipts/ocr";
import { checkCapture } from "../../src/lib/receipts/images";

async function main() {
  const manifest = JSON.parse(
    await readFile("tests/receipts/manifest.json", "utf8"),
  );
  const results = [];
  for (const fixture of manifest.cases) {
    const image = await readFile("tests/receipts/" + fixture.file);
    const quality = await checkCapture(image, "image/png");
    const started = Date.now();
    try {
      const ocr = await runLocalOcr(image);
      const expected = fixture.expected;
      const comparisons = Object.fromEntries(
        Object.entries({
          merchant: expected.merchant,
          date: expected.date,
          currency: expected.currency,
          amount:
            expected.amount === null
              ? null
              : Number(expected.amount).toFixed(2),
        }).map(([field, value]) => [
          field,
          value === null
            ? "not visible in ground truth; manual review"
            : ocr.text.toLowerCase().includes(String(value).toLowerCase()),
        ]),
      );
      results.push({
        id: fixture.id,
        provenance: fixture.provenance,
        duration_ms: Date.now() - started,
        quality,
        ocr,
        comparisons,
      });
      process.stdout.write(
        fixture.id + ": " + JSON.stringify(comparisons) + "\n",
      );
    } catch (error) {
      results.push({
        id: fixture.id,
        quality,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  await mkdir("artifacts/receipt-evaluation", { recursive: true });
  await writeFile(
    "artifacts/receipt-evaluation/ocr-results.json",
    JSON.stringify(
      {
        run_at: new Date().toISOString(),
        limitations:
          "Small synthetic diagnostic, not real-world accuracy. Handwritten case is a font simulation, not authentic handwriting. String matches do not prove field correctness; absent text must not be reconstructed. Confidence is not accuracy. No images were sent to external providers.",
        results,
      },
      null,
      2,
    ),
  );
}
main().catch((error) => {
  process.stderr.write(String(error));
  process.exitCode = 1;
});
