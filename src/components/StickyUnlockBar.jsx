import React from "react";
import { Link } from "react-router-dom";
import { Lock } from "lucide-react";

export default function StickyUnlockBar() {
  return (
    <div className="fixed bottom-20 left-0 right-0 z-30 lg:bottom-4" style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}>
      <div className="mx-auto max-w-7xl px-4">
        <Link
          to="/subscribe"
          className="flex items-center justify-center gap-2 rounded-xl bg-sky-600 px-6 py-3.5 text-sm font-bold text-white shadow-2xl ring-1 ring-sky-400/50 hover:bg-sky-500 transition"
        >
          <Lock className="h-4 w-4 shrink-0" />
          <span>Unlock Full Quarry Intelligence — $69/month</span>
        </Link>
      </div>
    </div>
  );
}