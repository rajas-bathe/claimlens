import { LoginForm } from "@/components/auth/LoginForm";
import { Brand } from "@/components/shared/Brand";
import Link from "next/link";
import { ArrowLeft, ShieldCheck, ScanLine } from "lucide-react";
import type { Metadata } from "next";
export const metadata: Metadata = { title: "Sign in" };
export const dynamic = "force-dynamic";
export default function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  return (
    <div className="login-page">
      <aside className="login-story">
        <Link href="/" aria-label="ClaimLens home">
          <Brand light />
        </Link>
        <div className="login-message">
          <span className="login-lens">
            <ScanLine size={64} strokeWidth={1} />
          </span>
          <p className="eyebrow">A LITTLE CLARITY GOES A LONG WAY</p>
          <h2>
            Welcome to
            <br />a clearer
            <br />
            <em>working day.</em>
          </h2>
          <p>
            Receipts in order. Policy in perspective.
            <br />
            Your next step, in focus.
          </p>
        </div>
        <span className="login-assurance">
          <ShieldCheck size={17} /> Evidence first. Confident decisions.
        </span>
      </aside>
      <main className="login-main">
        <Link className="login-back" href="/">
          <ArrowLeft size={16} /> Back to home
        </Link>
        <div className="login-form-wrap">
          <div className="login-mobile-brand">
            <Brand />
          </div>
          <p className="eyebrow">YOUR CLAIMLENS WORKSPACE</p>
          <LoginForm searchParams={searchParams} />
          <p className="login-note">
            <ShieldCheck size={15} /> Access is based on your company
            membership.
          </p>
        </div>
        <p className="login-bottom">Every expense. A clearer picture.</p>
      </main>
    </div>
  );
}
