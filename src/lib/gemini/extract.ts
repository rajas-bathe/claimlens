import { GoogleGenAI } from '@google/genai';
import type { ExtractionResult } from '@/types';

const GEMINI_MODEL = process.env.GEMINI_MODEL ?? 'gemini-3.8-flash';

// Schema description for structured output
const EXTRACTION_SYSTEM_PROMPT = `You are an expert receipt evidence extraction assistant for ClaimLens.
Your task is to extract faithful, structured information from receipt images or PDFs.

CRITICAL EVIDENCE PRESERVATION RULES:
1. Never invent or fabricate values. If a field is unclear or missing, set it to null.
2. Distinguish between printed values (printed by cash register/POS) and handwritten values (written by pen, such as addition lines, tip, or adjusted total).
3. Preserve the printed total separately from any handwritten additions and handwritten final totals.
4. If an addition is written by hand without an explicit printed word 'Tip' or 'Gratuity', label handwritten_addition_label as 'unlabelled addition' or 'inferred tip'—do NOT treat it as a confirmed tip.
5. Currency: Distinguish confirmed ISO currency from inferred currency. If only a '$' symbol is present, set normalized_currency to 'USD' and currency_is_inferred to true.
6. Arithmetic Check:
   - Calculate line_items sum.
   - Account for tax, service charges, and any handwritten additions.
   - Formula: Line Items Sum + Tax + Handwritten Addition = Final Total.
   - Example: 16.00 + 28.00 (items) + 3.96 (tax) + 8.00 (handwritten addition) = 55.96.
   - DO NOT flag an arithmetic discrepancy when line items sum differs from total purely because of tax and addition! Only flag if the math genuinely does not reconcile.
7. Background objects: DO NOT infer items (such as alcohol from a wine glass, bottle, or table setting beside the receipt). Only line items printed or written on the receipt slip are actual claims.
8. Missing invoice number is informational only unless required.

For itemization_completeness:
- "complete": all individual items and prices are visible
- "partial": some items visible but total is higher or items are cut off
- "none": only summary total visible without line items
- "unclear": image quality prevents determination

For suggested_category, choose from: Accommodation, Business meals, Client entertainment, Ground transport, Air travel, Office supplies, Telecoms, Training & conferences, Other.

Return ONLY valid JSON matching the schema.`;

