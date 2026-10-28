import React from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Crown } from "lucide-react";

// A page's single unlock prompt. Locked pages render their premium intelligence
// in place (obscured) and place exactly one of these below it.
export default function UnlockBanner({ returnTo }) {
  const href = returnTo ? `/subscribe?returnTo=${encodeURIComponent(returnTo)}` : "/subscribe";
  return (
    <div className="rounded-2xl border border-slate-300 bg-card p-6 text-center shadow-sm">
      <span className="inline-flex items-center gap-2 rounded-full bg-sky-50 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-sky-800">
        <Crown className="h-3.5 w-3.5" />Full Quarry Intelligence
      </span>
      <h2 className="mt-3 font-heading text-xl font-bold text-foreground">Unlock the available intelligence for this property</h2>
      <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
        Membership reveals linked ownership, parcel, deed, permit, geology, production and screening data where available. Check the coverage indicators above first. A locked field is not a promise that its source data exists.
      </p>
      <Link
        to={href}
        className="mt-4 inline-flex min-h-12 items-center gap-2 rounded-xl bg-slate-900 px-6 py-3 text-sm font-bold text-white shadow-lg transition hover:bg-slate-800"
      >
        Unlock Full Quarry Intelligence — $39/month <ArrowRight className="h-4 w-4" />
      </Link>
      <p className="mt-3 text-xs text-muted-foreground">Cancel anytime · No S&amp;S account required to buy</p>
    </div>
  );
}