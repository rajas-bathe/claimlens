import type { AIProviderName, ProviderAttemptLog } from "./types";

export class AIProviderError extends Error {
  public isTransient: boolean;
  public isRateLimit: boolean;
  public isDailyQuotaExhausted: boolean;
  public isClientError: boolean;
  public isSchemaError: boolean;
  public provider: AIProviderName;
  public model: string;
  public statusCode?: number;
  public originalError?: unknown;

  constructor(params: {
    message: string;
    provider: AIProviderName;
    model: string;
    statusCode?: number;
    isTransient?: boolean;
    isRateLimit?: boolean;
    isDailyQuotaExhausted?: boolean;
    isClientError?: boolean;
    isSchemaError?: boolean;
    originalError?: unknown;
  }) {
    super(params.message);
    this.name = "AIProviderError";
    this.provider = params.provider;
    this.model = params.model;
    this.statusCode = params.statusCode;
    this.isTransient = params.isTransient ?? false;
    this.isRateLimit = params.isRateLimit ?? false;
    this.isDailyQuotaExhausted = params.isDailyQuotaExhausted ?? false;
    this.isClientError = params.isClientError ?? false;
    this.isSchemaError = params.isSchemaError ?? false;
    this.originalError = params.originalError;
  }
}

export class PDFCompatibilityError extends Error {
  constructor(message = "Groq fallback is an image-only vision model and does not accept PDF documents directly. PDF extraction requires the primary provider or manual entry.") {
    super(message);
    this.name = "PDFCompatibilityError";
  }
}

export class AIOrchestrationError extends Error {
  public attemptLogs: ProviderAttemptLog[];
  public primaryError?: Error;
  public fallbackError?: Error;

  constructor(
    message: string,
    attemptLogs: ProviderAttemptLog[],
    primaryError?: Error,
    fallbackError?: Error,
  ) {
    super(message);
    this.name = "AIOrchestrationError";
    this.attemptLogs = attemptLogs;
    this.primaryError = primaryError;
    this.fallbackError = fallbackError;
  }
}

/**
 * Classifies an error from an AI provider (Gemini or Groq) to determine retry and fallback behavior.
 */
export function classifyAIError(
  err: unknown,
  provider: AIProviderName,
  model: string,
): AIProviderError {
  if (err instanceof AIProviderError) {
    return err;
  }

  const message = err instanceof Error ? err.message : String(err);
  const lowerMsg = message.toLowerCase();

  // Extract HTTP status if present on error object
  let statusCode: number | undefined;
  if (typeof err === "object" && err !== null) {
    if ("status" in err && typeof (err as { status: unknown }).status === "number") {
      statusCode = (err as { status: number }).status;
    } else if ("statusCode" in err && typeof (err as { statusCode: unknown }).statusCode === "number") {
      statusCode = (err as { statusCode: number }).statusCode;
    }
  }

  // Check rate limit / 429 / resource exhausted
  const is429 =
    statusCode === 429 ||
    lowerMsg.includes("429") ||
    lowerMsg.includes("resource_exhausted") ||
    lowerMsg.includes("rate limit") ||
    lowerMsg.includes("quota exceeded") ||
    lowerMsg.includes("too many requests");

  // Check if daily quota is exhausted (non-retryable on primary)
  const isDailyQuotaExhausted =
    is429 &&
    (lowerMsg.includes("per day") ||
      lowerMsg.includes("daily") ||
      lowerMsg.includes("free tier daily limit") ||
      lowerMsg.includes("day quota") ||
      lowerMsg.includes("requests per day"));

  // Check transient server failures (5xx, timeouts, connection resets)
  const isTransient =
    statusCode === 500 ||
    statusCode === 502 ||
    statusCode === 503 ||
    statusCode === 504 ||
    lowerMsg.includes("500") ||
    lowerMsg.includes("502") ||
    lowerMsg.includes("503") ||
    lowerMsg.includes("504") ||
    lowerMsg.includes("unavailable") ||
    lowerMsg.includes("timeout") ||
    lowerMsg.includes("timed out") ||
    lowerMsg.includes("econnreset") ||
    lowerMsg.includes("etimedout") ||
    lowerMsg.includes("network") ||
    lowerMsg.includes("abort") ||
    lowerMsg.includes("service unavailable");

  // Check client error (4xx other than 429)
  const isClientError =
    (typeof statusCode === "number" && statusCode >= 400 && statusCode < 500 && statusCode !== 429) ||
    lowerMsg.includes("invalid argument") ||
    lowerMsg.includes("bad request");

  // Check schema validation / parse error
  const isSchemaError =
    lowerMsg.includes("schema") ||
    lowerMsg.includes("json parse") ||
    lowerMsg.includes("unexpected token") ||
    lowerMsg.includes("invalid evidence structure") ||
    lowerMsg.includes("missing required field");

  return new AIProviderError({
    message,
    provider,
    model,
    statusCode,
    isTransient,
    isRateLimit: is429,
    isDailyQuotaExhausted,
    isClientError,
    isSchemaError,
    originalError: err,
  });
}

/**
 * Determines whether a primary error justifies falling back to Groq.
 *
 * Requirements:
 * - Fall back on Gemini quota/rate-limit errors, temporary server failures, or timeouts.
 * - Do NOT fall back merely because a receipt is unreadable or a policy check fails.
 * - Do NOT repeatedly retry exhausted daily quota.
 */
export function shouldTriggerFallback(error: AIProviderError): boolean {
  // If provider not configured
  if (error.message.includes("not configured") || error.message.includes("API key")) {
    return true;
  }

  // Quota / rate limit errors trigger fallback
  if (error.isRateLimit) {
    return true;
  }

  // Transient server errors (5xx, timeouts, network failures) trigger fallback
  if (error.isTransient) {
    return true;
  }

  // If primary returned corrupted or unparseable output (schema error on primary)
  if (error.isSchemaError) {
    return true;
  }

  return false;
}