const EXTRACTION_RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    merchant: {
      type: 'object',
      properties: {
        value: { type: ['string', 'null'] },
        confidence: { type: ['string', 'null'], enum: ['high', 'medium', 'low', null] },
        source: { type: ['string', 'null'], enum: ['printed', 'derived', 'handwritten', null] },
        supporting_text: { type: ['string', 'null'] },
        page_ref: { type: ['string', 'null'] },
      },
      required: ['value', 'confidence', 'source', 'supporting_text', 'page_ref'],
    },
    invoice_number: {
      type: 'object',
      properties: { value: { type: ['string', 'null'] }, confidence: { type: ['string', 'null'] }, source: { type: ['string', 'null'] }, supporting_text: { type: ['string', 'null'] }, page_ref: { type: ['string', 'null'] } },
      required: ['value', 'confidence', 'source', 'supporting_text', 'page_ref'],
    },
    printed_date: {
      type: 'object',
      properties: { value: { type: ['string', 'null'] }, confidence: { type: ['string', 'null'] }, source: { type: ['string', 'null'] }, supporting_text: { type: ['string', 'null'] }, page_ref: { type: ['string', 'null'] } },
      required: ['value', 'confidence', 'source', 'supporting_text', 'page_ref'],
    },
    normalized_date: {
      type: 'object',
      description: 'ISO 8601 date (YYYY-MM-DD) if unambiguous, null otherwise',
      properties: { value: { type: ['string', 'null'] }, confidence: { type: ['string', 'null'] }, source: { type: ['string', 'null'] }, supporting_text: { type: ['string', 'null'] }, page_ref: { type: ['string', 'null'] } },
      required: ['value', 'confidence', 'source', 'supporting_text', 'page_ref'],
    },
    printed_currency: {
      type: 'object',
      properties: { value: { type: ['string', 'null'] }, confidence: { type: ['string', 'null'] }, source: { type: ['string', 'null'] }, supporting_text: { type: ['string', 'null'] }, page_ref: { type: ['string', 'null'] } },
      required: ['value', 'confidence', 'source', 'supporting_text', 'page_ref'],
    },
    normalized_currency: {
      type: 'object',
      description: 'ISO 4217 currency code if clearly identifiable, null if ambiguous',
      properties: { value: { type: ['string', 'null'] }, confidence: { type: ['string', 'null'] }, source: { type: ['string', 'null'] }, supporting_text: { type: ['string', 'null'] }, page_ref: { type: ['string', 'null'] } },
      required: ['value', 'confidence', 'source', 'supporting_text', 'page_ref'],
    },
    currency_is_inferred: { type: 'boolean' },
    subtotal: {
      type: 'object',
      properties: { value: { type: ['number', 'null'] }, confidence: { type: ['string', 'null'] }, source: { type: ['string', 'null'] }, supporting_text: { type: ['string', 'null'] }, page_ref: { type: ['string', 'null'] } },
      required: ['value', 'confidence', 'source', 'supporting_text', 'page_ref'],
    },
    tax: {
      type: 'object',
      properties: { value: { type: ['number', 'null'] }, confidence: { type: ['string', 'null'] }, source: { type: ['string', 'null'] }, supporting_text: { type: ['string', 'null'] }, page_ref: { type: ['string', 'null'] } },
      required: ['value', 'confidence', 'source', 'supporting_text', 'page_ref'],
    },
    service_charge: {
      type: 'object',
      properties: { value: { type: ['number', 'null'] }, confidence: { type: ['string', 'null'] }, source: { type: ['string', 'null'] }, supporting_text: { type: ['string', 'null'] }, page_ref: { type: ['string', 'null'] } },
      required: ['value', 'confidence', 'source', 'supporting_text', 'page_ref'],
    },
    tip: {
      type: 'object',
      properties: { value: { type: ['number', 'null'] }, confidence: { type: ['string', 'null'] }, source: { type: ['string', 'null'] }, supporting_text: { type: ['string', 'null'] }, page_ref: { type: ['string', 'null'] } },
      required: ['value', 'confidence', 'source', 'supporting_text', 'page_ref'],
    },
    discount: {
      type: 'object',
      properties: { value: { type: ['number', 'null'] }, confidence: { type: ['string', 'null'] }, source: { type: ['string', 'null'] }, supporting_text: { type: ['string', 'null'] }, page_ref: { type: ['string', 'null'] } },
      required: ['value', 'confidence', 'source', 'supporting_text', 'page_ref'],
    },
    total: {
      type: 'object',
      properties: { value: { type: ['number', 'null'] }, confidence: { type: ['string', 'null'] }, source: { type: ['string', 'null'] }, supporting_text: { type: ['string', 'null'] }, page_ref: { type: ['string', 'null'] } },
      required: ['value', 'confidence', 'source', 'supporting_text', 'page_ref'],
    },
    printed_total: {
      type: 'object',
      properties: { value: { type: ['number', 'null'] }, confidence: { type: ['string', 'null'] }, source: { type: ['string', 'null'] }, supporting_text: { type: ['string', 'null'] }, page_ref: { type: ['string', 'null'] } },
      required: ['value', 'confidence', 'source', 'supporting_text', 'page_ref'],
    },
    handwritten_addition: {
      type: 'object',
      properties: { value: { type: ['number', 'null'] }, confidence: { type: ['string', 'null'] }, source: { type: ['string', 'null'] }, supporting_text: { type: ['string', 'null'] }, page_ref: { type: ['string', 'null'] } },
      required: ['value', 'confidence', 'source', 'supporting_text', 'page_ref'],
    },
    handwritten_addition_label: { type: ['string', 'null'] },
    handwritten_final_total: {
      type: 'object',
      properties: { value: { type: ['number', 'null'] }, confidence: { type: ['string', 'null'] }, source: { type: ['string', 'null'] }, supporting_text: { type: ['string', 'null'] }, page_ref: { type: ['string', 'null'] } },
      required: ['value', 'confidence', 'source', 'supporting_text', 'page_ref'],
    },
    amount_breakdown: {
      type: 'object',
      properties: {
        items_subtotal: { type: ['number', 'null'] },
        tax: { type: ['number', 'null'] },
        printed_total: { type: ['number', 'null'] },
        handwritten_addition: { type: ['number', 'null'] },
        handwritten_addition_label: { type: ['string', 'null'] },
        final_total: { type: ['number', 'null'] },
        formula_explanation: { type: 'string' },
      },
      required: ['items_subtotal', 'tax', 'printed_total', 'handwritten_addition', 'final_total', 'formula_explanation'],
    },
    line_items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          description: { type: ['string', 'null'] },
          quantity: { type: ['number', 'null'] },
          unit_price: { type: ['number', 'null'] },
          amount: { type: ['number', 'null'] },
          page_ref: { type: ['string', 'null'] },
        },
        required: ['description', 'quantity', 'unit_price', 'amount', 'page_ref'],
      },
    },
    itemization_completeness: {
      type: 'string',
      enum: ['complete', 'partial', 'none', 'unclear'],
    },
    missing_fields: { type: 'array', items: { type: 'string' } },
    ambiguous_fields: {
      type: 'array',
      items: {
        type: 'object',
        properties: { field: { type: 'string' }, possible_values: { type: 'array', items: { type: 'string' } }, reason: { type: 'string' } },
        required: ['field', 'possible_values', 'reason'],
      },
    },
    unreadable_regions: { type: 'array', items: { type: 'string' } },
    conflicting_fields: {
      type: 'array',
      items: {
        type: 'object',
        properties: { field: { type: 'string' }, values: { type: 'array', items: { type: 'object', properties: { value: { type: 'string' }, location: { type: 'string' } }, required: ['value', 'location'] } } },
        required: ['field', 'values'],
      },
    },
    arithmetic_check: {
      type: ['object', 'null'],
      properties: {
        calculated_total: { type: ['number', 'null'] },
        printed_total: { type: ['number', 'null'] },
        discrepancy: { type: ['number', 'null'] },
        note: { type: 'string' },
      },
      required: ['calculated_total', 'printed_total', 'discrepancy', 'note'],
    },
    suggested_category: { type: ['string', 'null'] },
    extraction_notes: { type: 'array', items: { type: 'string' } },
    page_references: { type: 'object' },
  },
  required: [
    'merchant', 'invoice_number', 'printed_date', 'normalized_date',
    'printed_currency', 'normalized_currency', 'subtotal', 'tax',
    'service_charge', 'tip', 'discount', 'total',
    'line_items', 'itemization_completeness', 'missing_fields',
    'ambiguous_fields', 'unreadable_regions', 'conflicting_fields',
    'arithmetic_check', 'suggested_category', 'extraction_notes', 'page_references',
  ],
};

