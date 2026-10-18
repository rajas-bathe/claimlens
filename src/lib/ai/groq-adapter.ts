import type { ExtractionResult } from "@/types";
import {
  EXTRACTION_SYSTEM_PROMPT,
  normalizeExtractionAmounts,
  validateExtractionResult,
} from "@/lib/gemini/extract";
import {
  POLICY_SYSTEM_PROMPT,
  validateStructuredPolicy,
} from "@/lib/gemini/policy";
import {
  AIProviderError,
  classifyAIError,
  PDFCompatibilityError,
} from "./errors";
import type {
  ExtractionOptions,
  PolicyStructureOptions,
  StructuredPolicyOutput,
} from "./types";

const GROQ_COMPLETIONS_URL = "https://api.groq.com/openai/v1/chat/completions";

const GROQ_EXTRACTION_SCHEMA_INSTRUCTION = `
You MUST return a JSON object with this structure:
{
  "merchant": { "value": string | null, "confidence": "high"|"medium"|"low"|null, "source": "printed"|"derived"|"handwritten"|null, "supporting_text": string | null, "page_ref": string | null },
  "total": { "value": number | null, "confidence": string | null, "source": string | null, "supporting_text": string | null, "page_ref": string | null },
  "subtotal": { "value": number | null, "confidence": string | null, "source": string | null, "supporting_text": string | null, "page_ref": string | null },
  "tax": { "value": number | null, "confidence": string | null, "source": string | null, "supporting_text": string | null, "page_ref": string | null },
  "printed_total": { "value": number | null, "confidence": string | null, "source": string | null, "supporting_text": string | null, "page_ref": string | null },
  "handwritten_addition": { "value": number | null, "confidence": string | null, "source": string | null, "supporting_text": string | null, "page_ref": string | null },
  "handwritten_addition_label": string | null,
  "handwritten_final_total": { "value": number | null, "confidence": string | null, "source": string | null, "supporting_text": string | null, "page_ref": string | null },
  "normalized_date": { "value": string | null, "confidence": string | null, "source": string | null, "supporting_text": string | null, "page_ref": string | null },
  "printed_date": { "value": string | null, "confidence": string | null, "source": string | null, "supporting_text": string | null, "page_ref": string | null },
  "normalized_currency": { "value": string | null, "confidence": string | null, "source": string | null, "supporting_text": string | null, "page_ref": string | null },
  "printed_currency": { "value": string | null, "confidence": string | null, "source": string | null, "supporting_text": string | null, "page_ref": string | null },
  "currency_is_inferred": boolean,
  "invoice_number": { "value": string | null, "confidence": string | null, "source": string | null, "supporting_text": string | null, "page_ref": string | null },
  "line_items": [
    { "description": string | null, "quantity": number | null, "unit_price": number | null, "amount": number | null, "page_ref": string | null }
  ],
  "itemization_completeness": "complete" | "partial" | "none" | "unclear",
  "missing_fields": string[],
  "suggested_category": string | null
}
`;

export class GroqAdapter {
  private apiKey: string | undefined;
  private defaultModel: string;

  constructor(apiKey?: string, model?: string) {
    this.apiKey = apiKey ?? process.env.GROQ_API_KEY;
    this.defaultModel = model ?? process.env.GROQ_MODEL ?? "qwen/qwen3.8-27b";
  }

  public getModel(): string {
    return this.defaultModel;
  }

  public isConfigured(): boolean {
    return Boolean(this.apiKey && this.apiKey.trim().length > 0);
  }

  /**
   * Extract receipt evidence using Groq vision API.
   * Explicitly handles PDF compatibility: vision model only accepts images.
   */
  async extractReceipt(
    fileBuffer: Buffer,
    mimeType: string,
    options?: ExtractionOptions,
  ): Promise<{
    extraction: ExtractionResult;
    model: string;
    durationMs: number;
  }> {
    const startTime = Date.now();
    const model = this.defaultModel;

    // Explicit PDF compatibility check: Groq vision is image-only
    const isPdf =
      mimeType.toLowerCase() === "application/pdf" ||
      fileBuffer.slice(0, 5).toString("utf8") === "%PDF-";

    if (isPdf) {
      throw new PDFCompatibilityError(
        "Groq fallback is an image-only vision model and only supports image files (PNG, JPEG, WebP). Cannot send PDF documents directly to Groq vision.",
      );
    }

    if (!this.apiKey) {
      throw new AIProviderError({
        message: "GROQ_API_KEY is not configured",
        provider: "groq",
        model,
        isTransient: false,
      });
    }

    const timeout = options?.timeoutMs ?? 30000;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    // Merge external signal if provided
    if (options?.signal) {
      options.signal.addEventListener("abort", () => controller.abort());
    }

    try {
      const base64Data = fileBuffer.toString("base64");
      const effectiveMime = mimeType || "image/png";

      const systemPrompt = `${EXTRACTION_SYSTEM_PROMPT}\n\n${GROQ_EXTRACTION_SCHEMA_INSTRUCTION}`;

      const res = await fetch(GROQ_COMPLETIONS_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: systemPrompt },
            {
              role: "user",
              content: [
                {
                  type: "text",
                  text: "Extract all receipt evidence following the schema precisely. Preserve printed vs handwritten figures separately.",
                },
                {
                  type: "image_url",
                  image_url: {
                    url: `data:${effectiveMime};base64,${base64Data}`,
                  },
                },
              ],
            },
          ],
          response_format: { type: "json_object" },
          temperature: 0,
          max_tokens: parseInt(process.env.GROQ_MAX_TOKENS || "650", 10),
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const errorBody = await res.text().catch(() => "");
        throw new AIProviderError({
          message: `Groq vision API failed with status ${res.status}: ${errorBody}`,
          provider: "groq",
          model,
          statusCode: res.status,
          isTransient: [500, 502, 503, 504].includes(res.status),
          isRateLimit: res.status === 429,
        });
      }

