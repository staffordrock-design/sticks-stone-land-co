import React, { useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Mountain, Layers3, Crown, Users, UserRound } from "lucide-react";

const TABS = [
  { to: "/", label: "Quarries", icon: Mountain, match: (p) => p === "/" || p.startsWith("/listings") || p.startsWith("/mines") },
  { to: "/intelligence", label: "Intel", icon: Layers3, match: (p) => p.startsWith("/intelligence") || p.startsWith("/mineral-intelligence") || p.startsWith("/mineral-value-guide") || p.startsWith("/compare") || p.startsWith("/watchlist") || p.startsWith("/opportunities") || p.startsWith("/deal-investor") },
  { to: "/network", label: "Network", icon: Users, match: (p) => p.startsWith("/network") || p.startsWith("/messages") },
  { to: "/subscribe", label: "Access", icon: Crown, match: (p) => p.startsWith("/subscribe") },
  { to: "/profile", label: "Profile", icon: UserRound, match: (p) => p.startsWith("/profile") || p.startsWith("/buyer-profile") },
];

// Preserve each tab's last in-tab route and scroll position across tab switches.
const TAB_STATE_KEY = "ss-tab-state-v1";

function readTabState() {
  try { return JSON.parse(sessionStorage.getItem(TAB_STATE_KEY) || "{}"); } catch { return {}; }
}

function writeTabState(state) {
  try { sessionStorage.setItem(TAB_STATE_KEY, JSON.stringify(state)); } catch {}
}

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
    const state = readTabState();
    const currentTab = TABS.find((t) => t.match(pathname));
    if (currentTab) {
      state[currentTab.to] = { path: pathname, scroll: window.scrollY };
      writeTabState(state);
    }

    const isActive = tab.match(pathname);
    if (isActive && pathname === tab.to) {
      // Second tap on the active root behaves like a native tab bar: return to top.
      state[tab.to] = { path: tab.to, scroll: 0 };
      writeTabState(state);
      window.scrollTo({ top: 0, left: 0, behavior: "smooth" });
      return;
    }

    const saved = state[tab.to];
    const alwaysOpenRoot = tab.to === "/network" || tab.to === "/intelligence";
    const targetPath = alwaysOpenRoot ? tab.to : (saved?.path && tab.match(saved.path) ? saved.path : tab.to);
    pendingRestore.current = { path: targetPath, scroll: alwaysOpenRoot ? 0 : Number(saved?.scroll || 0) };
    navigate(targetPath);
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
            role="tab"
            aria-label={label}
            aria-selected={active}
            onClick={() => handleTab({ to, label, match })}
            className="relative flex min-h-[44px] flex-1 flex-col items-center justify-center gap-1 py-2"
          >
            {active && <span className="absolute top-0 h-1 w-10 rounded-b-full bg-slate-900" />}
            <Icon className={`h-5 w-5 transition-colors ${active ? "text-slate-900" : "text-muted-foreground"}`} />
            <span className={`text-xs font-semibold transition-colors ${active ? "text-slate-900" : "text-muted-foreground"}`}>{label}</span>
          </button>
        );
      })}
    </nav>
  );
}