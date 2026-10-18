"use client";
import { useState } from "react";
import {
  Download,
  FileBarChart2,
  ArrowUpRight,
  Loader2,
  Printer,
  CalendarDays,
  CheckCircle2,
} from "lucide-react";
import type { ExpenseReport } from "@/lib/reports/model";
import { REPORT_STATUSES, reportCsv } from "@/lib/reports/model";
import { formatCurrency, snakeToTitle } from "@/lib/utils";

export function ReportsWorkspace() {
  const [today] = useState(() => new Date().toISOString().slice(0, 10));
  const [from, setFrom] = useState(today.slice(0, 7) + "-01");
  const [to, setTo] = useState(today);
  const [status, setStatus] = useState("all");
  const [report, setReport] = useState<ExpenseReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const stale = Boolean(
    report &&
    (from !== report.filters.from ||
      to !== report.filters.to ||
      status !== report.filters.status),
  );
  async function generate(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      const response = await fetch(
        "/api/reports?" + new URLSearchParams({ from, to, status }),
        { cache: "no-store" },
      );
      if (
        response.redirected ||
        !response.headers.get("content-type")?.includes("application/json")
      ) {
        throw new Error(
          "Your session may have expired. Sign in again, then generate your report.",
        );
      }
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error || "Unable to generate report.");
      setReport(data.report);
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Unable to generate report.",
      );
    } finally {
      setLoading(false);
    }
  }
  function download() {
    if (!report) return;
    const url = URL.createObjectURL(
      new Blob([reportCsv(report)], { type: "text/csv;charset=utf-8" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = `claimlens-${report.filters.from}-to-${report.filters.to}.csv`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <div className="reports-page">
      <div className="page-heading">
        <div>
          <p className="page-kicker">THE BIG PICTURE, READY TO SHARE</p>
          <h1>
            Make it a report<span className="accent-text">.</span>
          </h1>
          <p>A clear expense summary. The details to back it up.</p>
        </div>
        <span className="section-icon">
          <FileBarChart2 size={28} />
        </span>
      </div>
      <form className="report-controls panel" onSubmit={generate}>
        <label>
          From
          <input
            required
            type="date"
            value={from}
            max={to}
            onChange={(e) => setFrom(e.target.value)}
          />
        </label>
        <label>
          To
          <input
            required
            type="date"
            value={to}
            min={from}
            onChange={(e) => setTo(e.target.value)}
          />
        </label>
        <label>
          Status
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="all">All statuses</option>
            {REPORT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {snakeToTitle(s)}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" disabled={loading} className="button">
          {loading ? (
            <Loader2 className="animate-spin" size={16} />
          ) : (
            <ArrowUpRight size={16} />
          )}
          {loading ? "Building report…" : "Generate report"}
        </button>
      </form>
      <p className="report-basis">
        Based on expense date. Claims without a date are excluded. Your access
        determines which claims appear.
      </p>
      {error && (
        <p className="workflow-hint" role="alert">
          {error}
        </p>
      )}
      {loading && (
        <p role="status" className="report-progress">
          <Loader2 size={16} className="animate-spin" /> Gathering your claims
          and calculating the summary…
        </p>
      )}
      {stale && (
        <p className="workflow-hint" role="status">
          Filters changed. Generate again to update the report.
        </p>
      )}
      {!report && !loading && (
        <section className="report-empty panel">
          <div className="report-orbit">
            <FileBarChart2 size={42} strokeWidth={1.3} />
          </div>
          <p className="page-kicker">FROM CLAIMS TO CLARITY</p>
          <h2>Your next overview starts here.</h2>
          <p>
            Choose a period to build a report, download a spreadsheet,
            <br />
            or save a clean PDF using your browser’s print dialog.
          </p>
          <div>
            <span>
              <CalendarDays size={15} /> Flexible date range
            </span>
            <span>
              <CheckCircle2 size={15} /> INR totals with conversion evidence
            </span>
          </div>
        </section>
      )}
      {report && (
        <section
          className="report-document"
          aria-label="Generated expense report"
          aria-busy={loading}
        >
          <div className="report-document-head">
            <div>
              <p className="page-kicker">CLAIMLENS / EXPENSE REPORT</p>
              <h2>{report.company}</h2>
              <p>
                {report.scope} · {report.filters.from} — {report.filters.to} ·{" "}
                {snakeToTitle(report.filters.status)}
              </p>
              <small>
                Generated {new Date(report.generatedAt).toLocaleString()}
              </small>
            </div>
            <div className="report-actions">
              <button
                className="button button-secondary"
                onClick={download}
                disabled={stale || loading}
              >
                <Download size={15} /> CSV
              </button>
              <button
                className="button"
                onClick={() => window.print()}
                disabled={stale || loading}
              >
                <Printer size={15} /> Print / PDF
              </button>
            </div>
          </div>
          <div className="report-stat-grid">
            <div>
              <span>Claims</span>
              <strong>{report.rows.length}</strong>
            </div>
            <div>
              <span>Approved</span>
              <strong>{report.approved}</strong>
            </div>
            <div>
              <span>Awaiting a decision or details</span>
              <strong>{report.awaiting}</strong>
            </div>
          </div>
          <div className="report-totals">
            <p className="page-kicker">CONFIRMED CLAIM VALUE · INR</p>
            {report.totals.length ? (
              report.totals.map((t) => (
                <strong key={t.currency}>
                  {formatCurrency(t.amount, t.currency)}{" "}
                  <small>{t.currency}</small>
                </strong>
              ))
            ) : (
              <p>No confirmed amounts to total.</p>
            )}
            <p>
              {report.unresolved} {report.unresolved === 1 ? "claim" : "claims"}{" "}
              excluded from totals because amount or INR conversion is
              unresolved. Totals are claim values, not payments or approved
              reimbursement amounts.
            </p>
          </div>
          <div className="report-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Merchant / employee</th>
                  <th>Date</th>
                  <th>Category</th>
                  <th>Status</th>
                  <th className="amount-cell">INR value / original evidence</th>
                </tr>
              </thead>
              <tbody>
                {report.rows.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <strong>{row.merchant}</strong>
                      <small>{row.employee}</small>
                    </td>
                    <td>{row.date}</td>
                    <td>{row.category}</td>
                    <td>{snakeToTitle(row.status)}</td>
                    <td className="amount-cell">
                      <strong>
                        {formatCurrency(
                          row.amount ?? row.originalAmount ?? 0,
                          "INR",
                        )}
                      </strong>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!report.rows.length && (
              <p className="empty-message">
                No claims match this period and status.
              </p>
            )}
          </div>
          <p className="report-footnote">
            Approval does not indicate payment. This report reflects the records
            available at generation time.
          </p>
        </section>
      )}
    </div>
  );
}
