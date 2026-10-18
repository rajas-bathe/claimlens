"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  LayoutDashboard,
  ClipboardList,
  FileText,
  Upload,
  ReceiptText,
  Plus,
  LogOut,
  ArrowUpRight,
  ShieldCheck,
  Menu,
  X,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { getInitials, cn } from "@/lib/utils";
import type { UserSession } from "@/types";
import { Brand } from "../shared/Brand";

const financeNav = [
  {
    label: "Overview",
    href: "/dashboard/finance/overview",
    icon: LayoutDashboard,
  },
  {
    label: "Review queue",
    href: "/dashboard/finance/review",
    icon: ClipboardList,
  },
  {
    label: "Company policy",
    href: "/dashboard/finance/policy",
    icon: FileText,
  },
  { label: "Batch import", href: "/dashboard/finance/batch", icon: Upload },
];

export function WorkspaceShell({
  children,
  session,
  finance = false,
}: {
  children: React.ReactNode;
  session: UserSession;
  finance?: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [error, setError] = useState("");
  const sidebar = useRef<HTMLElement>(null);
  const menuButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const trigger = menuButton.current;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const controls = () =>
      Array.from(
        sidebar.current?.querySelectorAll<HTMLElement>(
          "a, button:not(:disabled)",
        ) ?? [],
      ).filter((el) => el.getClientRects().length > 0);
    controls()[1]?.focus();
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        return;
      }
      if (event.key !== "Tab") return;
      const items = controls();
      const first = items[0];
      const last = items.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
      trigger?.focus();
    };
  }, [open]);
  const navigation = finance
    ? financeNav
    : [
        {
          label: "My expenses",
          href: "/dashboard/expenses",
          icon: ReceiptText,
        },
        { label: "New expense", href: "/dashboard/expenses/new", icon: Plus },
      ];
  const current = navigation.filter((n) => pathname.startsWith(n.href)).at(-1);
  const name = session.membership.display_name || session.email.split("@")[0];
  async function signOut() {
    setSigningOut(true);
    try {
      const { error } = await createClient().auth.signOut();
      if (error) throw error;
      router.push("/");
      router.refresh();
    } catch {
      setError("Could not sign out. Please try again.");
      setSigningOut(false);
    }
  }
  return (
    <div className="workspace">
      <a href="#main-content" className="skip-link">
        Skip to content
      </a>
      {open && (
        <button
          className="nav-backdrop"
          aria-label="Close navigation"
          onClick={() => setOpen(false)}
        />
      )}
      <aside
        ref={sidebar}
        id="workspace-navigation"
        className={cn("workspace-sidebar", open && "is-open")}
      >
        <div className="sidebar-brand">
          <Link href={navigation[0].href} aria-label="ClaimLens home">
            <Brand light />
          </Link>
          <button
            className="mobile-close"
            onClick={() => setOpen(false)}
            aria-label="Close navigation"
          >
            <X size={20} />
          </button>
        </div>
        <div className="workspace-company">
          <span className="company-initial">
            {getInitials(session.company.name)}
          </span>
          <div>
            <strong>{session.company.name}</strong>
            <span>{finance ? "Finance workspace" : "Employee workspace"}</span>
          </div>
        </div>
        <p className="nav-caption">WORKSPACE</p>
        <nav aria-label="Main navigation">
          {navigation.map(({ label, href, icon: Icon }) => {
            const active = current?.href === href;
            return (
              <Link
                key={href}
                href={href}
                onClick={() => setOpen(false)}
                aria-current={active ? "page" : undefined}
                className={cn("sidebar-link", active && "is-active")}
              >
                <Icon size={18} strokeWidth={1.7} />
                {label}
                {active && <span className="active-dot" />}
              </Link>
            );
          })}
        </nav>
        <div className="sidebar-note">
          <ShieldCheck size={22} />
          <p>
            Every expense.
            <br />
            <strong>A clearer picture.</strong>
          </p>
          <span>Evidence first. Confident decisions.</span>
        </div>
        <div className="sidebar-user">
          <span className="user-avatar">{getInitials(name)}</span>
          <div>
            <strong>{name}</strong>
            <span>{finance ? "Finance team" : "Employee"}</span>
          </div>
          <button
            onClick={signOut}
            disabled={signingOut}
            aria-label={signingOut ? "Signing out" : "Sign out"}
            title="Sign out"
          >
            <LogOut size={17} />
          </button>
        </div>
        {error && (
          <p className="sidebar-error" role="alert">
            {error}
          </p>
        )}
      </aside>
      <div className="workspace-body">
        <header className="workspace-topbar">
          <div className="flex items-center gap-3">
            <button
              ref={menuButton}
              className="mobile-menu"
              aria-label="Open navigation"
              aria-expanded={open}
              aria-controls="workspace-navigation"
              onClick={() => setOpen(true)}
            >
              <Menu size={21} />
            </button>
            <span className="topbar-context">
              {finance ? "Finance" : "Workspace"}
              <span>/</span>
              <strong>{current?.label ?? "Expense details"}</strong>
              {pathname.split("/").length > 4 &&
                current?.label === "Review queue" && <span>/ Review</span>}
            </span>
          </div>
          <Link
            href={
              finance ? "/dashboard/finance/review" : "/dashboard/expenses/new"
            }
            className="topbar-action"
          >
            {finance ? "Open review queue" : "New expense"}
            <ArrowUpRight size={15} />
          </Link>
        </header>
        <main id="main-content" className="workspace-content" tabIndex={-1}>
          {children}
        </main>
        <footer className="workspace-footer">
          <span>
            ClaimLens <span> / </span> {session.company.name}
          </span>
          <span>Clarity at every step.</span>
        </footer>
      </div>
    </div>
  );
}
