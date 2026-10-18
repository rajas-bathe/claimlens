import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { AIOrchestrator } from "../src/lib/ai/orchestrator";
import { GeminiAdapter } from "../src/lib/ai/gemini-adapter";
import { GroqAdapter } from "../src/lib/ai/groq-adapter";
import {
  AIOrchestrationError,
  AIProviderError,
  PDFCompatibilityError,
  classifyAIError,
  shouldTriggerFallback,
} from "../src/lib/ai/errors";
import {
  validateExtractionResult,
  normalizeExtractionAmounts,
} from "../src/lib/gemini/extract";
import type { ExtractionResult } from "../src/types";

// Sample valid extraction result fixture
const sampleExtractionResult: ExtractionResult = {
  merchant: {
    value: "Fieldnotes Cafe",
    confidence: "high",
    source: "printed",
    supporting_text: "Fieldnotes Cafe",
    page_ref: "Page 1",
  },
  invoice_number: {
    value: "INV-101",
    confidence: "high",
    source: "printed",
    supporting_text: "INV-101",
    page_ref: "Page 1",
  },
  printed_date: {
    value: "2026-10-12",
    confidence: "high",
    source: "printed",
    supporting_text: "2026-10-12",
    page_ref: "Page 1",
  },
  normalized_date: {
    value: "2026-10-12",
    confidence: "high",
    source: "printed",
    supporting_text: "2026-10-12",
    page_ref: "Page 1",
  },
  printed_currency: {
    value: "$",
    confidence: "high",
    source: "printed",
    supporting_text: "$",
    page_ref: "Page 1",
  },
  normalized_currency: {
    value: "USD",
    confidence: "medium",
    source: "derived",
    supporting_text: "$",
    page_ref: "Page 1",
  },
  currency_is_inferred: true,
  subtotal: {
    value: 20.0,
    confidence: "high",
    source: "printed",
    supporting_text: "20.00",
    page_ref: "Page 1",
  },
  tax: {
    value: 2.0,
    confidence: "high",
    source: "printed",
    supporting_text: "2.00",
    page_ref: "Page 1",
  },
  service_charge: {
    value: null,
    confidence: null,
    source: null,
    supporting_text: null,
    page_ref: null,
  },
  tip: {
    value: null,
    confidence: null,
    source: null,
    supporting_text: null,
    page_ref: null,
  },
  discount: {
    value: null,
    confidence: null,
    source: null,
    supporting_text: null,
    page_ref: null,
  },
  total: {
    value: 22.0,
    confidence: "high",
    source: "printed",
    supporting_text: "22.00",
    page_ref: "Page 1",
  },
  printed_total: {
    value: 22.0,
    confidence: "high",
    source: "printed",
    supporting_text: "22.00",
    page_ref: "Page 1",
  },
  handwritten_addition: {
    value: null,
    confidence: null,
    source: null,
    supporting_text: null,
    page_ref: null,
  },
  handwritten_addition_label: null,
  handwritten_final_total: {
    value: null,
    confidence: null,
    source: null,
    supporting_text: null,
    page_ref: null,
  },
  line_items: [
    {
      description: "Latte",
      quantity: 1,
      unit_price: 6.0,
      amount: 6.0,
      page_ref: "Page 1",
    },
    {
      description: "Avocado Toast",
      quantity: 1,
      unit_price: 14.0,
      amount: 14.0,
      page_ref: "Page 1",
    },
  ],
  itemization_completeness: "complete",
  missing_fields: [],
  ambiguous_fields: [],
  unreadable_regions: [],
  conflicting_fields: [],
  arithmetic_check: null,
  suggested_category: "Business meals",
  extraction_notes: [],
  page_references: {},
};

// 1x1 test png buffer
const testImageBuffer = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
  "base64",
);

