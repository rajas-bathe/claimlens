"use client";
import { AlertCircle, RotateCw } from "lucide-react";
export default function WorkspaceError({
  retry,
}: {
  error: unknown;
  retry: () => void;
}) {
  return (
    <section className="panel max-w-xl mx-auto my-12" role="alert">
      <AlertCircle size={27} className="text-amber-700 mb-5" />
      <p className="page-kicker">LET’S TRY THAT AGAIN</p>
      <h1>We couldn’t load this view.</h1>
      <p className="text-sm text-gray-500 mt-4 mb-6 leading-relaxed">
        Your saved receipts and decisions are still in your workspace. Try
        loading this page again.
      </p>
      <button className="button button-small" onClick={retry}>
        Try again <RotateCw size={15} />
      </button>
    </section>
  );
}
