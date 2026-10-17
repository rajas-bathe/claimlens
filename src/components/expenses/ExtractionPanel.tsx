import type { Expense, ExtractionResult } from '@/types';
import { AlertTriangle, Info } from 'lucide-react';

export function ExtractionPanel({ expense }: { expense: Expense }) {
  const ext = expense.extraction_raw;
  return (
    <div className="bg-white border border-gray-200 rounded-lg">
      <div className="px-5 py-4 border-b border-gray-100">
        <h2 className="font-medium text-gray-900">Receipt extraction</h2>
        <p className="text-xs text-gray-400 mt-0.5">Original data as read from receipt. Not modified by corrections.</p>
      </div>
      <div className="p-5 space-y-4">
        {!ext ? (
          <p className="text-sm text-gray-400">{expense.processing_status === 'extracting' ? 'Extraction in progress...' : 'No extraction data available.'}</p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-x-4 gap-y-3">
              {([
                ['Merchant', ext.merchant?.value],
                ['Date', ext.normalized_date?.value ?? ext.printed_date?.value],
                ['Currency', ext.normalized_currency?.value ?? ext.printed_currency?.value],
                ['Total', ext.total?.value != null ? String(ext.total.value) : null],
                ['Subtotal', ext.subtotal?.value != null ? String(ext.subtotal.value) : null],
                ['Tax', ext.tax?.value != null ? String(ext.tax.value) : null],
                ['Invoice #', ext.invoice_number?.value],
              ] as [string, string | null | undefined][]).map(([label, value]) => (
                <div key={label}>
                  <p className="text-xs text-gray-400">{label}</p>
                  <p className="text-sm font-medium text-gray-900 mt-0.5">{value ?? <span className="text-gray-300 font-normal">—</span>}</p>
                </div>
              ))}
            </div>
            {ext.arithmetic_check && ext.arithmetic_check.discrepancy !== null && ext.arithmetic_check.discrepancy !== 0 && (
              <div className="flex gap-2 p-3 bg-amber-50 border border-amber-200 rounded-md">
                <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                <div className="text-sm">
                  <p className="font-medium text-amber-800">Arithmetic discrepancy</p>
                  <p className="text-amber-700 mt-0.5">{ext.arithmetic_check.note}</p>
                  <p className="text-amber-700 mt-0.5 tabular-nums">Printed: {ext.arithmetic_check.printed_total} · Calculated: {ext.arithmetic_check.calculated_total} · Diff: {ext.arithmetic_check.discrepancy}</p>
                </div>
              </div>
            )}
            {ext.missing_fields && ext.missing_fields.length > 0 && (
              <div className="flex gap-2 p-3 bg-gray-50 border border-gray-200 rounded-md">
                <Info className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5" />
                <div className="text-sm text-gray-600"><p className="font-medium">Missing fields</p><p className="mt-0.5">{ext.missing_fields.join(', ')}</p></div>
              </div>
            )}
            {ext.line_items && ext.line_items.length > 0 && (
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Line items</p>
                <div className="space-y-1">
                  {ext.line_items.map((item, i) => (
                    <div key={i} className="flex justify-between text-sm">
                      <span className="text-gray-700 truncate">{item.description ?? '—'}</span>
                      <span className="tabular-nums text-gray-900 ml-3 flex-shrink-0">{item.amount != null ? item.amount.toFixed(2) : '—'}</span>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-gray-400 mt-2">Itemization: {ext.itemization_completeness}</p>
              </div>
            )}
          </>
        )}
        {expense.extraction_error && (
          <div className="flex gap-2 p-3 bg-red-50 border border-red-200 rounded-md">
            <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
            <div className="text-sm"><p className="font-medium text-red-700">Extraction error</p><p className="text-red-600 mt-0.5">{expense.extraction_error}</p></div>
          </div>
        )}
      </div>
    </div>
  );
}