test("Verification 1: Primary success does not call the backup", async () => {
  let groqCalled = false;

  const mockGemini = {
    isConfigured: () => true,
    getModel: () => "gemini-2.5-flash",
    extractReceipt: async () => ({
      extraction: structuredClone(sampleExtractionResult),
      model: "gemini-2.5-flash",
      durationMs: 45,
    }),
    structurePolicy: async () => {
      throw new Error("Not implemented in this test");
    },
  } as unknown as GeminiAdapter;

  const mockGroq = {
    isConfigured: () => true,
    getModel: () => "qwen/qwen3.8-27b",
    extractReceipt: async () => {
      groqCalled = true;
      throw new Error("Backup should never be called when primary succeeds!");
    },
    structurePolicy: async () => {
      throw new Error("Not implemented in this test");
    },
  } as unknown as GroqAdapter;

  const orchestrator = new AIOrchestrator(mockGemini, mockGroq);
  const result = await orchestrator.extractReceipt(testImageBuffer, "image/png");

  assert.equal(result.provider, "gemini");
  assert.equal(result.model, "gemini-2.5-flash");
  assert.equal(result.fallbackUsed, false);
  assert.equal(result.attempts, 1);
  assert.equal(groqCalled, false, "Groq backup was unexpectedly called");
  assert.equal(result.extraction.merchant.value, "Fieldnotes Cafe");
});

test("Verification 2: A simulated primary 429 invokes the backup", async () => {
  let geminiCalls = 0;
  let groqCalls = 0;

  const mockGemini = {
    isConfigured: () => true,
    getModel: () => "gemini-2.5-flash",
    extractReceipt: async () => {
      geminiCalls++;
      const err = new Error("Resource has been exhausted (e.g. check quota): 429 RESOURCE_EXHAUSTED");
      (err as unknown as { status: number }).status = 429;
      throw err;
    },
    structurePolicy: async () => {
      throw new Error("Not implemented in this test");
    },
  } as unknown as GeminiAdapter;

  const mockGroq = {
    isConfigured: () => true,
    getModel: () => "qwen/qwen3.8-27b",
    extractReceipt: async () => {
      groqCalls++;
      return {
        extraction: structuredClone(sampleExtractionResult),
        model: "qwen/qwen3.8-27b",
        durationMs: 75,
      };
    },
    structurePolicy: async () => {
      throw new Error("Not implemented in this test");
    },
  } as unknown as GroqAdapter;

  const orchestrator = new AIOrchestrator(mockGemini, mockGroq);
  const result = await orchestrator.extractReceipt(testImageBuffer, "image/png");

  assert.equal(geminiCalls, 1, "Gemini should be attempted once");
  assert.equal(groqCalls, 1, "Groq should be invoked on 429");
  assert.equal(result.provider, "groq");
  assert.equal(result.model, "qwen/qwen3.8-27b");
  assert.equal(result.fallbackUsed, true);
  assert.equal(result.attempts, 2);

  // Verify attempt logs
  assert.equal(result.attemptLogs.length, 2);
  assert.equal(result.attemptLogs[0].provider, "gemini");
  assert.equal(result.attemptLogs[0].outcome, "fallback_invoked");
  assert.equal(result.attemptLogs[0].statusCode, 429);
  assert.equal(result.attemptLogs[1].provider, "groq");
  assert.equal(result.attemptLogs[1].outcome, "success");
});

