import type { ExtractionResult } from "@/types";
import { PolicyParsingError } from "@/lib/gemini/policy";
import { GeminiAdapter } from "./gemini-adapter";
import { GroqAdapter } from "./groq-adapter";
import {
  AIOrchestrationError,
  AIProviderError,
  classifyAIError,
  PDFCompatibilityError,
  shouldTriggerFallback,
} from "./errors";
import type {
  ExtractionOptions,
  OrchestratedExtractionResult,
  OrchestratedPolicyResult,
  PolicyStructureOptions,
  ProviderAttemptLog,
} from "./types";

const DEFAULT_TOTAL_DEADLINE_MS = 55000;
const MIN_REMAINING_TIME_FOR_ATTEMPT_MS = 3000;
const MAX_ATTEMPT_TIMEOUT_MS = 25000;

export class AIOrchestrator {
  private gemini: GeminiAdapter;
  private groq: GroqAdapter;

  constructor(gemini?: GeminiAdapter, groq?: GroqAdapter) {
    this.gemini = gemini ?? new GeminiAdapter();
    this.groq = groq ?? new GroqAdapter();
  }

  /**
   * Extract receipt evidence with robust primary -> fallback orchestration.
   *
   * Flow:
   * 1. Try Gemini primary.
   * 2. If Gemini succeeds, returns immediately without calling fallback.
   * 3. If Gemini fails with rate limit (429), quota exhaustion, 5xx server error, or timeout,
   *    switches to Groq fallback using model `qwen/qwen3.8-27b`.
   * 4. Respects total request deadline and bounds retries.
   * 5. Does not retry exhausted daily quotas repeatedly.
   * 6. Does not fallback merely because receipt is unreadable or blurry (returns valid extraction with nulls).
   * 7. Enforces strict schema validation on Groq response.
   * 8. Explicitly guards PDF compatibility (Groq vision is image-only).
   * 9. If both fail, preserves upload and returns honest recoverable error.
   */
  async extractReceipt(
    fileBuffer: Buffer,
    mimeType: string,
    options?: ExtractionOptions,
  ): Promise<OrchestratedExtractionResult> {
    const overallStartTime = Date.now();
    const deadlineMs = options?.deadlineMs ?? DEFAULT_TOTAL_DEADLINE_MS;
    const attemptLogs: ProviderAttemptLog[] = [];

    const getRemainingMs = () =>
      Math.max(0, deadlineMs - (Date.now() - overallStartTime));

    let primaryError: Error | undefined;
    let fallbackError: Error | undefined;
    let currentAttempt = 0;

    // --- STEP 1: Attempt Primary (Gemini) ---
    if (this.gemini.isConfigured()) {
      currentAttempt++;
      const attemptStartTime = Date.now();
      const attemptTimeout = Math.min(
        MAX_ATTEMPT_TIMEOUT_MS,
        Math.max(3000, getRemainingMs() - 2000),
      );

      try {
        const result = await this.gemini.extractReceipt(fileBuffer, mimeType, {
          timeoutMs: attemptTimeout,
          signal: options?.signal,
        });

        attemptLogs.push({
          provider: "gemini",
          model: result.model,
          attempt: currentAttempt,
          durationMs: result.durationMs,
          outcome: "success",
        });

        // Primary succeeded! Never invoke backup when primary succeeds.
        return {
          extraction: result.extraction,
          provider: "gemini",
          model: result.model,
          attempts: currentAttempt,
          fallbackUsed: false,
          attemptLogs,
          totalDurationMs: Date.now() - overallStartTime,
        };
      } catch (err) {
        const classified = classifyAIError(err, "gemini", this.gemini.getModel());
        primaryError = classified;

        attemptLogs.push({
          provider: "gemini",
          model: this.gemini.getModel(),
          attempt: currentAttempt,
          durationMs: Date.now() - attemptStartTime,
          outcome: "failed",
          error: classified.message,
          statusCode: classified.statusCode,
        });

        // Check if error warrants fallback
        if (!shouldTriggerFallback(classified)) {
          // Client error or invalid request: don't invoke fallback
          throw classified;
        }

        // Mark primary attempt as fallback_invoked in log
        attemptLogs[attemptLogs.length - 1].outcome = "fallback_invoked";
      }
    } else {
      attemptLogs.push({
        provider: "gemini",
        model: this.gemini.getModel(),
        attempt: 0,
        durationMs: 0,
        outcome: "skipped",
        error: "GEMINI_API_KEY is not configured",
      });
    }

    // --- STEP 2: Attempt Fallback (Groq) ---
    // Check if remaining deadline allows another request
    if (getRemainingMs() < MIN_REMAINING_TIME_FOR_ATTEMPT_MS) {
      throw new AIOrchestrationError(
        "Receipt extraction timed out before fallback could complete. Your upload is preserved. Please retry or enter details manually.",
        attemptLogs,
        primaryError,
      );
    }

    if (!this.groq.isConfigured()) {
      attemptLogs.push({
        provider: "groq",
        model: this.groq.getModel(),
        attempt: currentAttempt + 1,
        durationMs: 0,
        outcome: "skipped",
        error: "GROQ_API_KEY is not configured",
      });

      throw new AIOrchestrationError(
        primaryError
          ? `Primary extraction service failed (${primaryError.message}) and fallback provider is not configured. Your receipt is preserved.`
          : "No AI extraction providers are configured. Your receipt is preserved. Please enter details manually.",
        attemptLogs,
        primaryError,
      );
    }

    // PDF Compatibility Check for Groq Vision
    const isPdf =
      mimeType.toLowerCase() === "application/pdf" ||
      fileBuffer.slice(0, 5).toString("utf8") === "%PDF-";

    if (isPdf) {
      attemptLogs.push({
        provider: "groq",
        model: this.groq.getModel(),
        attempt: currentAttempt + 1,
        durationMs: 0,
        outcome: "failed",
        error: "PDF format not supported by image-only fallback vision model",
      });

      throw new AIOrchestrationError(
        `Primary receipt reading failed (${primaryError?.message ?? "unavailable"}) and fallback vision model (${this.groq.getModel()}) does not support PDF documents directly. Please upload an image format (PNG, JPEG, WebP) or enter details manually. Your uploaded PDF is safely preserved.`,
        attemptLogs,
        primaryError,
        new PDFCompatibilityError(),
      );
    }

    // Call Groq Vision
    currentAttempt++;
    const fallbackStartTime = Date.now();
    const fallbackTimeout = Math.min(
      MAX_ATTEMPT_TIMEOUT_MS,
      Math.max(3000, getRemainingMs() - 1000),
    );

    try {
      const result = await this.groq.extractReceipt(fileBuffer, mimeType, {
        timeoutMs: fallbackTimeout,
        signal: options?.signal,
      });

      attemptLogs.push({
        provider: "groq",
        model: result.model,
        attempt: currentAttempt,
        durationMs: result.durationMs,
        outcome: "success",
      });

      return {
        extraction: result.extraction,
        provider: "groq",
        model: result.model,
        attempts: currentAttempt,
        fallbackUsed: true,
        attemptLogs,
        totalDurationMs: Date.now() - overallStartTime,
      };
    } catch (err) {
      const classified = classifyAIError(err, "groq", this.groq.getModel());
      fallbackError = classified;

      attemptLogs.push({
        provider: "groq",
        model: this.groq.getModel(),
        attempt: currentAttempt,
        durationMs: Date.now() - fallbackStartTime,
        outcome: "failed",
        error: classified.message,
        statusCode: classified.statusCode,
      });

      throw new AIOrchestrationError(
        "Receipt extraction could not be completed by primary or backup services. Your uploaded receipt is safely preserved. You can enter expense details manually or retry.",
        attemptLogs,
        primaryError,
        fallbackError,
      );
    }
  }

