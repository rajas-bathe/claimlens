"use client";

import type { PolicyVersion, UserSession } from "@/types";
import { formatDate, formatDateTime, cn } from "@/lib/utils";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  FileText,
  Loader2,
  Upload,
  ShieldCheck,
} from "lucide-react";

export function PolicyWorkspace({
  versions,
  session,
}: {
  versions: PolicyVersion[];
  session: UserSession;
}) {
  const [effectiveFrom, setEffectiveFrom] = useState(
    new Date().toISOString().slice(0, 10),
  );
  const router = useRouter();
  const activeVersion = versions.find((v) => v.status === "active");
  const [isActivating, startActivating] = useTransition();
  const [activationMsg, setActivationMsg] = useState<string | null>(null);

  async function handleActivate(versionId: string) {
    setActivationMsg(null);
    startActivating(async () => {
      try {
        const res = await fetch("/api/policy/activate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            policy_version_id: versionId,
            effective_from: effectiveFrom,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Activation failed");
        setActivationMsg(
          "Policy activated successfully. All future and reevaluated expenses will use this policy version.",
        );
        router.refresh();
      } catch (err) {
        setActivationMsg(
          `Error: ${err instanceof Error ? err.message : "Failed to activate"}`,
        );
      }
    });
  }

  return (
    <div className="space-y-6">
      <p className="workflow-hint">
        Workspace currency: INR (₹). Reports and reimbursements use verified INR
        values. Original policy quotations retain their source currency; use the
        INR sample when preparing new limits.
      </p>
      {/* Active policy card */}
      {activeVersion ? (
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-green-600" />
                <h2 className="font-semibold text-gray-900">
                  Active Policy — Version {activeVersion.version_number}
                </h2>
              </div>
              <p className="text-xs text-gray-400 mt-1">
                Effective from {formatDate(activeVersion.effective_from)} ·
                Confirmed {formatDateTime(activeVersion.confirmed_at)}
              </p>
            </div>
            <span className="px-2.5 py-1 bg-green-50 text-green-700 border border-green-200 text-xs font-semibold rounded">
              Active
            </span>
          </div>
          <div className="p-5 space-y-4">
            {activeVersion.structured_rules && (
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-3">
                  Company rules ({activeVersion.structured_rules.length})
                </p>
                <div className="space-y-2">
                  {activeVersion.structured_rules.map((rule) => (
                    <div
                      key={rule.id}
                      className="p-3 bg-gray-50 border border-gray-200 rounded-md"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <span className="font-medium text-gray-900 text-sm">
                            {{
                              minimum_amount: "Minimum claim amount",
                              submission_deadline: "Submission deadline",
                              daily_cap: "Daily allowance",
                              category_cap: "Category allowance",
                              city_cap: "City allowance",
                              per_expense_cap: "Per-claim allowance",
                              prohibited_item: "Restricted purchases",
                              approval_threshold: "Approval threshold",
                              required_field: "Required details",
                              itemization_requirement: "Itemized receipt",
                              currency_restriction: "Allowed currencies",
                              client_entertainment_requirement:
                                "Client meal details",
                              trip_context_override: "Travel context",
                            }[rule.type] ?? rule.type.replace(/_/g, " ")}
                          </span>
                          {rule.source_clause && (
                            <span className="text-xs text-gray-500 ml-2 font-mono">
                              [{rule.source_clause}]
                            </span>
                          )}
                        </div>
                        <span
                          className={cn(
                            "text-xs px-1.5 py-0.5 rounded font-medium",
                            {
                              "bg-red-50 text-red-700":
                                rule.outcome === "block",
                              "bg-amber-50 text-amber-700":
                                rule.outcome === "flag" ||
                                rule.outcome === "require_approval",
                              "bg-blue-50 text-blue-700":
                                rule.outcome === "require_field",
                              "bg-gray-100 text-gray-600":
                                rule.outcome === "info_only",
                            },
                          )}
                        >
                          {
                            {
                              block: "Policy limit",
                              flag: "Review required",
                              require_approval: "Approval required",
                              require_field: "Details required",
                              info_only: "Information",
                            }[rule.outcome]
                          }
                        </span>
                      </div>
                      {rule.supporting_text && (
                        <details className="policy-source">
                          <summary>View source clause</summary>
                          <p className="text-xs text-gray-600 mt-1">
                            &ldquo;{rule.supporting_text}&rdquo;
                          </p>
                        </details>
                      )}
                      <div className="mt-2 text-xs text-gray-500 flex flex-wrap gap-2">
                        {rule.type === "submission_deadline" && (
                          <span className="bg-white border px-1.5 py-0.5 rounded">
                            Within {rule.deadline_days ?? "unspecified"}{" "}
                            calendar days · first submission · UTC
                          </span>
                        )}
                        {rule.limit !== null && rule.limit !== undefined && (
                          <span className="bg-white border px-1.5 py-0.5 rounded">
                            Limit: {rule.limit}{" "}
                            {rule.limit_currency ?? "Currency unspecified"} ·{" "}
                            {rule.aggregation_scope?.replace(/_/g, " ") ??
                              "per expense"}
                          </span>
                        )}
                        {rule.categories && rule.categories.length > 0 && (
                          <span className="bg-white border px-1.5 py-0.5 rounded">
                            Categories: {rule.categories.join(", ")}
                          </span>
                        )}
                        {rule.cities && rule.cities.length > 0 && (
                          <span className="bg-white border px-1.5 py-0.5 rounded">
                            Cities: {rule.cities.join(", ")}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {activeVersion.unsupported_clauses &&
              activeVersion.unsupported_clauses.length > 0 && (
                <div className="p-4 bg-amber-50/70 border border-amber-200/80 rounded-lg">
                  <div className="flex items-center gap-2 mb-3">
                    <FileText className="w-4 h-4 text-amber-700" />
                    <p className="text-sm font-semibold text-amber-900">
                      Reviewer Guidelines ({activeVersion.unsupported_clauses.length})
                    </p>
                  </div>
                  <div className="space-y-2">
                    {activeVersion.unsupported_clauses.map((clause, idx) => (
                      <div
                        key={idx}
                        className="policy-clause-evidence p-2.5 rounded border text-xs"
                      >
                        <p className="font-semibold text-gray-900">
                          {clause.clause_id}: {clause.reason}
                        </p>
                        <p className="text-gray-600 italic mt-0.5">
                          &ldquo;{clause.source_text}&rdquo;
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
          </div>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-lg p-8 text-center">
          <FileText className="w-10 h-10 text-gray-300 mx-auto mb-3" />
          <p className="font-medium text-gray-900">No active policy</p>
          <p className="text-sm text-gray-500 mt-1">
            Structure a policy below and confirm to activate it.
          </p>
        </div>
      )}

      {/* Upload & Structure Form */}
      <UploadPolicyForm
        session={session}
        nextVersion={(versions[0]?.version_number ?? 0) + 1}
        onActivate={handleActivate}
        isActivating={isActivating}
      />

      {activationMsg && (
        <div
          role="status"
          className={cn(
            "p-4 rounded-md text-sm border",
            activationMsg.startsWith("Error")
              ? "bg-red-50 border-red-200 text-red-700"
              : "bg-green-50 border-green-200 text-green-700",
          )}
        >
          {activationMsg}
        </div>
      )}

      <div className="workflow-hint">
        <label
          htmlFor="policy-effective-date"
          className="block font-medium mb-2"
        >
          Effective date for the next policy activation
        </label>
        <input
          id="policy-effective-date"
          type="date"
          value={effectiveFrom}
          onChange={(e) => setEffectiveFrom(e.target.value)}
          className="border rounded bg-white px-3 py-2"
        />
        <p className="mt-2">
          Choose the date this policy actually started. Historical approvals are
          preserved. Conflicting version dates must be reviewed before
          activation.
        </p>
      </div>
      {/* Version history */}
      {versions.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <h2 className="font-medium text-gray-900">
              Policy Version History
            </h2>
          </div>
          <div className="divide-y divide-gray-100">
            {versions.map((v) => (
              <div
                key={v.id}
                className="px-5 py-4 flex flex-wrap items-start justify-between gap-4"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-gray-900">
                      Version {v.version_number}
                    </span>
                    <span
                      className={cn(
                        "px-2 py-0.5 rounded border text-xs font-medium",
                        {
                          "bg-green-50 text-green-700 border-green-200":
                            v.status === "active",
                          "bg-blue-50 text-blue-700 border-blue-200":
                            v.status === "proposed",
                          "bg-gray-100 text-gray-600 border-gray-200":
                            v.status === "draft" ||
                            v.status === "superseded" ||
                            v.status === "archived",
                        },
                      )}
                    >
                      {v.status}
                    </span>
                  </div>
                  <p className="text-xs text-gray-400 mt-0.5">
                    Created {formatDateTime(v.created_at)}
                    {v.structured_rules &&
                      ` · ${v.structured_rules.length} rules`}
                  </p>
                  <details className="mt-3 text-xs text-gray-600 max-w-2xl">
                    <summary className="min-h-8">
                      Review rules & original policy
                    </summary>
                    <div className="mt-3 space-y-3">
                      {v.structured_rules?.map((rule) => (
                        <div
                          key={rule.id}
                          className="border-l-2 border-gray-200 pl-3"
                        >
                          <p className="font-medium capitalize">
                            {rule.type.replace(/_/g, " ")} ·{" "}
                            {rule.source_clause}
                          </p>
                          <p className="mt-1 leading-relaxed">
                            {rule.supporting_text}
                          </p>
                          {rule.limit != null && (
                            <p className="mt-1">
                              Limit: {rule.limit}{" "}
                              {rule.limit_currency || "Currency not specified"}
                            </p>
                          )}
                        </div>
                      ))}
                      {v.unsupported_clauses?.map((clause, index) => (
                        <p
                          key={index}
                          className="text-amber-800 leading-relaxed"
                        >
                          Manual review · {clause.clause_id}: {clause.reason}
                        </p>
                      ))}
                      {v.source_document && (
                        <details className="pt-2">
                          <summary>Original policy text</summary>
                          <p className="whitespace-pre-wrap leading-relaxed mt-3">
                            {v.source_document}
                          </p>
                        </details>
                      )}
                    </div>
                  </details>
                </div>
                {v.status === "proposed" && (
                  <button
                    type="button"
                    onClick={() => handleActivate(v.id)}
                    disabled={isActivating}
                    className="px-3 py-1.5 bg-blue-600 text-white text-xs font-medium rounded hover:bg-blue-700 disabled:opacity-60 flex items-center gap-1.5"
                  >
                    {isActivating && (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    )}
                    Confirm & Activate
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function UploadPolicyForm({
  session: _,
  nextVersion,
  onActivate: __,
  isActivating: ___,
}: {
  session: UserSession;
  nextVersion: number;
  onActivate: (id: string) => Promise<void>;
  isActivating: boolean;
}) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleStructure(e: React.FormEvent, manualReview = false) {
    e.preventDefault();
    setError(null);
    setResult(null);
    startTransition(async () => {
      try {
        const res = await fetch("/api/policy/structure", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            source_document: text,
            manual_review: manualReview,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Structuring failed");
        setResult(
          `Policy Version ${nextVersion} proposed with ${data.data.rule_count} structured rules and ${data.data.unsupported_count} reviewer guideline(s). Review and confirm to activate.`,
        );
        // Preserve the source text until the reviewer deliberately replaces it.
        window.location.reload();
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to structure policy",
        );
      }
    });
  }

  function loadSamplePolicy() {
    setText(SAMPLE_POLICY_TEXT);
  }

  return (
    <div className="bg-white border border-gray-200 rounded-lg">
      <div className="px-5 py-4 border-b border-gray-100 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="font-medium text-gray-900">Prepare a new policy</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            Paste your policy to prepare reviewable rules. Confirm the proposed
            version before it takes effect.
          </p>
        </div>
        <button
          type="button"
          onClick={loadSamplePolicy}
          className="text-xs text-blue-600 hover:text-blue-700 font-medium border border-blue-200 rounded px-2.5 py-1 hover:bg-blue-50"
        >
          Use sample text
        </button>
      </div>
      <form onSubmit={(e) => handleStructure(e)} className="p-5 space-y-4">
        <textarea
          aria-label="Company expense policy text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={8}
          className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent resize-none font-mono text-gray-800"
          placeholder="Paste company expense policy text here..."
        />
        {error && (
          <div
            role="alert"
            className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2"
          >
            {error}
          </div>
        )}
        {result && (
          <div className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-md px-3 py-2">
            {result}
          </div>
        )}
        <div className="flex flex-wrap justify-end gap-3">
          <button
            type="button"
            disabled={isPending || !text.trim()}
            onClick={(e) => handleStructure(e, true)}
            className="px-4 py-2 text-sm text-gray-700 border border-gray-300 rounded-md disabled:opacity-50"
          >
            Save for manual review
          </button>
          <button
            type="submit"
            disabled={isPending || !text.trim()}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 disabled:opacity-60"
          >
            {isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Upload className="w-4 h-4" />
            )}
            Prepare rules for review
          </button>
        </div>
      </form>
    </div>
  );
}

const SAMPLE_POLICY_TEXT = `COMPANY EXPENSE POLICY - CLAUSE BREAKDOWN

1. GENERAL COMPLIANCE & RECEIPT INTEGRITY
1.1 Every submitted expense must include a readable original receipt, date, merchant, and total.
1.2 Itemized receipts are mandatory for all hotel accommodations and any meal claim over INR 1,000.
1.3 Discrepancies between printed totals and line item sums must be explained prior to reimbursement.

2. MEALS & SUBSISTENCE LIMITS
2.1 Routine office meals are capped at INR 500.00 per person per day.
2.2 Business trip meals (outside home city) are capped at INR 1,500.00 per person per day.
2.3 Tier 1 High-Cost Cities (Mumbai, Delhi, Bengaluru): Business trip meal cap is elevated to INR 2,000.00 per person per day.
2.4 Combined daily meal claims across multiple receipts cannot exceed the applicable daily cap.

3. CLIENT ENTERTAINMENT
3.1 Client entertainment requires recording the verified Client Name and Total Number of Attendees.
3.2 Client meals are capped at INR 2,000.00 per attendee.
3.3 Any single client entertainment expense exceeding INR 10,000.00 triggers an Executive Approval threshold.

4. TRAVEL & LODGING
4.1 Hotel lodging is capped at INR 5,000.00 per night standard, or INR 7,500.00 per night in Tier 1 high-cost cities.
4.2 Business class airfare is prohibited on domestic flights under 6 hours.

5. PROHIBITED EXPENSES
5.1 Personal items, tobacco, gambling, minibar consumables, and personal entertainment are non-reimbursable.
5.2 Alcohol is only reimbursable during verified client entertainment meals, up to INR 600.00 per attendee.

6. CURRENCY CONVERSION
6.1 Reimbursement and reporting use INR only. Foreign receipts retain their original currency and require a positive dated exchange rate from a verifiable bank, card or company source before reimbursement. Unsupported or ambiguous currency symbols prevent automatic processing.`;