      const json = await res.json();
      const content = json.choices?.[0]?.message?.content;

      if (!content) {
        throw new AIProviderError({
          message: "Groq returned an empty response body",
          provider: "groq",
          model,
          isTransient: true,
        });
      }

      let parsed: unknown;
      try {
        parsed = JSON.parse(content);
      } catch (parseErr) {
        throw new AIProviderError({
          message: `Failed to parse Groq response as JSON: ${content.slice(0, 200)}`,
          provider: "groq",
          model,
          isSchemaError: true,
          originalError: parseErr,
        });
      }

      // Strict schema validation: JSON mode alone is insufficient
      const ext = parsed as Record<string, unknown>;
      if (!Array.isArray(ext.line_items)) ext.line_items = [];
      if (!Array.isArray(ext.missing_fields)) ext.missing_fields = [];
      if (!Array.isArray(ext.ambiguous_fields)) ext.ambiguous_fields = [];
      if (!Array.isArray(ext.unreadable_regions)) ext.unreadable_regions = [];
      if (!Array.isArray(ext.conflicting_fields)) ext.conflicting_fields = [];
      if (!Array.isArray(ext.extraction_notes)) ext.extraction_notes = [];
      if (!ext.page_references || typeof ext.page_references !== "object") ext.page_references = {};
      if (!["complete", "partial", "none", "unclear"].includes(String(ext.itemization_completeness))) {
        ext.itemization_completeness = (ext.line_items as unknown[]).length > 0 ? "complete" : "none";
      }
      for (const field of ["invoice_number", "printed_date", "printed_currency", "service_charge", "tip", "discount", "handwritten_addition", "handwritten_final_total"]) {
        if (!ext[field]) {
          ext[field] = { value: null, confidence: null, source: null, supporting_text: null, page_ref: null };
        }
      }

      validateExtractionResult(parsed);
      normalizeExtractionAmounts(parsed);

      return {
        extraction: parsed,
        model,
        durationMs: Date.now() - startTime,
      };
    } catch (err) {
      if (err instanceof PDFCompatibilityError || err instanceof AIProviderError) {
        throw err;
      }
      throw classifyAIError(err, "groq", model);
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Structure policy document text using Groq.
   */
  async structurePolicy(
    documentText: string,
    options?: PolicyStructureOptions,
  ): Promise<{
    output: StructuredPolicyOutput;
    model: string;
    durationMs: number;
  }> {
    const startTime = Date.now();
    const model = this.defaultModel;

    if (!this.apiKey) {
      throw new AIProviderError({
        message: "GROQ_API_KEY is not configured",
        provider: "groq",
        model,
        isTransient: false,
      });
    }

    const timeout = options?.timeoutMs ?? 30000;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    if (options?.signal) {
      options.signal.addEventListener("abort", () => controller.abort());
    }

    try {
      const res = await fetch(GROQ_COMPLETIONS_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: POLICY_SYSTEM_PROMPT },
            { role: "user", content: documentText },
          ],
          response_format: { type: "json_object" },
          temperature: 0,
          max_tokens: parseInt(process.env.GROQ_MAX_TOKENS || "850", 10),
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const errorBody = await res.text().catch(() => "");
        throw new AIProviderError({
          message: `Groq policy parsing failed with status ${res.status}: ${errorBody}`,
          provider: "groq",
          model,
          statusCode: res.status,
          isTransient: [500, 502, 503, 504].includes(res.status),
          isRateLimit: res.status === 429,
        });
      }

      const json = await res.json();
      const content = json.choices?.[0]?.message?.content;

      if (!content) {
        throw new AIProviderError({
          message: "Groq returned empty policy content",
          provider: "groq",
          model,
          isTransient: true,
        });
      }

      let parsed: unknown;
      try {
        parsed = JSON.parse(content);
      } catch (parseErr) {
        throw new AIProviderError({
          message: `Failed to parse Groq policy response as JSON: ${content.slice(0, 200)}`,
          provider: "groq",
          model,
          isSchemaError: true,
          originalError: parseErr,
        });
      }

      const output = validateStructuredPolicy(parsed, documentText);
      return {
        output,
        model,
        durationMs: Date.now() - startTime,
      };
    } catch (err) {
      if (err instanceof AIProviderError) {
        throw err;
      }
      throw classifyAIError(err, "groq", model);
    } finally {
      clearTimeout(timeoutId);
    }
  }
}
