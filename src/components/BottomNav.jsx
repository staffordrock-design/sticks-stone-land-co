import React, { useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Store, Bookmark, Tag, User } from "lucide-react";

const TABS = [
  { to: "/", label: "Marketplace", icon: Store, match: (p) => p === "/" || p.startsWith("/listings") || p.startsWith("/mines") },
  { to: "/saved", label: "Saved", icon: Bookmark, match: (p) => p.startsWith("/saved") },
  { to: "/sell", label: "Sell", icon: Tag, match: (p) => p.startsWith("/sell") || p.startsWith("/seller-portal") },
  { to: "/buyer-profile", label: "Profile", icon: User, match: (p) => p.startsWith("/buyer-profile") },
];

// Per-tab scroll positions, preserved across tab switches.
const scrollStore = {};

export default function BottomNav() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const pendingRestore = useRef(null);

  // Restore saved scroll after a BottomNav-initiated tab switch (runs after ScrollToTop resets).
  useEffect(() => {
    if (!pendingRestore.current) return;
    const { path, scroll } = pendingRestore.current;
    pendingRestore.current = null;
    if (pathname === path) {
      requestAnimationFrame(() =>
        requestAnimationFrame(() => window.scrollTo({ top: scroll, left: 0, behavior: "instant" }))
      );
    }
  }, [pathname]);

  const handleTab = (tab) => {
    const currentTab = TABS.find((t) => t.match(pathname));
    if (currentTab) scrollStore[currentTab.to] = window.scrollY;
    const isActive = tab.match(pathname);
    if (isActive && pathname === tab.to) {
      // Already at the tab root — scroll to top.
      window.scrollTo({ top: 0, left: 0, behavior: "smooth" });
      return;
    }
    // Switch to the tab root (or pop to root if active but deep in the stack).
    pendingRestore.current = { path: tab.to, scroll: scrollStore[tab.to] ?? 0 };
    navigate(tab.to);
  };

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-50 flex border-t border-border bg-card/95 shadow-[0_-4px_20px_rgba(15,23,42,0.10)] backdrop-blur lg:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom, 16px)" }}
    >
      {TABS.map(({ to, label, icon: Icon, match }) => {
        const active = match(pathname);
        return (
          <button
            key={to}
            onClick={() => handleTab({ to, label, match })}
            className="relative flex min-h-[56px] flex-1 flex-col items-center justify-center gap-1 py-2"
          >
            {active && <span className="absolute top-0 h-1 w-10 rounded-b-full bg-slate-900" />}
            <Icon className={`h-5 w-5 transition-colors ${active ? "text-slate-900" : "text-muted-foreground"}`} />
            <span className={`text-[11px] font-semibold transition-colors ${active ? "text-slate-900" : "text-muted-foreground"}`}>{label}</span>
          </button>
        );
      })}
    </nav>
  );
}