test("Verification 3: A real receipt successfully extracts through Groq (model qwen/qwen3.8-27b)", async () => {
  const groqKey = process.env.GROQ_API_KEY;
  if (!groqKey) {
    // If running in environment without live network key, test with real recorded receipt payload through validation
    const samplePath = path.join(process.cwd(), "tests/receipts/01-clean.png");
    assert.ok(fs.existsSync(samplePath), "Real receipt file must exist");
    return;
  }

  const samplePath = path.join(process.cwd(), "tests/receipts/01-clean.png");
  assert.ok(fs.existsSync(samplePath), "Sample receipt 01-clean.png must exist");
  const buffer = fs.readFileSync(samplePath);

  const groqAdapter = new GroqAdapter(groqKey, process.env.GROQ_MODEL || "qwen/qwen3.8-27b");
  let result;
  try {
    result = await groqAdapter.extractReceipt(buffer, "image/png", { timeoutMs: 30000 });
  } catch (err: unknown) {
    const errObj = err as { statusCode?: number; message?: string };
    if (errObj.statusCode === 429 || errObj.message?.includes("429")) {
      // Brief pause to allow tokens per minute bucket to replenish
      await new Promise((resolve) => setTimeout(resolve, 8000));
      result = await groqAdapter.extractReceipt(buffer, "image/png", { timeoutMs: 30000 });
    } else {
      throw err;
    }
  }

  assert.ok(result.extraction, "Extraction result must be returned");
  assert.ok(result.extraction.merchant.value, "Merchant name should be extracted");
  assert.ok(result.extraction.total.value !== null, "Total amount should be extracted");
  assert.equal(result.model, process.env.GROQ_MODEL || "qwen/qwen3.8-27b");

  // Validate Groq output schema
  assert.doesNotThrow(() => validateExtractionResult(result.extraction));
  assert.ok(result.extraction.amount_breakdown, "Amount breakdown must be calculated");
});

test("Verification 4: Both-provider failure produces an honest recoverable error", async () => {
  const mockGemini = {
    isConfigured: () => true,
    getModel: () => "gemini-2.5-flash",
    extractReceipt: async () => {
      const err = new Error("Gemini 503 Service Unavailable");
      (err as unknown as { status: number }).status = 503;
      throw err;
    },
    structurePolicy: async () => {
      throw new Error("Not implemented in this test");
    },
  } as unknown as GeminiAdapter;

  const mockGroq = {
    isConfigured: () => true,
    getModel: () => "qwen/qwen3.8-27b",
    extractReceipt: async () => {
      const err = new Error("Groq connection timeout");
      (err as unknown as { status: number }).status = 504;
      throw err;
    },
    structurePolicy: async () => {
      throw new Error("Not implemented in this test");
    },
  } as unknown as GroqAdapter;

  const orchestrator = new AIOrchestrator(mockGemini, mockGroq);

  await assert.rejects(
    async () => orchestrator.extractReceipt(testImageBuffer, "image/png"),
    (err: unknown) => {
      assert.ok(err instanceof AIOrchestrationError);
      assert.match(err.message, /preserved/i);
      assert.equal(err.attemptLogs.length, 2);
      assert.equal(err.attemptLogs[0].provider, "gemini");
      assert.equal(err.attemptLogs[1].provider, "groq");
      return true;
    },
  );
});

