import React from "react";
import { Link, useLocation } from "react-router-dom";
import { Store, Bookmark, Tag, User } from "lucide-react";

const TABS = [
  {
    to: "/",
    label: "Marketplace",
    icon: Store,
    match: (p) => p === "/" || p.startsWith("/listings") || p.startsWith("/mines"),
  },
  { to: "/saved", label: "Saved", icon: Bookmark, match: (p) => p.startsWith("/saved") },
  { to: "/sell", label: "Sell", icon: Tag, match: (p) => p.startsWith("/sell") },
  { to: "/buyer-profile", label: "Profile", icon: User, match: (p) => p.startsWith("/buyer-profile") },
];

export default function BottomNav() {
  const { pathname } = useLocation();
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-50 flex border-t border-border bg-card/95 shadow-[0_-4px_20px_rgba(15,23,42,0.10)] backdrop-blur lg:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom, 16px)" }}
    >
      {TABS.map(({ to, label, icon: Icon, match }) => {
        const active = match(pathname);
        return (
          <Link
            key={to}
            to={to}
            className="relative flex min-h-[56px] flex-1 flex-col items-center justify-center gap-1 py-2"
          >
            {active && <span className="absolute top-0 h-1 w-10 rounded-b-full bg-slate-900" />}
            <Icon
              className={`h-5 w-5 transition-colors ${
                active ? "text-slate-900" : "text-muted-foreground"
              }`}
            />
            <span
              className={`text-[11px] font-semibold transition-colors ${
                active ? "text-slate-900" : "text-muted-foreground"
              }`}
            >
              {label}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}