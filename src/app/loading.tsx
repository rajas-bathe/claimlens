import { Loader2 } from "lucide-react";
export default function Loading() {
  return (
    <div className="initial-loader" role="status">
      <span className="loading-mark">
        <Loader2 size={30} className="animate-spin" />
      </span>
      <strong>
        Getting the picture<span className="accent-text">.</span>
      </strong>
      <p>Loading your workspace…</p>
    </div>
  );
}