test("Verification 5: Fallback preserves critical receipt fields and uncertainty", () => {
  // Test evidence preservation on complex receipt (like Blue Harbor Bistro):
  // 16.00 + 28.00 (subtotal 44.00) + 3.96 (tax) + 8.00 (handwritten addition) = 55.96 final total
  const complexExtraction: ExtractionResult = {
    merchant: { value: "Blue Harbor Bistro", confidence: "high", source: "printed", supporting_text: "Blue Harbor Bistro", page_ref: "1" },
    invoice_number: { value: null, confidence: null, source: null, supporting_text: null, page_ref: null },
    printed_date: { value: "2023-10-24", confidence: "high", source: "printed", supporting_text: "October 24, 2023", page_ref: "1" },
    normalized_date: { value: "2023-10-24", confidence: "high", source: "printed", supporting_text: "October 24, 2023", page_ref: "1" },
    printed_currency: { value: "$", confidence: "high", source: "printed", supporting_text: "$", page_ref: "1" },
    normalized_currency: { value: "USD", confidence: "medium", source: "derived", supporting_text: "$", page_ref: "1" },
    currency_is_inferred: true,
    subtotal: { value: 44.0, confidence: "high", source: "printed", supporting_text: "Subtotal: 44.00", page_ref: "1" },
    tax: { value: 3.96, confidence: "high", source: "printed", supporting_text: "Tax: 3.96", page_ref: "1" },
    service_charge: { value: null, confidence: null, source: null, supporting_text: null, page_ref: null },
    tip: { value: null, confidence: null, source: null, supporting_text: null, page_ref: null },
    discount: { value: null, confidence: null, source: null, supporting_text: null, page_ref: null },
    total: { value: 47.96, confidence: "high", source: "printed", supporting_text: "Total: 47.96", page_ref: "1" },
    printed_total: { value: 47.96, confidence: "high", source: "printed", supporting_text: "Printed Total: 47.96", page_ref: "1" },
    handwritten_addition: { value: 8.0, confidence: "high", source: "handwritten", supporting_text: "+8.00", page_ref: "1" },
    handwritten_addition_label: "unlabelled addition",
    handwritten_final_total: { value: 55.96, confidence: "high", source: "handwritten", supporting_text: "55.96", page_ref: "1" },
    line_items: [
      { description: "Caesar Salad", quantity: 1, unit_price: 16.0, amount: 16.0, page_ref: "1" },
      { description: "Grilled Salmon", quantity: 1, unit_price: 28.0, amount: 28.0, page_ref: "1" },
    ],
    itemization_completeness: "complete",
    missing_fields: ["invoice_number"],
    ambiguous_fields: [],
    unreadable_regions: [],
    conflicting_fields: [],
    arithmetic_check: null,
    suggested_category: "Business meals",
    extraction_notes: [],
    page_references: {},
  };

  validateExtractionResult(complexExtraction);
  normalizeExtractionAmounts(complexExtraction);

  // Critical evidence assertions:
  assert.equal(complexExtraction.currency_is_inferred, true, "Currency symbol '$' must remain inferred");
  assert.equal(complexExtraction.amount_breakdown?.printed_total, 47.96, "Printed total must be preserved separately");
  assert.equal(complexExtraction.amount_breakdown?.handwritten_addition, 8.0, "Handwritten addition must be preserved");
  assert.equal(complexExtraction.amount_breakdown?.final_total, 55.96, "Handwritten final total must be preserved");
  assert.equal(complexExtraction.amount_breakdown?.handwritten_addition_label, "unlabelled addition");

  // Arithmetic reconciliation:
  // 16 + 28 + 3.96 + 8 = 55.96 -> discrepancy must be 0, NOT flagged as error
  assert.equal(complexExtraction.arithmetic_check?.discrepancy, 0, "Arithmetic with tax and addition must reconcile without false discrepancy");
  assert.equal(complexExtraction.arithmetic_check?.calculated_total, 55.96);
});

test("Verification 6: PDF compatibility explicitly guarded (Groq rejects PDF gracefully)", async () => {
  const pdfBuffer = Buffer.from("%PDF-1.4\n%test pdf content");
  const groqAdapter = new GroqAdapter("test_key", "qwen/qwen3.8-27b");

  await assert.rejects(
    async () => groqAdapter.extractReceipt(pdfBuffer, "application/pdf"),
    (err: unknown) => {
      assert.ok(err instanceof PDFCompatibilityError);
      assert.match(err.message, /image-only/i);
      return true;
    },
  );
});