  /**
   * Structure company policy with robust primary -> fallback orchestration.
   * Never substitutes predefined or fabricated rules.
   */
  async structurePolicy(
    documentText: string,
    options?: PolicyStructureOptions,
  ): Promise<OrchestratedPolicyResult> {
    const overallStartTime = Date.now();
    const deadlineMs = options?.deadlineMs ?? DEFAULT_TOTAL_DEADLINE_MS;
    const attemptLogs: ProviderAttemptLog[] = [];

    const getRemainingMs = () =>
      Math.max(0, deadlineMs - (Date.now() - overallStartTime));

    let primaryError: Error | undefined;
    let fallbackError: Error | undefined;
    let currentAttempt = 0;

    // --- STEP 1: Attempt Primary (Gemini) ---
    if (this.gemini.isConfigured()) {
      currentAttempt++;
      const attemptStartTime = Date.now();
      const attemptTimeout = Math.min(
        MAX_ATTEMPT_TIMEOUT_MS,
        Math.max(3000, getRemainingMs() - 2000),
      );

      try {
        const result = await this.gemini.structurePolicy(documentText, {
          timeoutMs: attemptTimeout,
          signal: options?.signal,
        });

        attemptLogs.push({
          provider: "gemini",
          model: result.model,
          attempt: currentAttempt,
          durationMs: result.durationMs,
          outcome: "success",
        });

        return {
          output: result.output,
          provider: "gemini",
          model: result.model,
          attempts: currentAttempt,
          fallbackUsed: false,
          attemptLogs,
          totalDurationMs: Date.now() - overallStartTime,
        };
      } catch (err) {
        const classified = classifyAIError(err, "gemini", this.gemini.getModel());
        primaryError = classified;

        attemptLogs.push({
          provider: "gemini",
          model: this.gemini.getModel(),
          attempt: currentAttempt,
          durationMs: Date.now() - attemptStartTime,
          outcome: "failed",
          error: classified.message,
          statusCode: classified.statusCode,
        });

        if (!shouldTriggerFallback(classified)) {
          throw new PolicyParsingError(
            "INVALID_POLICY_RESPONSE",
            classified.message,
          );
        }

        attemptLogs[attemptLogs.length - 1].outcome = "fallback_invoked";
      }
    } else {
      attemptLogs.push({
        provider: "gemini",
        model: this.gemini.getModel(),
        attempt: 0,
        durationMs: 0,
        outcome: "skipped",
        error: "GEMINI_API_KEY is not configured",
      });
    }

    // --- STEP 2: Attempt Fallback (Groq) ---
    if (getRemainingMs() < MIN_REMAINING_TIME_FOR_ATTEMPT_MS) {
      throw new PolicyParsingError(
        "PARSER_UNAVAILABLE",
        "Policy structuring timed out before fallback could complete. Your policy text is preserved. Please retry or save for manual review.",
      );
    }

    if (!this.groq.isConfigured()) {
      attemptLogs.push({
        provider: "groq",
        model: this.groq.getModel(),
        attempt: currentAttempt + 1,
        durationMs: 0,
        outcome: "skipped",
        error: "GROQ_API_KEY is not configured",
      });

      throw new PolicyParsingError(
        "PARSER_UNAVAILABLE",
        primaryError
          ? `Primary policy parser failed (${primaryError.message}) and fallback provider is not configured. Your text is preserved. Save for manual review or retry.`
          : "Automatic policy reading is not configured. Your text is still here. Save it for manual review or configure an AI provider and retry.",
      );
    }

    currentAttempt++;
    const fallbackStartTime = Date.now();
    const fallbackTimeout = Math.min(
      MAX_ATTEMPT_TIMEOUT_MS,
      Math.max(3000, getRemainingMs() - 1000),
    );

    try {
      const result = await this.groq.structurePolicy(documentText, {
        timeoutMs: fallbackTimeout,
        signal: options?.signal,
      });

      attemptLogs.push({
        provider: "groq",
        model: result.model,
        attempt: currentAttempt,
        durationMs: result.durationMs,
        outcome: "success",
      });

      return {
        output: result.output,
        provider: "groq",
        model: result.model,
        attempts: currentAttempt,
        fallbackUsed: true,
        attemptLogs,
        totalDurationMs: Date.now() - overallStartTime,
      };
    } catch (err) {
      const classified = classifyAIError(err, "groq", this.groq.getModel());
      fallbackError = classified;

      attemptLogs.push({
        provider: "groq",
        model: this.groq.getModel(),
        attempt: currentAttempt,
        durationMs: Date.now() - fallbackStartTime,
        outcome: "failed",
        error: classified.message,
        statusCode: classified.statusCode,
      });

      throw new PolicyParsingError(
        "PARSER_UNAVAILABLE",
        "The policy-reading service is unavailable from both primary and backup providers. Your text is preserved. Retry or save the source for manual review.",
      );
    }
  }
}

// Singleton instance for general use
let defaultOrchestrator: AIOrchestrator | null = null;

export function getAIOrchestrator(): AIOrchestrator {
  if (!defaultOrchestrator) {
    defaultOrchestrator = new AIOrchestrator();
  }
  return defaultOrchestrator;
}