const CANDIDATE_MODELS = [
  process.env.GEMINI_MODEL,
  'gemini-3-flash-preview',
  'gemini-3.5-flash',
  'gemini-3.8-flash',
].filter(Boolean) as string[];

const UNIQUE_MODELS = Array.from(new Set(CANDIDATE_MODELS));

/**
 * Extract structured data from a receipt file buffer.
 * Returns the structured ExtractionResult or throws on API failure.
 */
export async function extractReceipt(
  fileBuffer: Buffer,
  mimeType: string
): Promise<ExtractionResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured');
  }

  const ai = new GoogleGenAI({ apiKey });
  let response: { text?: string | null } | null = null;
  let lastError: Error | null = null;

  for (const model of UNIQUE_MODELS) {
    try {
      const res = await ai.models.generateContent({
        model,
        contents: [
          {
            role: 'user',
            parts: [
              {
                inlineData: {
                  mimeType: mimeType,
                  data: fileBuffer.toString('base64'),
                },
              },
              {
                text: 'Extract all receipt evidence following the schema precisely. Preserve printed vs handwritten figures separately.',
              },
            ],
          },
        ],
        config: {
          systemInstruction: EXTRACTION_SYSTEM_PROMPT,
          responseMimeType: 'application/json',
          responseSchema: EXTRACTION_RESPONSE_SCHEMA as Parameters<typeof ai.models.generateContent>[0]['config'] extends object ? unknown : never,
          temperature: 0,
        },
      });

      if (res && res.text) {
        response = res;
        break;
      }
    } catch (err) {
      console.warn(`Gemini extraction attempt failed with model ${model}:`, err instanceof Error ? err.message : err);
      lastError = err instanceof Error ? err : new Error(String(err));
    }
  }

  const text = response?.text;
  if (!text) {
    throw new Error(`Gemini extraction failed across all candidate models: ${lastError?.message ?? 'Empty response'}`);
  }

  // Parse and validate
  let parsed: ExtractionResult;
  try {
    parsed = JSON.parse(text) as ExtractionResult;
  } catch {
    throw new Error(`Failed to parse Gemini response as JSON: ${text.slice(0, 200)}`);
  }

  // Normalize amount breakdown and arithmetic if needed
  normalizeExtractionAmounts(parsed);

  // Basic validation
  validateExtractionResult(parsed);

  return parsed;
}

