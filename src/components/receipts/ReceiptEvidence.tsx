"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ScanText, Loader2, ShieldCheck, AlertTriangle } from "lucide-react";
import type { Expense, CaptureQuality, OcrWord } from "@/types";
import { ReceiptViewer } from "@/components/shared/ReceiptViewer";
import {
  uncertainEvidence,
  evidenceReviewValid,
} from "@/lib/receipts/verification";

export function CaptureGuidance({
  quality,
}: {
  quality: CaptureQuality | null | undefined;
}) {
  if (!quality) return null;
  return (
    <div className="capture-guidance" role="status">
      <strong>
        <AlertTriangle size={15} /> Capture check ·{" "}
        {quality.status === "unavailable"
          ? "manual inspection needed"
          : quality.issues.length
            ? "take a closer look"
            : "no heuristic warning"}
      </strong>
      {quality.issues.map((issue, i) => (
        <p key={i}>
          <b>{issue.kind.replaceAll("_", " ")}:</b> {issue.message}{" "}
          <small>({issue.source.replaceAll("_", " ")})</small>
        </p>
      ))}
      {quality.issues.length > 0 && (
        <p>
          Retake on a flat surface with all edges visible, camera parallel to
          the paper, even light and sharp focus. Do not reconstruct missing
          digits.
        </p>
      )}
      <small>{quality.note}</small>
    </div>
  );
}
export function ReceiptEvidence({
  expense,
  receiptUrl,
}: {
  expense: Expense;
  receiptUrl: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState(""),
    [message, setMessage] = useState("");
  const [field, setField] = useState("none");
  const [merchant, setMerchant] = useState(expense.merchant ?? ""),
    [date, setDate] = useState(expense.expense_date ?? ""),
    [amount, setAmount] = useState(
      expense.original_amount == null ? "" : String(expense.original_amount),
    ),
    [currency, setCurrency] = useState(expense.original_currency ?? "");
  const [verified, setVerified] = useState(false);
  const closed = ["approved", "rejected"].includes(expense.review_status);
  const reasons = uncertainEvidence(expense),
    reviewed = evidenceReviewValid(expense),
    ocr = expense.ocr_evidence;
  const ext = expense.extraction_raw;
  const sources: Record<string, { quote: string; page: string | null }> = {
    merchant: {
      quote: ext?.merchant?.supporting_text ?? expense.merchant ?? "",
      page: ext?.merchant?.page_ref ?? null,
    },
    date: {
      quote:
        ext?.printed_date?.supporting_text ?? ext?.printed_date?.value ?? "",
      page: ext?.printed_date?.page_ref ?? null,
    },
    amount: {
      quote:
        ext?.total?.supporting_text ??
        (expense.original_amount == null
          ? ""
          : expense.original_amount.toFixed(2)),
      page: ext?.total?.page_ref ?? null,
    },
    currency: {
      quote:
        ext?.printed_currency?.supporting_text ??
        ext?.printed_currency?.value ??
        "",
      page: ext?.printed_currency?.page_ref ?? null,
    },
  };
  const normalize = (value: string) =>
    value.toLowerCase().replace(/[^a-z0-9]/g, "");
  const tokens = (sources[field]?.quote ?? "")
    .split(/\s+/)
    .map(normalize)
    .filter(Boolean);
  const highlights: OcrWord[] = (ocr?.words ?? [])
    .filter((word) => tokens.includes(normalize(word.text)))
    .slice(0, 30);
  async function call(url: string, body?: object) {
    const res = await fetch(url, {
      method: body ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Evidence update failed.");
    return data;
  }
  function runOcr() {
    setError("");
    setMessage("");
    startTransition(async () => {
      try {
        await call("/api/expenses/" + expense.id + "/ocr");
        await call("/api/expenses/" + expense.id + "/evaluate");
        setMessage(
          "OCR evidence saved and policy checks refreshed. Compare discrepancies with the original.",
        );
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "OCR failed.");
        router.refresh();
      }
    });
  }
  function confirm(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    startTransition(async () => {
      try {
        await call("/api/expenses/" + expense.id, {
          merchant,
          expense_date: date,
          original_amount: Number(amount),
          original_currency: currency,
          currency_confirmed: true,
          evidence_verified: true,
          expected_version: expense.version,
          request_id: crypto.randomUUID(),
          review_status:
            expense.review_status === "draft" ? "draft" : "submitted",
          note: "Critical values explicitly compared with original receipt evidence.",
        });
        setMessage(
          "Evidence confirmation saved. Current policy checks will use these values.",
        );
        setVerified(false);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Confirmation failed.");
      }
    });
  }
  return (
    <div className="receipt-evidence-stack">
      <CaptureGuidance quality={expense.capture_quality} />
      <div className="ocr-toolbar">
        <div>
          <strong>
            <ScanText size={15} /> Independent text cross-check
          </strong>
          <p>
            Local English OCR. No receipt is sent to another provider. Best for
            printed text; handwriting and PDFs need manual review.
          </p>
        </div>
        <button
          type="button"
          className="button button-secondary"
          disabled={
            pending ||
            closed ||
            expense.receipt_mime_type === "application/pdf" ||
            !receiptUrl
          }
          onClick={runOcr}
        >
          {pending ? (
            <Loader2 size={15} className="animate-spin" />
          ) : (
            <ScanText size={15} />
          )}{" "}
          {ocr ? "Run OCR again" : "Run OCR"}
        </button>
      </div>
      {message && (
        <p className="workflow-hint" role="status">
          {message}
        </p>
      )}
      {error && (
        <p className="workflow-hint" role="alert">
          {error}
        </p>
      )}
      <div
        className="evidence-field-tabs"
        role="group"
        aria-label="Locate extracted evidence"
      >
        {["none", "merchant", "date", "amount", "currency"].map((name) => (
          <button
            type="button"
            key={name}
            aria-pressed={field === name}
            onClick={() => setField(name)}
          >
            {name === "none" ? "Original view" : name}
          </button>
        ))}
      </div>
      {field !== "none" && (
        <p className="evidence-source-quote">
          Source: {sources[field]?.quote || "No source text available."}{" "}
          {sources[field]?.page && " · " + sources[field].page}
          <br />
          {ocr
            ? highlights.length
              ? "Highlighted boxes are matching OCR words. Multiple matches may exist; verify against the original."
              : "No exact OCR text match was found. Inspect the original; the field is not visually verified."
            : "Run OCR to locate matching printed words. Source quotations are model-reported, not verified locations."}
        </p>
      )}
      <ReceiptViewer
        receiptUrl={receiptUrl}
        mimeType={expense.receipt_mime_type}
        fileName={expense.receipt_storage_path?.split("/").pop()}
        highlights={highlights}
      />
      {ocr && (
        <details className="ocr-text">
          <summary>
            Inspect independent OCR text · {Math.round(ocr.confidence)}{" "}
            confidence score (not accuracy %)
          </summary>
          <pre>{ocr.text || "No printed text recognized."}</pre>
          <p>{ocr.note}</p>
        </details>
      )}
      {reasons.length > 0 && (
        <section className="evidence-confirmation">
          <h2>
            <ShieldCheck size={18} />{" "}
            {reviewed
              ? "Current evidence confirmed"
              : "Verify critical evidence"}
          </h2>
          <ul>
            {reasons.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
          {!closed && (
            <form onSubmit={confirm}>
              <label>
                Merchant
                <input
                  required
                  value={merchant}
                  onChange={(e) => setMerchant(e.target.value)}
                />
              </label>
              <label>
                Expense date
                <input
                  type="date"
                  required
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
              </label>
              <label>
                Original amount
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  required
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
              </label>
              <label>
                ISO currency
                <input
                  pattern="[A-Z]{3}"
                  maxLength={3}
                  required
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value.toUpperCase())}
                />
              </label>
              <label className="confirmation-checkbox">
                <input
                  type="checkbox"
                  required
                  checked={verified}
                  onChange={(e) => setVerified(e.target.checked)}
                />{" "}
                I compared these values with the original receipt. This confirms
                my review, not receipt authenticity.
              </label>
              <button className="button" disabled={pending || !verified}>
                {pending ? "Saving…" : "Confirm reviewed evidence"}
              </button>
            </form>
          )}
        </section>
      )}
    </div>
  );
}
