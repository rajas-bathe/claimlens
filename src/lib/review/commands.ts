import Decimal from "decimal.js";
import { randomUUID } from "node:crypto";
import type {
  Expense,
  Evaluation,
  PolicyVersion,
  UserSession,
  ConfirmedFields,
} from "@/types";
import { evaluateExpensePolicy, EVALUATOR_VERSION } from "@/lib/policy/engine";
import { selectPolicyForDate } from "@/lib/policy/selection";
import type { SupabaseClient } from "@supabase/supabase-js";
export type ReviewAction =
  | "save"
  | "submit"
  | "evaluate"
  | "approve"
  | "reject"
  | "request";
export interface ReviewContext {
  revision: number;
  expense: Expense;
  history: Expense[];
  policies: PolicyVersion[];
}
export interface ReviewCommand {
  action: ReviewAction;
  updates?: Record<string, unknown>;
  note?: string;
  overrideReason?: string;
  expectedVersion?: number;
  requestId?: string;
}
export interface CommitInput {
  session: UserSession;
  context: ReviewContext;
  command: ReviewCommand;
  evaluation: Partial<Evaluation> | null;
}
export interface CommitResult {
  expense: Expense;
  evaluation?: Evaluation | null;
  already_applied: boolean;
}
export interface ReviewRepository {
  load(
    companyId: string,
    expenseId: string,
    actorId: string,
  ): Promise<ReviewContext>;
  commit(input: CommitInput): Promise<CommitResult>;
}
export class ReviewError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 400,
  ) {
    super(message);
    this.name = "ReviewError";
  }
}
const FIELDS = new Set([
  "merchant",
  "expense_date",
  "original_amount",
  "original_currency",
  "category",
  "city",
  "trip_context",
  "business_purpose",
  "client_name",
  "attendee_count",
  "attendee_names",
  "invoice_number",
  "currency_confirmed",
  "converted_currency",
  "converted_amount",
  "exchange_rate",
  "exchange_rate_date",
  "exchange_rate_source",
]);
export function assertAuthorized(
  session: UserSession,
  expense: Expense,
  action: ReviewAction,
) {
  if (
    session.company.id !== expense.company_id ||
    session.membership.company_id !== expense.company_id ||
    (session.membership.role !== "finance" &&
      expense.employee_id !== session.id) ||
    (["approve", "reject", "request"].includes(action) &&
      session.membership.role !== "finance")
  )
    throw new ReviewError(
      "FORBIDDEN",
      "You do not have permission to perform this action.",
      403,
    );
}
export function correctedExpense(
  expense: Expense,
  updates: Record<string, unknown>,
  session: UserSession,
): Expense {
  const confirmed: ConfirmedFields = { ...expense.confirmed_fields };
  for (const [key, value] of Object.entries(updates)) {
    if (!FIELDS.has(key))
      throw new ReviewError(
        "INVALID_FIELDS",
        "An unsupported expense field was submitted.",
      );
    if (key === "currency_confirmed") {
      if (typeof value !== "boolean")
        throw new ReviewError(
          "INVALID_CONFIRMATION",
          "Confirm the currency explicitly.",
        );
      continue;
    }
    if (
      key === "original_amount" &&
      value !== null &&
      (typeof value !== "number" || !Number.isFinite(value) || value < 0)
    )
      throw new ReviewError(
        "INVALID_AMOUNT",
        "Enter a valid non-negative amount.",
      );
    if (
      key === "original_currency" &&
      value !== null &&
      (typeof value !== "string" || !/^[A-Z]{3}$/.test(value))
    )
      throw new ReviewError(
        "INVALID_CURRENCY",
        "Enter a three-letter ISO currency code.",
      );
    if (
      key === "attendee_count" &&
      value !== null &&
      (typeof value !== "number" || !Number.isInteger(value) || value < 1)
    )
      throw new ReviewError(
        "INVALID_ATTENDEES",
        "Attendee count must be a positive whole number.",
      );
    if (
      ![
        "original_amount",
        "attendee_count",
        "attendee_names",
        "converted_amount",
        "exchange_rate",
      ].includes(key) &&
      value !== null &&
      typeof value !== "string"
    )
      throw new ReviewError(
        "INVALID_FIELD",
        "Enter a valid " + key.replaceAll("_", " ") + ".",
      );
    if (
      key === "attendee_names" &&
      value !== null &&
      (!Array.isArray(value) || value.some((v) => typeof v !== "string"))
    )
      throw new ReviewError(
        "INVALID_ATTENDEES",
        "Attendee names must be a list of names.",
      );
    if (
      key === "trip_context" &&
      value !== null &&
      !["office", "business_trip", "other"].includes(String(value))
    )
      throw new ReviewError(
        "INVALID_CONTEXT",
        "Choose a valid business context.",
      );
    if (key === "original_currency" && updates.currency_confirmed !== true) {
      if (value !== expense.original_currency)
        delete confirmed.original_currency;
      continue;
    }
    confirmed[key] = {
      value,
      source: session.membership.role === "finance" ? "finance" : "employee",
      updated_by: session.id,
      updated_at: new Date().toISOString(),
    };
  }
  const revised = {
    ...expense,
    ...updates,
    confirmed_fields: confirmed,
  } as Expense;
  if (
    [
      "converted_currency",
      "exchange_rate",
      "exchange_rate_date",
      "exchange_rate_source",
    ].some((k) => k in updates)
  ) {
    if (
      typeof revised.original_amount !== "number" ||
      !Number.isFinite(revised.exchange_rate) ||
      !revised.exchange_rate ||
      revised.exchange_rate <= 0 ||
      !revised.exchange_rate_source?.trim() ||
      !/^\d{4}-\d{2}-\d{2}$/.test(revised.exchange_rate_date ?? "") ||
      !/^[A-Z]{3}$/.test(revised.converted_currency ?? "")
    )
      throw new ReviewError(
        "INVALID_CONVERSION",
        "Provide a positive rate, target ISO currency, rate date and a verifiable source.",
      );
    revised.converted_amount = new Decimal(revised.original_amount)
      .times(revised.exchange_rate)
      .toDecimalPlaces(4)
      .toNumber();
  }
  return revised;
}
export function evaluationRecord(
  context: ReviewContext,
  expense: Expense,
): Partial<Evaluation> {
  const policy = selectPolicyForDate(context.policies, expense.expense_date);
  const result = evaluateExpensePolicy({
    expense,
    activePolicyRules: policy?.structured_rules ?? [],
    applicablePolicy: policy,
    policyEffectiveDateChecked: true,
    spendingHistory: context.history,
    candidateDuplicates: context.history,
  });
  return {
    ...result,
    policy_version_id: policy?.id ?? null,
    evaluator_version: EVALUATOR_VERSION,
    inputs_snapshot: {
      merchant: expense.merchant,
      expense_date: expense.expense_date,
      original_amount: expense.original_amount,
      original_currency: expense.original_currency,
      category: expense.category,
      city: expense.city,
      trip_context: expense.trip_context,
      business_purpose: expense.business_purpose,
      client_name: expense.client_name,
      attendee_count: expense.attendee_count,
      converted_amount: expense.converted_amount,
      converted_currency: expense.converted_currency,
      exchange_rate: expense.exchange_rate,
      exchange_rate_date: expense.exchange_rate_date,
      exchange_rate_source: expense.exchange_rate_source,
      confirmed_currency: expense.confirmed_fields?.original_currency ?? null,
      policy_updated_at: policy?.updated_at,
      expense_version: expense.version,
      history_revision: context.revision,
    },
  };
}
/** Individual and bulk decisions run exactly the same revalidation and commit path. */
export async function executeReview(
  repository: ReviewRepository,
  session: UserSession,
  expenseId: string,
  input: ReviewCommand,
): Promise<CommitResult> {
  if (
    (input.note !== undefined && typeof input.note !== "string") ||
    (input.overrideReason !== undefined &&
      typeof input.overrideReason !== "string") ||
    (input.requestId !== undefined && typeof input.requestId !== "string") ||
    (input.expectedVersion !== undefined &&
      (!Number.isInteger(input.expectedVersion) || input.expectedVersion < 1))
  )
    throw new ReviewError(
      "INVALID_COMMAND",
      "The review details are invalid. Refresh and try again.",
    );
  const command = {
    ...input,
    requestId: input.requestId ?? randomUUID(),
    updates: input.updates ?? {},
  };
  if (command.requestId.length > 180)
    throw new ReviewError(
      "INVALID_REQUEST_ID",
      "The request identifier is invalid.",
    );
  for (let attempt = 0; attempt < 3; attempt++) {
    const context = await repository.load(
      session.company.id,
      expenseId,
      session.id,
    );
    const expense = context.expense;
    assertAuthorized(session, expense, command.action);
    const sameDecision =
      (command.action === "approve" && expense.review_status === "approved") ||
      (command.action === "reject" && expense.review_status === "rejected");
    if (sameDecision && Object.keys(command.updates).length === 0)
      return { expense, already_applied: true };
    if (
      ["approved", "rejected"].includes(expense.review_status) &&
      command.action !== "evaluate"
    )
      throw new ReviewError(
        "DECISION_ALREADY_RECORDED",
        "This decision is recorded. Historical claims cannot be edited.",
        409,
      );
    if (
      command.expectedVersion !== undefined &&
      command.expectedVersion !== expense.version
    )
      throw new ReviewError(
        "STALE_REVIEW",
        "This expense changed. Refresh and review the latest evidence.",
        409,
      );
    if (
      ["approve", "reject", "request", "evaluate"].includes(command.action) &&
      Object.keys(command.updates).length
    )
      throw new ReviewError(
        "DECISION_WITH_FIELD_CHANGES",
        "Save corrections and review the new findings before recording a decision.",
      );
    if (command.action === "save" && expense.review_status !== "draft")
      command.action = "submit";
    const revised = correctedExpense(expense, command.updates, session);
    if (
      [
        "converted_currency",
        "exchange_rate",
        "exchange_rate_date",
        "exchange_rate_source",
      ].some((k) => k in command.updates)
    )
      command.updates.converted_amount = revised.converted_amount;
    const evaluation =
      command.action === "save" && expense.review_status === "draft"
        ? null
        : evaluationRecord(context, revised);
    if (command.action === "approve") {
      if (
        !["submitted", "needs_review", "ready_for_approval"].includes(
          expense.review_status,
        )
      )
        throw new ReviewError(
          "INVALID_TRANSITION",
          "Resolve the employee clarification before approval.",
        );
      if (
        evaluation!.rule_results!.some(
          (r) => r.outcome === "unknown" && r.details.non_overridable === true,
        )
      )
        throw new ReviewError(
          "FINANCIAL_EVIDENCE_UNRESOLVED",
          "Amount, currency or conversion evidence is unresolved. Confirm it before approval.",
        );
      if (
        evaluation!.overall_outcome !== "pass" &&
        !command.overrideReason?.trim()
      )
        throw new ReviewError(
          "OVERRIDE_REASON_REQUIRED",
          "Current checks do not pass. A documented finance exception is required.",
        );
    }
    if (["reject", "request"].includes(command.action) && !command.note?.trim())
      throw new ReviewError(
        "REASON_REQUIRED",
        "Explain the decision so the employee knows what happens next.",
      );
    try {
      return await repository.commit({ session, context, command, evaluation });
    } catch (error) {
      if (
        error instanceof ReviewError &&
        error.code === "STALE_REVIEW" &&
        attempt < 2
      )
        continue;
      throw error;
    }
  }
  throw new ReviewError(
    "STALE_REVIEW",
    "The workspace is changing. Refresh the latest evidence and retry.",
    409,
  );
}
export async function executeBulkReview(
  repository: ReviewRepository,
  session: UserSession,
  ids: string[],
  versions: Record<string, number> = {},
  requestId = randomUUID(),
) {
  if (session.membership.role !== "finance")
    throw new ReviewError("FORBIDDEN", "Finance access is required.", 403);
  if (
    !ids.length ||
    ids.length > 100 ||
    ids.some((id) => typeof id !== "string")
  )
    throw new ReviewError("INVALID_IDS", "Select between 1 and 100 claims.");
  let approved = 0;
  let alreadyApplied = 0;
  const errors: { id: string; reason: string }[] = [];
  for (const id of [...new Set(ids)]) {
    try {
      const result = await executeReview(repository, session, id, {
        action: "approve",
        expectedVersion: versions[id],
        requestId: requestId + ":" + id,
      });
      if (result.already_applied) alreadyApplied++;
      else approved++;
    } catch (error) {
      errors.push({
        id,
        reason:
          error instanceof Error
            ? error.message
            : "This claim could not be approved.",
      });
    }
  }
  return {
    total_requested: ids.length,
    approved,
    already_applied: alreadyApplied,
    skipped: errors.length,
    errors,
  };
}
export function supabaseReviewRepository(
  client: SupabaseClient,
): ReviewRepository {
  const translate = (message: string) => {
    const code = [
      "FORBIDDEN",
      "STALE_REVIEW",
      "DECISION_ALREADY_RECORDED",
      "FINANCIAL_EVIDENCE_UNRESOLVED",
      "OVERRIDE_REASON_REQUIRED",
      "REASON_REQUIRED",
      "COMMAND_REUSED",
    ].find((c) => message.includes(c));
    if (code)
      return new ReviewError(
        code,
        code === "STALE_REVIEW"
          ? "The expense or its history changed. Review the latest evidence."
          : code.replaceAll("_", " ").toLowerCase() + ".",
        code === "FORBIDDEN" ? 403 : 409,
      );
    if (message.includes("claimlens_") || message.includes("schema cache"))
      return new ReviewError(
        "MIGRATION_REQUIRED",
        "Review safety checks are not installed. Apply the guarded-review migration before submitting or deciding claims.",
        503,
      );
    return new ReviewError(
      "REVIEW_UNAVAILABLE",
      "The review could not be recorded. No decision was confirmed. Retry after refreshing.",
      503,
    );
  };
  return {
    async load(companyId, expenseId, actorId) {
      const { data, error } = await client.rpc("claimlens_review_context", {
        p_company_id: companyId,
        p_expense_id: expenseId,
        p_actor_id: actorId,
      });
      if (error) throw translate(error.message);
      if (!data?.expense)
        throw new ReviewError("NOT_FOUND", "Expense not found.", 404);
      return data as ReviewContext;
    },
    async commit({ session, context, command, evaluation }) {
      const { data, error } = await client.rpc("claimlens_commit_review", {
        p_company_id: session.company.id,
        p_expense_id: context.expense.id,
        p_actor_id: session.id,
        p_revision: context.revision,
        p_expected_version: context.expense.version,
        p_action: command.action,
        p_updates: command.updates ?? {},
        p_evaluation: evaluation,
        p_note: command.note ?? null,
        p_override: command.overrideReason ?? null,
        p_request_id: command.requestId,
      });
      if (error) throw translate(error.message);
      return data as CommitResult;
    },
  };
}