/**
 * Ensure amount breakdown and arithmetic check accurately preserve evidence
 */
export function normalizeExtractionAmounts(result: ExtractionResult): void {
  const itemsSum = (result.line_items ?? []).reduce((acc, item) => acc + (item.amount ?? 0), 0);
  const tax = result.tax?.value ?? 0;
  const subtotal = result.subtotal?.value ?? (itemsSum > 0 ? itemsSum : 0);
  const printedTotal = result.printed_total?.value ?? result.total?.value ?? (subtotal + tax);
  const addition = result.handwritten_addition?.value ?? result.tip?.value ?? 0;
  const finalTotal = result.handwritten_final_total?.value ?? (printedTotal + addition);

  if (!result.amount_breakdown) {
    const formula = addition > 0
      ? `${subtotal.toFixed(2)} (subtotal) + ${tax.toFixed(2)} (tax) = ${printedTotal.toFixed(2)} (printed total) + ${addition.toFixed(2)} (${result.handwritten_addition_label ?? 'addition'}) = ${finalTotal.toFixed(2)} (final total)`
      : `${subtotal.toFixed(2)} (subtotal) + ${tax.toFixed(2)} (tax) = ${finalTotal.toFixed(2)} (total)`;

    result.amount_breakdown = {
      items_subtotal: subtotal,
      tax: tax > 0 ? tax : null,
      printed_total: printedTotal,
      handwritten_addition: addition > 0 ? addition : null,
      handwritten_addition_label: addition > 0 ? (result.handwritten_addition_label ?? 'inferred tip') : null,
      final_total: finalTotal,
      formula_explanation: formula,
    };
  }

  // Reconcile arithmetic check
  const calculatedSum = Number((subtotal + tax + addition).toFixed(2));
  const expectedTotal = Number(finalTotal.toFixed(2));
  const diff = Number(Math.abs(calculatedSum - expectedTotal).toFixed(2));

  if (diff <= 0.02) {
    result.arithmetic_check = {
      calculated_total: calculatedSum,
      printed_total: expectedTotal,
      discrepancy: 0,
      note: addition > 0
        ? `Line items (${subtotal.toFixed(2)}) + tax (${tax.toFixed(2)}) + addition (${addition.toFixed(2)}) reconciles with final total (${finalTotal.toFixed(2)}).`
        : `Line items sum + tax equals total (${finalTotal.toFixed(2)}).`,
    };
  }
}

/**
 * Validate the extraction result structure.
 */
function validateExtractionResult(result: unknown): asserts result is ExtractionResult {
  if (!result || typeof result !== 'object') {
    throw new Error('Extraction result is not an object');
  }
  const r = result as Record<string, unknown>;

  const requiredFields = ['merchant', 'total', 'line_items', 'missing_fields', 'itemization_completeness'];
  for (const field of requiredFields) {
    if (!(field in r)) {
      throw new Error(`Extraction result missing required field: ${field}`);
    }
  }
}
