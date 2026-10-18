import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { FinanceOverviewDashboard } from "../src/components/finance/FinanceOverviewDashboard";
import type { Expense, UserSession } from "../src/types";

// Rendering fixtures are test-only. Application routes continue to use Supabase data.
const session = { company: { name: "Test workspace" } } as UserSession;
const render = (expenses: Expense[]) =>
  renderToStaticMarkup(
    createElement(FinanceOverviewDashboard, {
      expenses,
      evaluations: [],
      memberships: [],
      policyVersions: [],
      session,
    }),
  );
const claim = (overrides: Partial<Expense> = {}) =>
  ({
    id: "claim-1",
    created_at: "2026-10-17T12:00:00Z",
    original_amount: 48,
    original_currency: "INR",
    review_status: "submitted",
    ...overrides,
  }) as Expense;

test("Empty overview has an intentional no-submissions state and no fabricated policy", () => {
  const html = render([]);
  assert.match(html, /No submissions in this period/);
  assert.match(html, /No active company policy/);
  assert.doesNotMatch(html, /2026-01-01|Compliance Rate/);
});

test("Single-date dataset plots a visible full-height bar with an accessible count", () => {
  const html = render([claim()]);
  assert.match(html, /class="submission-chart"/);
  assert.match(html, /height:100%/);
  assert.match(html, /aria-label="[^"]*: 1 claims"/);
  assert.match(html, /Counts include drafts/);
});

test("INR overview excludes unconverted foreign approvals and does not imply payment", () => {
  const html = render([
    claim({ review_status: "approved" }),
    claim({
      id: "claim-2",
      review_status: "approved",
      original_amount: 20,
      original_currency: "EUR",
    }),
  ]);
  assert.match(html, /48\.00/);
  assert.match(html, /unresolved/);
  assert.doesNotMatch(html, /68\.00/);
  assert.match(html, /Payment is not tracked here/);
});
