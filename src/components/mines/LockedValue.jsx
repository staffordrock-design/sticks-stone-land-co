import React from "react";
import { LockKeyhole } from "lucide-react";

// Blurred stand-in for a locked premium value. Same locked pattern the /search
// cards use, so a locked field still renders in place instead of disappearing.
export default function LockedValue({ width = "w-24" }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span className={`h-3.5 ${width} rounded bg-slate-300/80 blur-[4px]`} aria-hidden="true" />
      <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-slate-500">
        <LockKeyhole className="h-3 w-3" />Locked
      </span>
    </span>
  );
}