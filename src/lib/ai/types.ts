import type { ExtractionResult, PolicyRule, UnsupportedClause } from "@/types";

export type AIProviderName = "gemini" | "groq";

export interface ProviderAttemptLog {
  provider: AIProviderName;
  model: string;
  attempt: number;
  durationMs: number;
  outcome: "success" | "fallback_invoked" | "failed" | "skipped";
  error?: string;
  errorCode?: string;
  statusCode?: number;
}

export interface ExtractionOptions {
  deadlineMs?: number;
  timeoutMs?: number;
  signal?: AbortSignal;
}

export interface PolicyStructureOptions {
  deadlineMs?: number;
  timeoutMs?: number;
  signal?: AbortSignal;
}

export interface StructuredPolicyOutput {
  structured_rules: PolicyRule[];
  unsupported_clauses: UnsupportedClause[];
}

export interface OrchestratedExtractionResult {
  extraction: ExtractionResult;
  provider: AIProviderName;
  model: string;
  attempts: number;
  fallbackUsed: boolean;
  attemptLogs: ProviderAttemptLog[];
  totalDurationMs: number;
}

export interface OrchestratedPolicyResult {
  output: StructuredPolicyOutput;
  provider: AIProviderName;
  model: string;
  attempts: number;
  fallbackUsed: boolean;
  attemptLogs: ProviderAttemptLog[];
  totalDurationMs: number;
}
