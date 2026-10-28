import React from "react";
import { Search, GitCompare, FileSearch, Bookmark, BellRing, ClipboardCheck } from "lucide-react";

const STEPS = [
  { icon: Search, title: "Search", desc: "Search the S&S quarry and mine database across eight Southeast states by name, county, state, material or MSHA ID." },
  { icon: GitCompare, title: "Compare", desc: "Compare mapped property facts side by side — acreage, geology, permits, production, and opportunity scores." },
  { icon: FileSearch, title: "Inspect Intelligence", desc: "Open a quarry record to review its available ownership, parcel, geology, permit, compliance and production layers. Availability varies by property." },
  { icon: Bookmark, title: "Save Target", desc: "Save the quarries worth tracking. Paid members get unlimited saves." },
  { icon: BellRing, title: "Monitor Changes", desc: "Get alerts when new data arrives for your saved targets — ownership changes, permit updates, new production data." },
  { icon: ClipboardCheck, title: "Request Diligence", desc: "Request a custom due-diligence report or professional research engagement directly from any quarry record." },
];

export default function SubscriptionWorkflow() {
  return (
    <div className="mt-8 rounded-2xl border border-border bg-card p-6">
      <div className="mb-5">
        <h2 className="font-heading text-xl font-bold text-foreground">What you can accomplish in your first session</h2>
        <p className="mt-1 text-sm text-muted-foreground">Full Quarry Intelligence is a workflow, not just a data dump. Here is what you can do on day one:</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {STEPS.map((step, i) => {
          const Icon = step.icon;
          return (
            <div key={i} className="rounded-xl border border-border bg-muted/20 p-4">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-900 text-white shrink-0">
                  <Icon className="h-4 w-4" />
                </div>
                <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Step {i + 1}</span>
              </div>
              <h3 className="mt-2 font-bold text-foreground">{step.title}</h3>
              <p className="mt-1 text-sm leading-5 text-muted-foreground">{step.desc}</p>
            </div>
          );
        })}
      </div>
      <div className="mt-5 rounded-xl border border-sky-200 bg-sky-50 p-4">
        <p className="text-sm leading-6 text-sky-950">
          <strong>Before:</strong> Browse public mine identity, location and status, then check linked-data coverage before buying.
          <br />
          <strong>After:</strong> Membership unlocks the linked ownership, parcel, deed, geology, permit, production and screening information available for each property. Missing records remain unavailable. Mapped geology is not a deposit assay; source dates and confidence appear with the data.
        </p>
      </div>
    </div>
  );
}