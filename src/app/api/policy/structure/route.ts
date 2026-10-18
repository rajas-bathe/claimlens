import { NextRequest, NextResponse } from "next/server";
import { requireFinanceSession } from "@/lib/supabase/auth";
import { createServiceClient } from "@/lib/supabase/server";
import {
  PolicyParsingError,
  structurePolicyDocument,
} from "@/lib/gemini/policy";

// POST /api/policy/structure
// Converts policy text into proposed structured rules
export async function POST(req: NextRequest) {
  try {
    const session = await requireFinanceSession();
    const body = await req.json();
    const { source_document, manual_review } = body;

    if (
      !source_document ||
      typeof source_document !== "string" ||
      source_document.trim().length === 0
    ) {
      return NextResponse.json(
        { success: false, error: "Policy source document text is required" },
        { status: 400 },
      );
    }

    const supabase = createServiceClient();

    // Call AI policy orchestrator (Primary Gemini -> Backup Groq)
    const { structurePolicyDocumentWithFallback } = await import(
      "@/lib/gemini/policy"
    );

    let structured;
    let providerInfo = {
      provider: "manual",
      model: "manual",
      attempts: 1,
      fallbackUsed: false,
    };

    if (manual_review === true) {
      structured = {
        structured_rules: [],
        unsupported_clauses: [
          {
            clause_id: "Manual policy review",
            source_text: source_document,
            reason:
              "The original policy is saved for manual finance interpretation. No automatic rules have been asserted.",
          },
        ],
      };
    } else {
      const result =
        await structurePolicyDocumentWithFallback(source_document);
      structured = result.output;
      providerInfo = {
        provider: result.provider,
        model: result.model,
        attempts: result.attempts,
        fallbackUsed: result.fallbackUsed,
      };
    }

    // Get latest version number
    const { data: latest } = await supabase
      .from("policy_versions")
      .select("version_number")
      .eq("company_id", session.company.id)
      .order("version_number", { ascending: false })
      .limit(1)
      .single();

    const nextVersion = (latest?.version_number ?? 0) + 1;

    // Save as proposed version (requires explicit confirmation before activation)
    const { data: savedVersion, error: saveError } = await supabase
      .from("policy_versions")
      .insert({
        company_id: session.company.id,
        version_number: nextVersion,
        status: "proposed",
        source_document,
        structured_rules: structured.structured_rules,
        unsupported_clauses: structured.unsupported_clauses,
        created_by: session.id,
      })
      .select()
      .single();

    if (saveError || !savedVersion) {
      return NextResponse.json(
        {
          success: false,
          error: saveError?.message ?? "Failed to save policy version",
        },
        { status: 500 },
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        version_id: savedVersion.id,
        version_number: nextVersion,
        rule_count: structured.structured_rules.length,
        unsupported_count: structured.unsupported_clauses.length,
        rules: structured.structured_rules,
        unsupported: structured.unsupported_clauses,
        provider: providerInfo.provider,
        model: providerInfo.model,
        fallback_used: providerInfo.fallbackUsed,
      },
    });
  } catch (err) {
    if (err instanceof PolicyParsingError)
      return NextResponse.json(
        { success: false, error: err.message, code: err.code },
        { status: err.code === "PARSER_UNAVAILABLE" ? 503 : 422 },
      );
    const msg = err instanceof Error ? err.message : "Internal error";
    if (msg === "UNAUTHORIZED")
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 },
      );
    if (msg === "FORBIDDEN")
      return NextResponse.json(
        { success: false, error: "Finance permission required" },
        { status: 403 },
      );
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
