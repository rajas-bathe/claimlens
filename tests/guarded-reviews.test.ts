import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  executeReview,
  executeBulkReview,
  supabaseReviewRepository,
} from "../src/lib/review/commands";
import type { UserSession, PolicyRule } from "../src/types";

const company = "11111111-1111-4111-8111-111111111111";
const financeId = "22222222-2222-4222-8222-222222222222";
const employeeId = "33333333-3333-4333-8333-333333333333";
const policyId = "44444444-4444-4444-8444-444444444444";
const claimA = "55555555-5555-4555-8555-555555555555";
const claimB = "66666666-6666-4666-8666-666666666666";
const finance = {
  id: financeId,
  company: { id: company },
  membership: { role: "finance", company_id: company },
} as UserSession;
const employee = {
  id: employeeId,
  company: { id: company },
  membership: { role: "employee", company_id: company },
} as UserSession;
const rule: PolicyRule = {
  id: "daily",
  type: "daily_cap",
  source_clause: "Meals",
  supporting_text: "Office meals are capped at $25 INR per employee per day.",
  limit: 25,
  limit_currency: "INR",
  aggregation_scope: "daily",
  conditions: [],
  exceptions: [],
  required_field: null,
  prohibited_values: null,
  outcome: "block",
  categories: ["Business meals"],
  cities: null,
  trip_contexts: ["office"],
};

test('Foreign approval requires sourced INR conversion even with a finance exception',async()=>{
  const {db,repository,add}=await setup();
  await add(claimA,10,'draft');
  await db.query("UPDATE expenses SET original_currency='USD',category='Ground transport' WHERE id=$1",[claimA]);
  const submitted=await executeReview(repository,employee,claimA,{action:'submit'});
  assert.equal(submitted.evaluation?.reimbursable_currency,'INR');
  assert.equal(submitted.evaluation?.reimbursable_amount,null);
  assert.ok(submitted.evaluation?.rule_results?.some(r=>r.rule_id==='reimbursement_currency_inr' && r.outcome==='unknown' && r.details.non_overridable===true));
  await assert.rejects(()=>executeReview(repository,finance,claimA,{action:'approve',overrideReason:'Synthetic attempted exception'}),/clarification|Critical receipt evidence/);
  const converted=await executeReview(repository,employee,claimA,{action:'submit',updates:{converted_currency:'INR',exchange_rate:85,exchange_rate_date:'2026-10-12',exchange_rate_source:'Synthetic test bank rate, not a current market quote'}});
  assert.equal(converted.evaluation?.reimbursable_amount,850);
  const approved=await executeReview(repository,finance,claimA,{action:'approve'});
  assert.equal(approved.expense.review_status,'approved');
  assert.equal(approved.evaluation?.reimbursable_currency,'INR');
  await db.close();
});

test("Draft checks do not submit a claim, and first submission time survives a correction", async () => {
  const { db, repository, add } = await setup();
  await add(claimA, 10, "draft");
  const checked = await executeReview(repository, employee, claimA, {
    action: "evaluate",
  });
  assert.equal(checked.expense.review_status, "draft");
  assert.equal(checked.expense.first_submitted_at, null);
  const submitted = await executeReview(repository, employee, claimA, {
    action: "submit",
  });
  assert.ok(submitted.expense.first_submitted_at);
  const revised = await executeReview(repository, employee, claimA, {
    action: "submit",
    updates: { business_purpose: "Corrected purpose" },
  });
  assert.equal(
    revised.expense.first_submitted_at,
    submitted.expense.first_submitted_at,
  );
  await db.close();
});

test("Uncertain image evidence blocks approval until explicit human confirmation persists", async () => {
  const { db, repository, add } = await setup();
  await add();
  const quality = {
    checked_at: "2026-10-18T00:00:00Z",
    status: "checked",
    width: 100,
    height: 100,
    metrics: null,
    issues: [
      {
        kind: "blur",
        source: "pixel_heuristic",
        message: "Synthetic blur signal",
      },
    ],
    note: "Synthetic test",
  };
  await db.query("UPDATE expenses SET capture_quality=$2 WHERE id=$1", [
    claimA,
    JSON.stringify(quality),
  ]);
  await assert.rejects(
    () =>
      executeReview(repository, finance, claimA, {
        action: "approve",
        overrideReason: "Attempted exception",
      }),
    /Critical receipt evidence/,
  );
  const confirmed = await executeReview(repository, employee, claimA, {
    action: "submit",
    updates: { evidence_verified: true },
  });
  assert.equal(
    confirmed.expense.confirmed_fields.critical_evidence?.updated_by,
    employeeId,
  );
  const decision = await executeReview(repository, finance, claimA, {
    action: "approve",
  });
  assert.equal(decision.expense.review_status, "approved");
  await db.close();
});

