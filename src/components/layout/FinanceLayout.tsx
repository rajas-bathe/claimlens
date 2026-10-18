import type { UserSession } from "@/types";
import { WorkspaceShell } from "./WorkspaceShell";
export function FinanceLayout({
  children,
  session,
}: {
  children: React.ReactNode;
  session: UserSession;
}) {
  return (
    <WorkspaceShell session={session} finance>
      {children}
    </WorkspaceShell>
  );
}
