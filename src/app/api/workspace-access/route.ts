import { NextResponse } from "next/server";
import { getSession } from "@/lib/supabase/auth";
export async function GET() {
  const session = await getSession();
  if (!session)
    return NextResponse.json(
      {
        error:
          "Your account is not assigned to a company workspace. Ask your company administrator to assign your employee or finance membership; registering alone does not grant access.",
      },
      { status: 403 },
    );
  return NextResponse.json(
    { role: session.membership.role, company: session.company.name },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
