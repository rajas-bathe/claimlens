import type { PolicyVersion } from "@/types";
export function selectPolicyForDate(
  policies: PolicyVersion[],
  date: string | null | undefined,
): PolicyVersion | null {
  if (!date) return null;
  return (
    [...policies]
      .filter(
        (p) =>
          (p.status === "active" || p.status === "superseded") &&
          p.confirmed_at &&
          (!p.effective_from || p.effective_from <= date) &&
          (!p.effective_to || date <= p.effective_to),
      )
      .sort((a, b) => b.version_number - a.version_number)[0] ?? null
  );
}