test("Independent OCR is saved atomically with audit, rejects stale writes and invalidates confirmation", async () => {
  const { db, repository, add } = await setup();
  await add(claimA, 10, "draft");
  const confirmed = await executeReview(repository, employee, claimA, {
    action: "save",
    updates: { evidence_verified: true },
  });
  const ocr = {
    checked_at: "2026-10-18T00:00:00Z",
    engine: "tesseract-eng",
    confidence: 50,
    text: "unclear",
    words: [],
    note: "Synthetic test",
  };
  const quality = {
    checked_at: "2026-10-18T00:00:00Z",
    status: "checked",
    issues: [],
    note: "Synthetic",
  };
  const args = [
    claimA,
    company,
    employeeId,
    confirmed.expense.version,
    JSON.stringify(ocr),
    JSON.stringify(quality),
  ];
  await db.query("SELECT claimlens_store_ocr($1,$2,$3,$4,$5,$6)", args);
  await assert.rejects(
    () => db.query("SELECT claimlens_store_ocr($1,$2,$3,$4,$5,$6)", args),
    /STALE_REVIEW/,
  );
  const reevaluated = await executeReview(repository, employee, claimA, {
    action: "evaluate",
  });
  assert.equal(reevaluated.expense.review_status, "draft");
  assert.ok(
    reevaluated.evaluation?.rule_results?.some(
      (r) =>
        r.rule_id === "critical_evidence_verification" &&
        r.outcome === "unknown" &&
        r.details.non_overridable === true,
    ),
  );
  const events = await db.query<{ count: number }>(
    "SELECT count(*)::int AS count FROM review_events WHERE note LIKE 'Independent OCR%'",
  );
  assert.equal(events.rows[0].count, 1);
  await db.close();
});

