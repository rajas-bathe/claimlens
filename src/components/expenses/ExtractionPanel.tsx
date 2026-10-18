"use client";

import type { Expense } from "@/types";
import { AlertTriangle, CheckCircle2, FileText, PenTool } from "lucide-react";
import { cn, formatCurrency } from "@/lib/utils";

export function ExtractionPanel({ expense }: { expense: Expense }) {
  const ext = expense.extraction_raw;
  const evidenceCurrency = ext?.normalized_currency?.value;
  const money = (amount: number | null | undefined) =>
    amount == null
      ? "—"
      : evidenceCurrency
        ? formatCurrency(Number(amount), evidenceCurrency)
        : Number(amount).toFixed(2) + " (currency unresolved)";

  return (
    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden shadow-sm">
      <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
        <div>
          <h2 className="font-semibold text-gray-900 text-sm">
            Receipt details
          </h2>
          <p className="text-xs text-gray-400 mt-0.5">
            Original extracted evidence. Corrections do not overwrite the
            receipt.
          </p>
        </div>
        {ext?.itemization_completeness && (
          <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-600 border border-gray-200 rounded font-medium capitalize">
            {ext.itemization_completeness} Itemization
          </span>
        )}
      </div>

      <div className="p-5 space-y-5">
        {!ext ? (
          <div className="py-6 text-center text-sm text-gray-400">
            {expense.processing_status === "extracting"
              ? "Extracting receipt evidence with AI..."
              : "No extraction data available."}
          </div>
        ) : (
          <>
            {/* Primary Fields Grid */}
            <div className="grid grid-cols-2 gap-x-4 gap-y-3 pb-3 border-b border-gray-100 text-xs">
              <div>
                <p className="text-gray-400">Merchant</p>
                <p className="font-semibold text-gray-900 mt-0.5 text-sm">
                  {ext.merchant?.value ?? "—"}
                </p>
                {ext.merchant?.supporting_text && (
                  <p className="text-[11px] text-gray-400 italic font-mono mt-0.5 truncate">
                    &quot;{ext.merchant.supporting_text}&quot;
                  </p>
                )}
              </div>

              <div>
                <p className="text-gray-400">Date</p>
                <p className="font-semibold text-gray-900 mt-0.5 text-sm">
                  {ext.normalized_date?.value ?? ext.printed_date?.value ?? "—"}
                </p>
                {ext.printed_date?.value &&
                  ext.normalized_date?.value &&
                  ext.printed_date.value !== ext.normalized_date.value && (
                    <p className="text-[11px] text-gray-400 mt-0.5">
                      Printed: {ext.printed_date.value}
                    </p>
                  )}
              </div>

              <div>
                <p className="text-gray-400">Currency</p>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className="font-semibold text-gray-900 text-sm">
                    {ext.normalized_currency?.value ??
                      ext.printed_currency?.value ??
                      "Not available"}
                  </span>
                  {ext.currency_is_inferred && (
                    <span className="text-[10px] bg-amber-50 text-amber-700 border border-amber-200 rounded px-1.5 py-0.5 font-medium">
                      Inferred from &apos;{ext.printed_currency?.value ?? "$"}
                      &apos;
                    </span>
                  )}
                </div>
              </div>

              <div>
                <p className="text-gray-400">Invoice / Slip #</p>
                <p className="font-medium text-gray-700 mt-0.5">
                  {ext.invoice_number?.value ?? (
                    <span className="text-gray-400 italic">
                      None visible (informational)
                    </span>
                  )}
                </p>
              </div>
            </div>

            {/* Evidence Amount Breakdown */}
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-3.5 space-y-2">
              <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide">
                Amount breakdown
              </p>

              <div className="space-y-1.5 text-xs">
                {ext.subtotal?.value !== null &&
                  ext.subtotal?.value !== undefined && (
                    <div className="flex justify-between text-gray-600">
                      <span>Items Subtotal</span>
                      <span className="tabular-nums font-mono">
                        {money(ext.subtotal.value)}
                      </span>
                    </div>
                  )}

                {ext.tax?.value !== null && ext.tax?.value !== undefined && (
                  <div className="flex justify-between text-gray-600">
                    <span>Tax</span>
                    <span className="tabular-nums font-mono">
                      {money(ext.tax.value)}
                    </span>
                  </div>
                )}

                {ext.printed_total?.value !== null &&
                  ext.printed_total?.value !== undefined && (
                    <div className="flex justify-between text-gray-900 font-medium pt-1 border-t border-gray-200">
                      <span className="flex items-center gap-1">
                        <FileText className="w-3.5 h-3.5 text-gray-500" />{" "}
                        Printed total
                      </span>
                      <span className="tabular-nums font-mono">
                        {money(ext.printed_total.value)}
                      </span>
                    </div>
                  )}

                {ext.handwritten_addition?.value || ext.tip?.value ? (
                  <div className="flex justify-between text-amber-800 bg-amber-50/80 px-2 py-1 rounded border border-amber-200 font-medium">
                    <span className="flex items-center gap-1">
                      <PenTool className="w-3.5 h-3.5 text-amber-600" />
                      Handwritten Addition (
                      {ext.handwritten_addition_label ?? "unlabelled addition"})
                    </span>
                    <span className="tabular-nums font-mono">
                      +
                      {money(ext.handwritten_addition?.value ?? ext.tip?.value)}
                    </span>
                  </div>
                ) : null}

                <div className="flex justify-between text-gray-900 font-bold text-sm pt-1.5 border-t border-gray-300">
                  <span>Extracted total</span>
                  <span className="tabular-nums font-mono text-teal-700">
                    {money(
                      ext.amount_breakdown
                        ? ext.amount_breakdown.final_total
                        : (ext.handwritten_final_total?.value ??
                            ext.total?.value),
                    )}
                  </span>
                </div>
              </div>

              {ext.amount_breakdown?.formula_explanation && (
                <p className="text-[11px] text-gray-500 pt-1 border-t border-gray-200 font-mono">
                  {ext.amount_breakdown.formula_explanation}
                </p>
              )}
            </div>

            {/* Arithmetic check result */}
            {ext.arithmetic_check && (
              <div
                className={cn(
                  "flex items-start gap-2 p-3 rounded-md border text-xs",
                  ext.arithmetic_check.discrepancy == null ||
                    Math.abs(ext.arithmetic_check.discrepancy) > 0.02
                    ? "bg-rose-50 border-rose-200 text-rose-800"
                    : "bg-emerald-50 border-emerald-200 text-emerald-800",
                )}
              >
                {ext.arithmetic_check.discrepancy == null ||
                Math.abs(ext.arithmetic_check.discrepancy) > 0.02 ? (
                  <AlertTriangle className="w-4 h-4 text-rose-600 flex-shrink-0 mt-0.5" />
                ) : (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0 mt-0.5" />
                )}
                <div>
                  <p className="font-semibold">
                    {ext.arithmetic_check.discrepancy == null ||
                    Math.abs(ext.arithmetic_check.discrepancy) > 0.02
                      ? ext.arithmetic_check.discrepancy == null
                        ? "Arithmetic could not be verified"
                        : "Arithmetic inconsistency"
                      : "Arithmetic Reconciled"}
                  </p>
                  <p className="mt-0.5 leading-relaxed">
                    {ext.arithmetic_check.note}
                  </p>
                </div>
              </div>
            )}

            {/* Line items table */}
            {ext.line_items && ext.line_items.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide mb-2">
                  Line Items ({ext.line_items.length})
                </p>
                <div className="divide-y divide-gray-100 border border-gray-200 rounded-md overflow-hidden text-xs">
                  {ext.line_items.map((item, idx) => (
                    <div
                      key={idx}
                      className="flex justify-between items-center px-3 py-2 bg-white hover:bg-gray-50"
                    >
                      <div className="flex items-center gap-2 truncate">
                        {item.quantity && (
                          <span className="text-gray-400 font-mono">
                            {item.quantity}x
                          </span>
                        )}
                        <span className="font-medium text-gray-800 truncate">
                          {item.description ?? "Item"}
                        </span>
                      </div>
                      <span className="tabular-nums font-mono text-gray-900 ml-4 flex-shrink-0 font-medium">
                        {money(item.amount)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
