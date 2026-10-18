import { NextRequest, NextResponse } from "next/server";
import { requireFinanceSession } from "@/lib/supabase/auth";
import { createServiceClient } from "@/lib/supabase/server";
import { ruleSupportIssue } from "@/lib/policy/engine";
import type { PolicyRule } from "@/types";
export async function POST(req: NextRequest) {
  try {
    const session = await requireFinanceSession();
    const body = await req.json();
    const client = createServiceClient();
    const { data: policy, error: fetchError } = await client
      .from("policy_versions")
      .select("*")
      .eq("id", body.policy_version_id)
      .eq("company_id", session.company.id)
      .single();
    if (fetchError || !policy)
      return NextResponse.json(
        { success: false, error: "Policy version not found." },
        { status: 404 },
      );
    if (
      ((policy.structured_rules as PolicyRule[]) ?? []).some((r) =>
        ruleSupportIssue(r),
      )
    )
      return NextResponse.json(
        {
          success: false,
          error:
            "Some rules need a supported interpretation before activation. Save them as manual clauses instead.",
        },
        { status: 422 },
      );
    if (
      ((policy.structured_rules as PolicyRule[]) ?? []).some(
        (r) =>
          (r.limit_currency && r.limit_currency !== "INR") ||
          r.exceptions?.some(
            (e) =>
              e.override?.limit_currency && e.override.limit_currency !== "INR",
          ),
      )
    )
      return NextResponse.json(
        {
          success: false,
          error:
            "New monetary policy limits must be stated in INR. Review and prepare an INR policy; source amounts are never automatically relabelled.",
        },
        { status: 422 },
      );
    const date = body.effective_from ?? new Date().toISOString().slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date))
      return NextResponse.json(
        { success: false, error: "Choose a valid policy effective date." },
        { status: 400 },
      );
    const { data, error } = await client.rpc("claimlens_activate_policy", {
      p_company_id: session.company.id,
      p_policy_id: policy.id,
      p_actor_id: session.id,
      p_effective_from: date,
    });
    if (error)
      return NextResponse.json(
        {
          success: false,
          error: error.message.includes("claimlens_")
            ? "Install the guarded-review migration before activating a policy."
            : error.message,
        },
        { status: 409 },
      );
    return NextResponse.json({
      success: true,
      data: {
        activated_id: data.id,
        version_number: data.version_number,
        status: data.status,
        effective_from: data.effective_from,
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Activation failed.";
    return NextResponse.json(
      { success: false, error: message },
      {
        status:
          message === "UNAUTHORIZED"
            ? 401
            : message === "FORBIDDEN"
              ? 403
              : 500,
      },
    );
  }
}