test("Finance cannot approve their own claim, and direct authenticated financial writes are denied", async () => {
  const { db, repository, add } = await setup();
  await add();
  await db.query("UPDATE expenses SET employee_id=$2 WHERE id=$1", [
    claimA,
    financeId,
  ]);
  await assert.rejects(
    () => executeReview(repository, finance, claimA, { action: "approve" }),
    /different finance reviewer/,
  );
  await db.exec("SET ROLE authenticated");
  try {
    await assert.rejects(
      () =>
        db.query("UPDATE expenses SET review_status='approved' WHERE id=$1", [
          claimA,
        ]),
      /permission denied/,
    );
  } finally {
    await db.exec("RESET ROLE");
  }
  await db.close();
});
let sharedDb: PGlite | null = null;
async function getSharedDb() {
  if (!sharedDb) {
    const db = new PGlite();
    await db.exec(
      "CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY); CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;",
    );
    const initial = await readFile(
      new URL(
        "../supabase/migrations/20261018000001_initial_schema.sql",
        import.meta.url,
      ),
      "utf8",
    );
    await db.exec(
      initial.replace(/CREATE EXTENSION IF NOT EXISTS [^;]+;/g, ""),
    );
    await db.exec(
      await readFile(
        new URL(
          "../supabase/migrations/20261018000004_guarded_reviews.sql",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    await db.exec(
      await readFile(
        new URL(
          "../supabase/migrations/20261018000005_evidence_and_workflow.sql",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    await db.query("INSERT INTO auth.users(id) VALUES($1),($2)", [
      financeId,
      employeeId,
    ]);
    await db.query("INSERT INTO companies(id,name,slug) VALUES($1,$2,$3)", [
      company,
      "Integration test company",
      "integration-test",
    ]);
    await db.query(
      "INSERT INTO memberships(user_id,company_id,role) VALUES($1,$3,'finance'),($2,$3,'employee')",
      [financeId, employeeId, company],
    );
    await db.query(
      "INSERT INTO policy_versions(id,company_id,version_number,status,structured_rules,effective_from,confirmed_by,confirmed_at) VALUES($1,$2,1,'active',$3,'2026-01-01',$4,now())",
      [policyId, company, JSON.stringify([rule]), financeId],
    );
    sharedDb = db;
  }
  // Reset role and clear mutable test tables before each test
  await sharedDb.exec(
    "RESET ROLE; DELETE FROM claimlens_review_commands; DELETE FROM review_events; DELETE FROM evaluations; DELETE FROM expenses;",
  );
  return sharedDb;
}

async function setup() {
  const db = await getSharedDb();
  const safeDb = {
    ...db,
    query: db.query.bind(db),
    exec: db.exec.bind(db),
    close: async () => {}, // No-op to preserve shared instance across tests
  };
  const rpc = async (name: string, args: Record<string, unknown>) => {
    const entries = Object.entries(args);
    const parameters = entries
      .map(([key], i) => key + " => $" + (i + 1))
      .join(",");
    try {
      const result = await db.query<{ value: unknown }>(
        "SELECT public." + name + "(" + parameters + ") AS value",
        entries.map(([, v]) =>
          v !== null && typeof v === "object" ? JSON.stringify(v) : v,
        ),
      );
      return { data: result.rows[0]?.value, error: null };
    } catch (error) {
      return {
        data: null,
        error: {
          message: error instanceof Error ? error.message : String(error),
        },
      };
    }
  };
  const repository = supabaseReviewRepository({
    rpc,
  } as unknown as SupabaseClient);
  async function add(id = claimA, amount = 10, status = "ready_for_approval") {
    await db.query(
      "INSERT INTO expenses(id,company_id,employee_id,merchant,expense_date,original_amount,original_currency,category,trip_context,review_status,processing_status) VALUES($1,$2,$3,$4,'2026-10-12',$5,'INR','Business meals','office',$6,'extracted')",
      [id, company, employeeId, "Receipt " + id.slice(0, 2), amount, status],
    );
  }
  return { db: safeDb, repository, add };
}

test("A documented conversion persists through the production correction and reevaluation transaction", async () => {
  const { db, repository, add } = await setup();
  try {
    await add(claimA, 10, "draft");
    await db.query("UPDATE expenses SET original_currency='EUR' WHERE id=$1", [
      claimA,
    ]);
    const result = await executeReview(repository, employee, claimA, {
      action: "submit",
      updates: {
        converted_currency: "INR",
        exchange_rate: 1.1,
        exchange_rate_date: "2026-10-12",
        exchange_rate_source: "Synthetic test treasury rate",
      },
    });
    assert.equal(Number(result.expense.converted_amount), 11);
    assert.equal(
      result.expense.exchange_rate_source,
      "Synthetic test treasury rate",
    );
    assert.equal(result.evaluation?.overall_outcome, "pass");
    const stored = await db.query<{
      converted_amount: string;
      exchange_rate_date: string;
    }>(
      "SELECT converted_amount,exchange_rate_date::text FROM expenses WHERE id=$1",
      [claimA],
    );
    assert.equal(Number(stored.rows[0].converted_amount), 11);
    assert.equal(stored.rows[0].exchange_rate_date, "2026-10-12");
  } finally {
    await db.close();
  }
});

test("Production individual review persists current evaluation, decision and audit together; repeat approval is idempotent", async () => {
  const { db, repository, add } = await setup();
  try {
    await add();
    const first = await executeReview(repository, finance, claimA, {
      action: "approve",
      expectedVersion: 1,
      requestId: "single-approve",
    });
    assert.equal(first.expense.review_status, "approved");
    assert.equal(first.evaluation?.evaluator_version, "3.1.0");
    const second = await executeReview(repository, finance, claimA, {
      action: "approve",
      expectedVersion: 1,
      requestId: "single-approve",
    });
    assert.equal(second.already_applied, true);
    const events = await db.query<{ count: number }>(
      "SELECT count(*)::int AS count FROM review_events WHERE event_type='approved'",
    );
    assert.equal(events.rows[0].count, 1);
  } finally {
    await db.close();
  }
});
test("Production bulk path approves two eligible same-day claims without double-counting its batch tally", async () => {
  const { db, repository, add } = await setup();
  try {
    await add(claimA, 12);
    await add(claimB, 12);
    const result = await executeBulkReview(repository, finance, [
      claimA,
      claimB,
    ]);
    assert.equal(result.approved, 2);
    assert.deepEqual(result.errors, []);
    const rows = await db.query<{ review_status: string }>(
      "SELECT review_status FROM expenses",
    );
    assert.ok(rows.rows.every((r) => r.review_status === "approved"));
  } finally {
    await db.close();
  }
});
test("Competing approval requests produce one decision and do not duplicate audit history", async () => {
  const { db, repository, add } = await setup();
  try {
    await add();
    const results = await Promise.all([
      executeReview(repository, finance, claimA, {
        action: "approve",
        requestId: "race-a",
      }),
      executeReview(repository, finance, claimA, {
        action: "approve",
        requestId: "race-b",
      }),
    ]);
    assert.equal(results.filter((r) => !r.already_applied).length, 1);
    const events = await db.query<{ count: number }>(
      "SELECT count(*)::int AS count FROM review_events WHERE event_type='approved'",
    );
    assert.equal(events.rows[0].count, 1);
  } finally {
    await db.close();
  }
});
test("History arriving between evaluation and commit forces revalidation and prevents stale approval", async () => {
  const { db, repository, add } = await setup();
  try {
    await add(claimA, 20);
    let changed = false;
    const racing = {
      ...repository,
      commit: async (input: Parameters<typeof repository.commit>[0]) => {
        if (!changed) {
          changed = true;
          await add(claimB, 10, "approved");
        }
        return repository.commit(input);
      },
    };
    await assert.rejects(
      executeReview(racing, finance, claimA, {
        action: "approve",
        requestId: "history-race",
      }),
      /documented finance exception/,
    );
    const row = await db.query<{ review_status: string }>(
      "SELECT review_status FROM expenses WHERE id=$1",
      [claimA],
    );
    assert.equal(row.rows[0].review_status, "ready_for_approval");
  } finally {
    await db.close();
  }
});
test("Audit insertion failure rolls back the expense update and evaluation in the real database function", async () => {
  const { db, repository, add } = await setup();
  try {
    await add();
    await db.exec(
      "ALTER TABLE review_events ADD CONSTRAINT reject_test_note CHECK(note IS DISTINCT FROM 'FAIL_AUDIT')",
    );
    await assert.rejects(
      executeReview(repository, finance, claimA, {
        action: "approve",
        note: "FAIL_AUDIT",
      }),
    );
    const row = await db.query<{ review_status: string }>(
      "SELECT review_status FROM expenses WHERE id=$1",
      [claimA],
    );
    assert.equal(row.rows[0].review_status, "ready_for_approval");
    const count = await db.query<{ count: number }>(
      "SELECT count(*)::int AS count FROM evaluations",
    );
    assert.equal(count.rows[0].count, 0);
  } finally {
    await db.close();
  }
});
test("Employee and unauthenticated database role cannot invoke finance decisions", async () => {
  const { db, repository, add } = await setup();
  try {
    await add();
    await assert.rejects(
      executeReview(repository, employee, claimA, { action: "approve" }),
      /permission/,
    );
    await db.exec("SET ROLE authenticated");
    await assert.rejects(
      db.query("SELECT claimlens_review_context($1,$2,$3)", [
        company,
        claimA,
        employeeId,
      ]),
      /permission denied/,
    );
  } finally {
    await db.close();
  }
});
test("An unchanged inferred currency is not confirmed by simply submitting the form; explicit confirmation persists", async () => {
  const { db, repository, add } = await setup();
  try {
    await add(claimA, 10, "draft");
    await db.query("UPDATE expenses SET extraction_raw=$1 WHERE id=$2", [
      JSON.stringify({
        currency_is_inferred: true,
        normalized_currency: { value: "INR", source: "derived" },
        printed_currency: { value: "$" },
      }),
      claimA,
    ]);
    const unconfirmed = await executeReview(repository, employee, claimA, {
      action: "submit",
      updates: { original_currency: "INR" },
    });
    assert.equal(unconfirmed.evaluation?.overall_outcome, "unknown");
    await assert.rejects(
      executeReview(repository, finance, claimA, {
        action: "approve",
        overrideReason: "Override",
      }),
      /clarification|unresolved/,
    );
    const confirmed = await executeReview(repository, employee, claimA, {
      action: "submit",
      updates: { original_currency: "INR", currency_confirmed: true },
    });
    assert.equal(confirmed.evaluation?.overall_outcome, "pass");
    assert.equal(
      confirmed.expense.confirmed_fields.original_currency?.source,
      "employee",
    );
    assert.equal(
      confirmed.expense.confirmed_fields.original_currency?.updated_by,
      employeeId,
    );
  } finally {
    await db.close();
  }
});
