import { GoogleGenAI } from "@google/genai";
import type { ExtractionResult } from "@/types";
import {
  EXTRACTION_RESPONSE_SCHEMA,
  EXTRACTION_SYSTEM_PROMPT,
  normalizeExtractionAmounts,
  validateExtractionResult,
} from "@/lib/gemini/extract";
import {
  POLICY_SYSTEM_PROMPT,
  validateStructuredPolicy,
} from "@/lib/gemini/policy";
import { classifyAIError, AIProviderError } from "./errors";
import type {
  ExtractionOptions,
  PolicyStructureOptions,
  StructuredPolicyOutput,
} from "./types";

export class GeminiAdapter {
  private apiKey: string | undefined;
  private defaultModel: string;

  constructor(apiKey?: string, model?: string) {
    this.apiKey = apiKey ?? process.env.GEMINI_API_KEY;
    this.defaultModel = model ?? process.env.GEMINI_MODEL ?? "gemini-2.5-flash";
  }

  public getModel(): string {
    return this.defaultModel;
  }

  public isConfigured(): boolean {
    return Boolean(this.apiKey && this.apiKey.trim().length > 0);
  }

  /**
   * Extract receipt evidence using Gemini.
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

    if (!this.apiKey) {
      throw new AIProviderError({
        message: "GEMINI_API_KEY is not configured",
        provider: "gemini",
        model,
        isTransient: false,
      });
    }

    const timeout = options?.timeoutMs ?? 30000;
    const ai = new GoogleGenAI({
      apiKey: this.apiKey,
      httpOptions: { timeout },
    });

    try {
      const response = await ai.models.generateContent({
        model,
        contents: [
          {
            role: "user",
            parts: [
              {
                inlineData: {
                  mimeType,
                  data: fileBuffer.toString("base64"),
                },
              },
              {
                text: "Extract all receipt evidence following the schema precisely. Preserve printed vs handwritten figures separately.",
              },
            ],
          },
        ],
        config: {
          systemInstruction: EXTRACTION_SYSTEM_PROMPT,
          responseMimeType: "application/json",
          responseSchema: EXTRACTION_RESPONSE_SCHEMA as Parameters<
            typeof ai.models.generateContent
          >[0]["config"] extends object
            ? unknown
            : never,
          temperature: 0,
        },
      });

      const text = response?.text;
      if (!text) {
        throw new Error("Gemini returned an empty extraction response");
      }

      let parsed: ExtractionResult;
      try {
        parsed = JSON.parse(text) as ExtractionResult;
      } catch (parseErr) {
        throw new AIProviderError({
          message: `Failed to parse Gemini response as JSON: ${text.slice(0, 200)}`,
          provider: "gemini",
          model,
          isSchemaError: true,
          originalError: parseErr,
        });
      }

      validateExtractionResult(parsed);
      normalizeExtractionAmounts(parsed);

      return {
        extraction: parsed,
        model,
        durationMs: Date.now() - startTime,
      };
    } catch (err) {
      throw classifyAIError(err, "gemini", model);
    }
  }

  /**
   * Structure policy document text using Gemini.
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
        message: "GEMINI_API_KEY is not configured",
        provider: "gemini",
        model,
        isTransient: false,
      });
    }

    const timeout = options?.timeoutMs ?? 30000;
    const ai = new GoogleGenAI({
      apiKey: this.apiKey,
      httpOptions: { timeout },
    });

    try {
      const response = await ai.models.generateContent({
        model,
        contents: documentText,
        config: {
          systemInstruction: POLICY_SYSTEM_PROMPT,
          responseMimeType: "application/json",
          temperature: 0,
        },
      });

      const text = response.text;
      if (!text) {
        throw new Error("Gemini returned no policy interpretation");
      }

      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch (parseErr) {
        throw new AIProviderError({
          message: `Gemini returned unreadable policy JSON: ${text.slice(0, 200)}`,
          provider: "gemini",
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
      throw classifyAIError(err, "gemini", model);
    }
  }
}