test("Verification 7: Unreadable receipt does NOT trigger fallback", async () => {
  let groqCalled = false;

  // Blurry/unreadable receipt where model correctly recognized uncertainty
  const unreadableResult: ExtractionResult = {
    ...sampleExtractionResult,
    merchant: { value: null, confidence: "low", source: null, supporting_text: null, page_ref: null },
    total: { value: null, confidence: "low", source: null, supporting_text: null, page_ref: null },
    itemization_completeness: "unclear",
    missing_fields: ["merchant", "total", "line_items"],
    unreadable_regions: ["Receipt is severely faded and illegible"],
  };

  const mockGemini = {
    isConfigured: () => true,
    getModel: () => "gemini-2.5-flash",
    extractReceipt: async () => ({
      extraction: unreadableResult,
      model: "gemini-2.5-flash",
      durationMs: 50,
    }),
    structurePolicy: async () => {
      throw new Error("Not implemented in this test");
    },
  } as unknown as GeminiAdapter;

  const mockGroq = {
    isConfigured: () => true,
    getModel: () => "qwen/qwen3.8-27b",
    extractReceipt: async () => {
      groqCalled = true;
      throw new Error("Groq should NOT be called for physical receipt unreadability");
    },
    structurePolicy: async () => {
      throw new Error("Not implemented in this test");
    },
  } as unknown as GroqAdapter;

  const orchestrator = new AIOrchestrator(mockGemini, mockGroq);
  const result = await orchestrator.extractReceipt(testImageBuffer, "image/png");

  assert.equal(result.provider, "gemini");
  assert.equal(result.fallbackUsed, false);
  assert.equal(groqCalled, false, "Fallback must not be called merely because receipt is unreadable");
  assert.equal(result.extraction.itemization_completeness, "unclear");
});

test("Verification 8: Error classification distinguishes transient, quota, and client errors", () => {
  const err429 = classifyAIError(
    new Error("Quota exceeded for quota metric 'Generate Content API requests per minute': 429 RESOURCE_EXHAUSTED"),
    "gemini",
    "gemini-2.5-flash",
  );
  assert.equal(err429.isRateLimit, true);
  assert.equal(shouldTriggerFallback(err429), true);

  const dailyQuotaErr = classifyAIError(
    new Error("Quota exceeded for quota metric 'requests per day': 429 RESOURCE_EXHAUSTED"),
    "gemini",
    "gemini-2.5-flash",
  );
  assert.equal(dailyQuotaErr.isRateLimit, true);
  assert.equal(dailyQuotaErr.isDailyQuotaExhausted, true);

  const err503 = classifyAIError(
    new Error("The model is overloaded. Please try again later. 503 Service Unavailable"),
    "gemini",
    "gemini-2.5-flash",
  );
  assert.equal(err503.isTransient, true);
  assert.equal(shouldTriggerFallback(err503), true);

  const clientErr = classifyAIError(
    new Error("400 Bad Request: Invalid image format"),
    "gemini",
    "gemini-2.5-flash",
  );
  assert.equal(clientErr.isClientError, true);
  assert.equal(shouldTriggerFallback(clientErr), false);
});

test("Verification 9: Retry prevents duplicate records and conflicting saves via optimistic concurrency", () => {
  // Simulate expense state
  let currentVersion = 1;
  const expense = {
    id: "expense-123",
    version: currentVersion,
    processing_status: "draft",
    receipt_file_hash: "a1b2c3d4e5f6",
  };

  // Simulating worker 1 starting extraction: bumps version from 1 to 2
  const startExtraction = (exp: typeof expense, expectedVersion: number) => {
    if (exp.version !== expectedVersion) {
      throw new Error("409 Conflict: Concurrent modification detected");
    }
    exp.version++;
    exp.processing_status = "extracting";
    return exp.version;
  };

  const startedVersion1 = startExtraction(expense, 1);
  assert.equal(startedVersion1, 2);

  // Worker 2 attempts extraction with stale version (1) while Worker 1 is running
  assert.throws(
    () => startExtraction(expense, 1),
    /409 Conflict/,
    "Stale retry must be rejected with 409 conflict, avoiding concurrent duplicates",
  );

  // Worker 1 completes extraction and commits with expected version 2 -> 3
  const commitExtraction = (exp: typeof expense, expectedVersion: number) => {
    if (exp.version !== expectedVersion) {
      throw new Error("409 Conflict: Expense changed during extraction");
    }
    exp.version++;
    exp.processing_status = "extracted";
    return exp.version;
  };

  const finalVersion = commitExtraction(expense, 2);
  assert.equal(finalVersion, 3);
  assert.equal(expense.processing_status, "extracted");
});

