import { Loader2 } from "lucide-react";
export default function WorkspaceLoading() {
  return (
    <div role="status" aria-label="Loading workspace" className="space-y-6">
      <p className="page-kicker flex items-center gap-2"><Loader2 size={16} className="animate-spin" /> LOADING YOUR WORKSPACE</p>
      <h1>Loading your workspace…</h1>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4" aria-hidden="true">
        {[1, 2, 3, 4].map((n) => (
          <div
            key={n}
            className="h-36 bg-gray-100 rounded-lg animate-pulse border border-gray-200"
          />
        ))}
      </div>
      <div
        className="h-64 bg-white rounded-lg border border-gray-200"
        aria-hidden="true"
      />
      <p className="text-sm text-gray-500">
        Your latest receipts and review details will appear here.
      </p>
    </div>
  );
}
