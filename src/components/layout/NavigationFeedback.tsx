"use client";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

/** Show feedback on click, before a server response or loading boundary arrives. */
export function NavigationFeedback() {
  const pathname = usePathname();
  const [navigation, setNavigation] = useState<{
    from: string;
    to: string;
  } | null>(null);
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    function start(event: MouseEvent) {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      )
        return;
      const anchor = (event.target as Element).closest?.(
        "a[href]",
      ) as HTMLAnchorElement | null;
      if (
        !anchor ||
        anchor.target === "_blank" ||
        anchor.hasAttribute("download")
      )
        return;
      const destination = new URL(anchor.href, window.location.href);
      if (
        destination.origin !== window.location.origin ||
        destination.pathname === window.location.pathname
      )
        return;
      setSlow(false);
      setNavigation({
        from: window.location.pathname,
        to: destination.pathname,
      });
    }
    document.addEventListener("click", start, true);
    return () => document.removeEventListener("click", start, true);
  }, []);
  const active = navigation?.from === pathname && navigation.to !== pathname;
  useEffect(() => {
    if (!active) return;
    const timeout = setTimeout(() => setSlow(true), 9000);
    return () => clearTimeout(timeout);
  }, [active, navigation]);
  if (!active) return null;
  return (
    <div className="navigation-feedback" role="status" aria-live="polite">
      <div className="navigation-progress" />
      <span>
        <Loader2 size={15} className="animate-spin" />
        {slow
          ? "Still loading. Your connection may be slow…"
          : "Opening workspace…"}
      </span>
      {slow && (
        <button
          onClick={() => {
            window.location.assign(navigation!.to);
          }}
        >
          Retry
        </button>
      )}
    </div>
  );
}
