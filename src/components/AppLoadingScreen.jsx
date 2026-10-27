import React from "react";
import BrandLogo from "@/components/BrandLogo";

// Branded loading state used while the app resolves auth and membership.
// It replaces the empty white page + spinner so a slow connection shows the
// product taking shape instead of a blank screen.
export default function AppLoadingScreen({ message = "Loading quarry intelligence…" }) {
  return (
    <div className="fixed inset-0 z-[125] flex flex-col items-center justify-center gap-6 bg-background px-6">
      <BrandLogo />
      <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-slate-700" />
        <span>{message}</span>
      </div>
      <div className="w-full max-w-md space-y-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-16 animate-pulse rounded-xl border border-border bg-muted/40" />
        ))}
      </div>
    </div>
  );
}