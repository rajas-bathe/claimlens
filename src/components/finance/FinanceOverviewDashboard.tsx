"use client";

import { useState } from "react";
import Link from "next/link";
import type {
  Expense,
  Evaluation,
  Membership,
  UserSession,
  PolicyVersion,
  ReviewStatus,
} from "@/types";
import { formatCurrency, formatDate } from "@/lib/utils";
import { currencyTotals, membershipLookup } from "@/lib/presentation";
import {
  ArrowRight,
  ArrowUpRight,
  Clock,
  CircleCheck,
  MessageCircle,
  ReceiptText,
  ShieldCheck,
} from "lucide-react";

interface Props {
  expenses: Expense[];
  evaluations: Evaluation[];
  memberships: Membership[];
  policyVersions: PolicyVersion[];
  session: UserSession;
}
function Totals({ expenses }: { expenses: Expense[] }) {
  const { totals, missing } = currencyTotals(expenses);
  return (
    <>
      <div className="currency-totals">
        {totals.length ? (
          totals.map(([code, amount]) => (
            <span key={code}>
              {formatCurrency(amount, code)} <small>{code}</small>
            </span>
          ))
        ) : (
          <span>—</span>
        )}
      </div>
      {missing > 0 && (
        <p className="metric-note">
          {missing} {missing === 1 ? "claim has" : "claims have"} an unresolved
          amount or currency
        </p>
      )}
    </>
  );
}
const statuses: { status: ReviewStatus; label: string; color: string }[] = [
  {
    status: "ready_for_approval",
    label: "Ready for approval",
    color: "#59805a",
  },
  { status: "needs_review", label: "Finance review", color: "#9b8bb4" },
  { status: "submitted", label: "Submitted", color: "#9bae77" },
  {
    status: "needs_information",
    label: "Clarification needed",
    color: "#c7a350",
  },
  { status: "approved", label: "Approved", color: "#345d3e" },
  { status: "rejected", label: "Rejected", color: "#b7796b" },
  { status: "draft", label: "Draft", color: "#bdc6b1" },
];

