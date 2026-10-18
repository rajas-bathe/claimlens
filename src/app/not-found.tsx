import Link from "next/link";
import { ArrowLeft, ScanLine } from "lucide-react";
export default function NotFound() {
  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <div className="panel max-w-md w-full">
        <ScanLine size={32} className="text-blue-600 mb-6" />
        <p className="page-kicker">OUT OF THE PICTURE · 404</p>
        <h1 className="text-3xl">This page isn’t available.</h1>
        <p className="text-sm text-gray-500 leading-relaxed my-5">
          The link may have changed, or this expense may not be available in
          your workspace.
        </p>
        <Link href="/dashboard" className="button button-small">
          <ArrowLeft size={16} /> Back to workspace
        </Link>
      </div>
    </main>
  );
}
