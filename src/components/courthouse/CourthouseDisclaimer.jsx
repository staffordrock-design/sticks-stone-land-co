import React from "react";
import { ShieldAlert } from "lucide-react";

export default function CourthouseDisclaimer() {
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-950">
      <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0" />
      <p className="text-sm font-bold">Research tool only — not a legal title opinion.</p>
    </div>
  );
}