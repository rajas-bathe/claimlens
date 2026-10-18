import type { SupabaseClient } from "@supabase/supabase-js";
import type { PolicyVersion, UserSession } from "@/types";
import { selectPolicyForDate } from "./selection";
import { executeReview, supabaseReviewRepository } from "@/lib/review/commands";
export { selectPolicyForDate } from "./selection";
export async function findApplicablePolicy(
  companyId: string,
  date: string | null | undefined,
  client: SupabaseClient,
): Promise<PolicyVersion | null> {
  const { data, error } = await client
    .from("policy_versions")
    .select("*")
    .eq("company_id", companyId)
    .in("status", ["active", "superseded"])
    .not("confirmed_at", "is", null)
    .order("version_number", { ascending: false });
  if (error)
    throw new Error(
      "Policy history could not be loaded. Retry before making a decision.",
    );
  return selectPolicyForDate((data ?? []) as PolicyVersion[], date);
}
export async function evaluateAndPersistExpense(args: {
  expenseId: string;
  actorId?: string | null;
  actorRole?: "employee" | "finance" | null;
  supabase: SupabaseClient;
}) {
  if (!args.actorId) throw new Error("UNAUTHORIZED");
  const { data: member, error } = await args.supabase
    .from("memberships")
    .select("*, companies(*)")
    .eq("user_id", args.actorId)
    .single();
  if (error || !member?.companies) throw new Error("UNAUTHORIZED");
  const session = {
    id: args.actorId,
    email: member.email ?? "",
    membership: member,
    company: member.companies,
  } as UserSession;
  const result = await executeReview(
    supabaseReviewRepository(args.supabase),
    session,
    args.expenseId,
    { action: "evaluate" },
  );
  if (!result.evaluation) throw new Error("The evaluation was not recorded.");
  return {
    evaluation: result.evaluation,
    evalResult: result.evaluation,
    nextStatus: result.expense.review_status,
  };
}
