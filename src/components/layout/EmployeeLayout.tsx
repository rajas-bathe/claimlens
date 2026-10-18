import type { UserSession } from "@/types";
import { WorkspaceShell } from "./WorkspaceShell";
export function EmployeeLayout({
  children,
  session,
}: {
  children: React.ReactNode;
  session: UserSession;
}) {
  return <WorkspaceShell session={session}>{children}</WorkspaceShell>;
}
