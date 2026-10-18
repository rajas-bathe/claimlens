import Decimal from "decimal.js";
import { GoogleGenAI } from "@google/genai";
import type { ExtractionResult } from "@/types";

export const EXTRACTION_SYSTEM_PROMPT = `You are an expert receipt evidence extraction assistant for ClaimLens.
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

export const EXTRACTION_RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    merchant: {
      type: "object",
      properties: {
        value: { type: ["string", "null"] },
        confidence: {
          type: ["string", "null"],
          enum: ["high", "medium", "low", null],
        },
        source: {
          type: ["string", "null"],
          enum: ["printed", "derived", "handwritten", null],
        },
        supporting_text: { type: ["string", "null"] },
        page_ref: { type: ["string", "null"] },
      },
      required: [
        "value",
        "confidence",
        "source",
        "supporting_text",
        "page_ref",
      ],
    },
    invoice_number: {
      type: "object",
      properties: {
        value: { type: ["string", "null"] },
        confidence: { type: ["string", "null"] },
        source: { type: ["string", "null"] },
        supporting_text: { type: ["string", "null"] },
        page_ref: { type: ["string", "null"] },
      },
      required: [
        "value",
        "confidence",
        "source",
        "supporting_text",
        "page_ref",
      ],
    },
    printed_date: {
      type: "object",
      properties: {
        value: { type: ["string", "null"] },
        confidence: { type: ["string", "null"] },
        source: { type: ["string", "null"] },
        supporting_text: { type: ["string", "null"] },
        page_ref: { type: ["string", "null"] },
      },
      required: [
        "value",
        "confidence",
        "source",
        "supporting_text",
        "page_ref",
      ],
    },
    normalized_date: {
      type: "object",
      description: "ISO 8601 date (YYYY-MM-DD) if unambiguous, null otherwise",
      properties: {
        value: { type: ["string", "null"] },
        confidence: { type: ["string", "null"] },
        source: { type: ["string", "null"] },
        supporting_text: { type: ["string", "null"] },
        page_ref: { type: ["string", "null"] },
      },
      required: [
        "value",
        "confidence",
        "source",
        "supporting_text",
        "page_ref",
      ],
    },
    printed_currency: {
      type: "object",
      properties: {
        value: { type: ["string", "null"] },
        confidence: { type: ["string", "null"] },
        source: { type: ["string", "null"] },
        supporting_text: { type: ["string", "null"] },
        page_ref: { type: ["string", "null"] },
      },
      required: [
        "value",
        "confidence",
        "source",
        "supporting_text",
        "page_ref",
      ],
    },
    normalized_currency: {
      type: "object",
      description:
        "ISO 4217 currency code if clearly identifiable, null if ambiguous",
      properties: {
        value: { type: ["string", "null"] },
        confidence: { type: ["string", "null"] },
        source: { type: ["string", "null"] },
        supporting_text: { type: ["string", "null"] },
        page_ref: { type: ["string", "null"] },
      },
      required: [
        "value",
        "confidence",
        "source",
        "supporting_text",
        "page_ref",
      ],
    },
    currency_is_inferred: { type: "boolean" },
    subtotal: {
      type: "object",
      properties: {
        value: { type: ["number", "null"] },
        confidence: { type: ["string", "null"] },
        source: { type: ["string", "null"] },
        supporting_text: { type: ["string", "null"] },
        page_ref: { type: ["string", "null"] },
      },
      required: [
        "value",
        "confidence",
        "source",
        "supporting_text",
        "page_ref",
      ],
    },
    tax: {
      type: "object",
      properties: {
        value: { type: ["number", "null"] },
        confidence: { type: ["string", "null"] },
        source: { type: ["string", "null"] },
        supporting_text: { type: ["string", "null"] },
        page_ref: { type: ["string", "null"] },
      },
      required: [
        "value",
        "confidence",
        "source",
        "supporting_text",
        "page_ref",
      ],
    },
    service_charge: {
      type: "object",
      properties: {
        value: { type: ["number", "null"] },
        confidence: { type: ["string", "null"] },
        source: { type: ["string", "null"] },
        supporting_text: { type: ["string", "null"] },
        page_ref: { type: ["string", "null"] },
      },
      required: [
        "value",
        "confidence",
        "source",
        "supporting_text",
        "page_ref",
      ],
    },
    tip: {
      type: "object",
      properties: {
        value: { type: ["number", "null"] },
        confidence: { type: ["string", "null"] },
        source: { type: ["string", "null"] },
        supporting_text: { type: ["string", "null"] },
        page_ref: { type: ["string", "null"] },
      },
      required: [
        "value",
        "confidence",
        "source",
        "supporting_text",
        "page_ref",
      ],
    },
    discount: {
      type: "object",
      properties: {
        value: { type: ["number", "null"] },
        confidence: { type: ["string", "null"] },
        source: { type: ["string", "null"] },
        supporting_text: { type: ["string", "null"] },
        page_ref: { type: ["string", "null"] },
      },
      required: [
        "value",
        "confidence",
        "source",
        "supporting_text",
        "page_ref",
      ],
    },
    total: {
      type: "object",
      properties: {
        value: { type: ["number", "null"] },
        confidence: { type: ["string", "null"] },
        source: { type: ["string", "null"] },
        supporting_text: { type: ["string", "null"] },
        page_ref: { type: ["string", "null"] },
      },
      required: [
        "value",
        "confidence",
        "source",
        "supporting_text",
        "page_ref",
      ],
    },
    printed_total: {
      type: "object",
      properties: {
        value: { type: ["number", "null"] },
        confidence: { type: ["string", "null"] },
        source: { type: ["string", "null"] },
        supporting_text: { type: ["string", "null"] },
        page_ref: { type: ["string", "null"] },
      },
      required: [
        "value",
        "confidence",
        "source",
        "supporting_text",
        "page_ref",
      ],
    },
    handwritten_addition: {
      type: "object",
      properties: {
        value: { type: ["number", "null"] },
        confidence: { type: ["string", "null"] },
        source: { type: ["string", "null"] },
        supporting_text: { type: ["string", "null"] },
        page_ref: { type: ["string", "null"] },
      },
      required: [
        "value",
        "confidence",
        "source",
        "supporting_text",
        "page_ref",
      ],
    },
    handwritten_addition_label: { type: ["string", "null"] },
    handwritten_final_total: {
      type: "object",
      properties: {
        value: { type: ["number", "null"] },
        confidence: { type: ["string", "null"] },
        source: { type: ["string", "null"] },
        supporting_text: { type: ["string", "null"] },
        page_ref: { type: ["string", "null"] },
      },
      required: [
        "value",
        "confidence",
        "source",
        "supporting_text",
        "page_ref",
      ],
    },
    amount_breakdown: {
      type: "object",
      properties: {
        items_subtotal: { type: ["number", "null"] },
        tax: { type: ["number", "null"] },
        printed_total: { type: ["number", "null"] },
        handwritten_addition: { type: ["number", "null"] },
        handwritten_addition_label: { type: ["string", "null"] },
        final_total: { type: ["number", "null"] },
        formula_explanation: { type: "string" },
      },
      required: [
        "items_subtotal",
        "tax",
        "printed_total",
        "handwritten_addition",
        "final_total",
        "formula_explanation",
      ],
    },
    line_items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          description: { type: ["string", "null"] },
          quantity: { type: ["number", "null"] },
          unit_price: { type: ["number", "null"] },
          amount: { type: ["number", "null"] },
          page_ref: { type: ["string", "null"] },
        },
        required: [
          "description",
          "quantity",
          "unit_price",
          "amount",
          "page_ref",
        ],
      },
    },
    itemization_completeness: {
      type: "string",
      enum: ["complete", "partial", "none", "unclear"],
    },
    missing_fields: { type: "array", items: { type: "string" } },
    ambiguous_fields: {
      type: "array",
      items: {
        type: "object",
        properties: {
          field: { type: "string" },
          possible_values: { type: "array", items: { type: "string" } },
          reason: { type: "string" },
        },
        required: ["field", "possible_values", "reason"],
      },
    },
    unreadable_regions: { type: "array", items: { type: "string" } },
    conflicting_fields: {
      type: "array",
      items: {
        type: "object",
        properties: {
          field: { type: "string" },
          values: {
            type: "array",
            items: {
              type: "object",
              properties: {
                value: { type: "string" },
                location: { type: "string" },
              },
              required: ["value", "location"],
            },
          },
        },
        required: ["field", "values"],
      },
    },
    arithmetic_check: {
      type: ["object", "null"],
      properties: {
        calculated_total: { type: ["number", "null"] },
        printed_total: { type: ["number", "null"] },
        discrepancy: { type: ["number", "null"] },
        note: { type: "string" },
      },
      required: ["calculated_total", "printed_total", "discrepancy", "note"],
    },
    suggested_category: { type: ["string", "null"] },
    extraction_notes: { type: "array", items: { type: "string" } },
    page_references: { type: "object" },
  },
  required: [
    "merchant",
    "invoice_number",
    "printed_date",
    "normalized_date",
    "printed_currency",
    "normalized_currency",
    "subtotal",
    "tax",
    "service_charge",
    "tip",
    "discount",
    "total",
    "line_items",
    "itemization_completeness",
    "missing_fields",
    "ambiguous_fields",
    "unreadable_regions",
    "conflicting_fields",
    "arithmetic_check",
    "suggested_category",
    "extraction_notes",
    "page_references",
  ],
};

const CANDIDATE_MODELS = [process.env.GEMINI_MODEL || "gemini-2.5-flash"];

const UNIQUE_MODELS = Array.from(new Set(CANDIDATE_MODELS));

import { getAIOrchestrator } from "@/lib/ai/orchestrator";
import type { ExtractionOptions, OrchestratedExtractionResult } from "@/lib/ai/types";

/**
 * Extract structured data from a receipt file buffer with primary Gemini and Groq fallback.
 * Returns the structured ExtractionResult or throws on failure.
 */
export async function extractReceipt(
  fileBuffer: Buffer,
  mimeType: string,
  options?: ExtractionOptions,
): Promise<ExtractionResult> {
  if (!process.env.GEMINI_API_KEY && !process.env.GROQ_API_KEY) {
    throw new Error("GEMINI_API_KEY is not configured");
  }
  const result = await getAIOrchestrator().extractReceipt(fileBuffer, mimeType, options);
  return result.extraction;
}

/**
 * Extract receipt evidence returning orchestration metadata (provider, attempts, logs).
 */
export async function extractReceiptWithFallback(
  fileBuffer: Buffer,
  mimeType: string,
  options?: ExtractionOptions,
): Promise<OrchestratedExtractionResult> {
  return getAIOrchestrator().extractReceipt(fileBuffer, mimeType, options);
}

/**
 * Ensure amount breakdown and arithmetic check accurately preserve evidence
 */
export function normalizeExtractionAmounts(result: ExtractionResult): void {
  const number = (value: unknown): number | null =>
    typeof value === "number" && Number.isFinite(value) ? value : null;
  const lines = result.line_items ?? [];
  const completeItems =
    lines.length > 0 &&
    result.itemization_completeness === "complete" &&
    lines.every((item) => number(item.amount) !== null);
  const sum = completeItems
    ? lines.reduce((total, item) => total.plus(item.amount!), new Decimal(0))
    : null;
  const subtotal = number(result.subtotal?.value);
  const tax = number(result.tax?.value);
  const service = number(result.service_charge?.value);
  const discount = number(result.discount?.value);
  const addition =
    number(result.handwritten_addition?.value) ?? number(result.tip?.value);
  const printed = number(result.printed_total?.value);
  // 'total' is the model's transcription of the final total, never an invented fallback.
  const final =
    number(result.handwritten_final_total?.value) ??
    (result.total?.source === "derived" ? null : number(result.total?.value));
  const base = sum ?? (subtotal !== null ? new Decimal(subtotal) : null);
  const arithmeticKnown = base !== null && tax !== null && final !== null;
  const computed = arithmeticKnown
    ? base
        .plus(tax)
        .plus(service ?? 0)
        .plus(addition ?? 0)
        .minus(discount ?? 0)
        .toDecimalPlaces(2)
    : null;
  const subtotalMismatch =
    sum !== null && subtotal !== null
      ? sum.minus(subtotal).abs()
      : new Decimal(0);
  const discrepancy =
    computed !== null && final !== null
      ? Decimal.max(computed.minus(final).abs(), subtotalMismatch)
          .toDecimalPlaces(2)
          .toNumber()
      : null;
  const explanation = arithmeticKnown
    ? (sum !== null ? "Items" : "Printed subtotal") +
      " " +
      base!.toFixed(2) +
      " + tax " +
      tax!.toFixed(2) +
      (service !== null ? " + service " + service.toFixed(2) : "") +
      (addition !== null ? " + addition " + addition.toFixed(2) : "") +
      (discount !== null ? " − discount " + discount.toFixed(2) : "") +
      " = " +
      computed!.toFixed(2) +
      "; receipt total " +
      final!.toFixed(2) +
      (subtotalMismatch.gt(".02")
        ? ". Printed subtotal does not agree with the item amounts."
        : ".")
    : "Not enough independent evidence to verify arithmetic. A readable item breakdown or subtotal, tax and final total are required.";
  result.amount_breakdown = {
    items_subtotal: sum?.toNumber() ?? subtotal,
    tax,
    printed_total: printed,
    handwritten_addition: addition,
    handwritten_addition_label: result.handwritten_addition_label ?? null,
    final_total: final,
    formula_explanation: explanation,
  };
  result.arithmetic_check = {
    calculated_total: computed?.toNumber() ?? null,
    printed_total: final,
    discrepancy,
    note: explanation,
  };
  // A symbol is evidence of a symbol, not proof of an ISO currency.
  if (
    ["$", "¥"].includes(result.printed_currency?.value ?? "") &&
    result.normalized_currency?.source !== "printed"
  )
    result.currency_is_inferred = true;
}

/**
 * Validate the extraction result structure.
 */
export function validateExtractionResult(
  result: unknown,
): asserts result is ExtractionResult {
  if (!result || typeof result !== "object") {
    throw new Error("Extraction result is not an object");
  }
  const r = result as Record<string, unknown>;

  const requiredFields = [
    "merchant",
    "total",
    "line_items",
    "missing_fields",
    "itemization_completeness",
  ];
  if (
    !Array.isArray(r.line_items) ||
    !Array.isArray(r.missing_fields) ||
    !["complete", "partial", "none", "unclear"].includes(
      String(r.itemization_completeness),
    )
  )
    throw new Error("Receipt extraction has an invalid evidence structure");
  for (const field of [
    "merchant",
    "total",
    "subtotal",
    "tax",
    "normalized_currency",
  ]) {
    const value = r[field];
    if (
      value !== undefined &&
      (!value || typeof value !== "object" || !("value" in value))
    )
      throw new Error("Receipt extraction has an invalid " + field + " field");
  }
  for (const field of requiredFields) {
    if (!(field in r)) {
      throw new Error(`Extraction result missing required field: ${field}`);
    }
  }
}