export function FinanceOverviewDashboard({
  expenses,
  evaluations,
  memberships,
  policyVersions,
  session,
}: Props) {
  const [range, setRange] = useState<"all" | "30d" | "7d">("all");
  const [now] = useState(() => Date.now());
  const filtered = expenses.filter((e) => {
    if (range === "all") return true;
    const age = (now - new Date(e.created_at).getTime()) / 86400000;
    return age >= 0 && age <= (range === "7d" ? 7 : 30);
  });
  const pending = filtered.filter((e) =>
    ["submitted", "needs_review"].includes(e.review_status),
  );
  const ready = filtered.filter(
    (e) => e.review_status === "ready_for_approval",
  );
  const info = filtered.filter((e) => e.review_status === "needs_information");
  const approved = filtered.filter((e) => e.review_status === "approved");
  const members = membershipLookup(memberships);
  const active = policyVersions.find((p) => p.status === "active");
  const buckets = new Map<string, number>();
  for (const expense of filtered) {
    const date = expense.created_at?.slice(0, 10);
    if (date) buckets.set(date, (buckets.get(date) ?? 0) + 1);
  }
  const dates = [...buckets.keys()].sort().slice(-8);
  const max = Math.max(1, ...dates.map((d) => buckets.get(d)!));
  const latest = new Map<string, Evaluation>();
  for (const evaluation of evaluations) {
    const previous = latest.get(evaluation.expense_id);
    if (!previous || evaluation.evaluated_at > previous.evaluated_at)
      latest.set(evaluation.expense_id, evaluation);
  }
  const findings = new Map<string, Set<string>>();
  for (const expense of filtered) {
    const evaluation = latest.get(expense.id);
    if (!evaluation) continue;
    for (const rule of evaluation.rule_results) {
      if (!["fail", "unknown"].includes(rule.outcome)) continue;
      const label =
        rule.outcome === "unknown"
          ? "Checks needing clarification"
          : rule.rule_type?.replace(/_/g, " ") || "Policy issues";
      if (!findings.has(label)) findings.set(label, new Set());
      findings.get(label)!.add(expense.id);
    }
    if (evaluation.duplicate_findings?.length) {
      if (!findings.has("Potential duplicate receipts"))
        findings.set("Potential duplicate receipts", new Set());
      findings.get("Potential duplicate receipts")!.add(expense.id);
    }
  }
  const drivers = [...findings]
    .map(([label, ids]) => ({ label, count: ids.size }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);
  const priority = [...pending, ...info].slice(0, 5);
  return (
    <div>
      <div className="page-heading">
        <div>
          <p className="page-kicker">THE BIG PICTURE</p>
          <h1>Finance overview</h1>
          <p>
            A clearer view of what’s moving, and what needs you.
            <br />
            {session.company.name} · {filtered.length} claims in this view
          </p>
        </div>
        <div className="range-controls" aria-label="Submission date range">
          {(["all", "30d", "7d"] as const).map((r) => (
            <button
              key={r}
              aria-pressed={range === r}
              onClick={() => setRange(r)}
            >
              {r === "all"
                ? "All time"
                : r === "30d"
                  ? "Last 30 days"
                  : "Last 7 days"}
            </button>
          ))}
        </div>
      </div>
      <div className="metric-grid" aria-live="polite">
        <div className="metric metric-featured">
          <div className="metric-label">
            Awaiting review <Clock />
          </div>
          <div className="metric-value">{pending.length}</div>
          <p className="metric-note">Submitted or awaiting finance review</p>
          <Link href="/dashboard/finance/review">
            Review claims <ArrowRight size={13} />
          </Link>
        </div>
        <div className="metric">
          <div className="metric-label">
            Ready for approval <CircleCheck />
          </div>
          <div className="metric-value">{ready.length}</div>
          <p className="metric-note">
            Checks complete. Decision still required.
          </p>
          <Link href="/dashboard/finance/review">
            Open review queue <ArrowRight size={13} />
          </Link>
        </div>
        <div className="metric">
          <div className="metric-label">
            Clarification needed <MessageCircle />
          </div>
          <div className="metric-value">{info.length}</div>
          <p className="metric-note">Waiting for more detail from employees</p>
        </div>
        <div className="metric">
          <div className="metric-label">
            Approved claim value <ShieldCheck />
          </div>
          <div className="metric-value">
            <Totals expenses={approved} />
          </div>
          <p className="metric-note">
            {approved.length} approved · Payment is not tracked here.
          </p>
        </div>
      </div>
      <div className="dashboard-grid">
        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>Receipts coming in</h2>
              <p>
                Claim count by submission date. Each bar is one recorded day.
              </p>
            </div>
            <ReceiptText size={18} className="text-gray-400" />
          </div>
          {dates.length ? (
            <>
              <div className="chart-meta">
                <span>Claims · scale 0–{max}</span>
                <span>
                  Last {dates.length} recorded{" "}
                  {dates.length === 1 ? "day" : "days"}
                </span>
              </div>
              <div
                className="submission-chart"
                role="group"
                aria-label="Claims by submission date"
              >
                {dates.map((date) => (
                  <div key={date} className="chart-column">
                    <button
                      className="chart-bar"
                      style={{ height: (buckets.get(date)! / max) * 100 + "%" }}
                      aria-label={
                        formatDate(date) + ": " + buckets.get(date) + " claims"
                      }
                    >
                      <span>{buckets.get(date)}</span>
                      <span className="chart-tooltip">
                        {formatDate(date)} · {buckets.get(date)}{" "}
                        {buckets.get(date) === 1 ? "claim" : "claims"}
                      </span>
                    </button>
                  </div>
                ))}
              </div>
              <div className="chart-labels">
                {dates.map((date) => (
                  <span key={date}>{formatDate(date, "short")}</span>
                ))}
              </div>
              <p className="chart-caption">
                {formatDate(dates[0])} – {formatDate(dates.at(-1))}. Dates
                without recorded submissions are omitted. Counts include drafts.
              </p>
            </>
          ) : (
            <div className="empty-message">
              <ReceiptText size={28} />
              No submissions in this period.
              <br />
              Try a wider date range.
            </div>
          )}
          <div className="mt-5 pt-4 border-t border-gray-100">
            <p className="metric-note mb-2">
              Original claim value · currencies shown separately
            </p>
            <Totals expenses={filtered} />
          </div>
        </section>
        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>Where things stand</h2>
              <p>Every claim in this date range, by current status.</p>
            </div>
          </div>
          {statuses.map(({ status, label, color }) => (
            <div className="status-row" key={status}>
              <span>
                <i className="status-dot" style={{ background: color }} />
                {label}
              </span>
              <strong>
                {filtered.filter((e) => e.review_status === status).length}
              </strong>
            </div>
          ))}
          <div className="policy-summary">
            {active ? (
              <>
                <Link href="/dashboard/finance/policy">
                  <ShieldCheck size={13} /> Company policy · v
                  {active.version_number}
                </Link>
                <p>
                  Effective {formatDate(active.effective_from)} ·{" "}
                  {active.structured_rules?.length ?? 0} configured rules
                </p>
              </>
            ) : (
              <>
                <p>No active company policy.</p>
                <Link href="/dashboard/finance/policy">
                  Review policy setup <ArrowUpRight size={13} />
                </Link>
              </>
            )}
          </div>
        </section>
      </div>
      <div className="dashboard-grid">
        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>Next on your list</h2>
              <p>Recent claims awaiting review or clarification.</p>
            </div>
            <Link href="/dashboard/finance/review">View queue ↗</Link>
          </div>
          {priority.length ? (
            priority.map((e) => {
              const member = members.get(e.employee_id);
              return (
                <div className="queue-preview-row" key={e.id}>
                  <div className="min-w-0">
                    <strong className="truncate">
                      {e.merchant || "Merchant not provided"}
                    </strong>
                    <p>
                      {member?.display_name ||
                        member?.email ||
                        "Employee details unavailable"}{" "}
                      · {formatDate(e.expense_date)}
                    </p>
                  </div>
                  <Link
                    href={"/dashboard/finance/review/" + e.id}
                    aria-label={"Review " + (e.merchant || "expense")}
                  >
                    <span className="whitespace-nowrap">
                      {e.original_currency
                        ? formatCurrency(e.original_amount, e.original_currency)
                        : "Currency needed"}
                    </span>
                    <ArrowUpRight size={15} />
                  </Link>
                </div>
              );
            })
          ) : (
            <div className="empty-message">
              <CircleCheck size={28} />
              Nothing awaiting attention in this view.
            </div>
          )}
        </section>
        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>What needs a closer look</h2>
              <p>
                Claims with findings in their latest recorded evaluation.
                <br />
                One claim can appear in more than one group.
              </p>
            </div>
          </div>
          {drivers.length ? (
            <div className="finding-list">
              {drivers.map(({ label, count }) => (
                <div key={label}>
                  <div className="finding-label">
                    <span className="capitalize">{label}</span>
                    <strong>
                      {count} {count === 1 ? "claim" : "claims"}
                    </strong>
                  </div>
                  <div className="finding-track">
                    <div
                      style={{ width: (count / drivers[0].count) * 100 + "%" }}
                    />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty-message">
              <ShieldCheck size={28} />
              No findings in recorded evaluations.
              <br />
              Unevaluated claims still need their checks.
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
