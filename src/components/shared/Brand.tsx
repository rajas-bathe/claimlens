import { ScanLine } from "lucide-react";

export function Brand({ light = false }: { light?: boolean }) {
  return (
    <span className={`brand${light ? " brand-light" : ""}`}>
      <span className="brand-symbol">
        <ScanLine size={22} strokeWidth={1.7} />
      </span>
      <span>
        Claim<span className="brand-lens">Lens</span>
        <span className="brand-dot">.</span>
      </span>
    </span>
  );
}
