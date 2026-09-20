import React from "react";
import { Link } from "react-router-dom";
import { Check, X, Lock, TrendingUp, FileSearch, Globe } from "lucide-react";

const PUBLIC_FEATURES = [
  "Learn what S&S does",
  "View the sample intelligence record",
  "Learn about coverage and data sources",
  "Submit a seller / property inquiry",
  "Request professional research",
];

const MEMBER_FEATURES = [
  "Full quarry intelligence database",
  "Ownership and parcel intelligence",
  "Quarry / property mapping",
  "Geology and rock type analysis",
  "Permits and compliance records",
  "Production intelligence",
  "Market / demand intelligence",
  "Quarry opportunity screening",
  "Saved targets / watchlists",
  "Alerts and data updates",
];

const REPORT_FEATURES = [
  "Deeper manual research",
  "Ownership verification",
  "Transaction research",
  "Acquisition diligence",
  "Custom analysis and reporting",
];

export default function MembershipValueSection() {
  return (
    <section className="mx-auto max-w-7xl px-6 py-14">
      <div className="mb-8 text-center">
        <h2 className="font-heading text-2xl font-bold text-foreground sm:text-3xl">Choose Your Level of Intelligence</h2>
        <p className="mt-2 max-w-2xl mx-auto text-sm text-muted-foreground">From public discovery to full database access to custom professional research.</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Public Website */}
        <div className="flex flex-col rounded-2xl border border-border bg-card p-6 shadow-sm">
          <div className="flex items-center gap-2">
            <div className="rounded-lg bg-slate-100 p-2"><Globe className="h-5 w-5 text-slate-600" /></div>
            <h3 className="font-heading text-xl font-bold text-foreground">Public Website</h3>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">Free — no account required</p>
          <div className="mt-5 flex-1 space-y-2.5">
            {PUBLIC_FEATURES.map((f) => (
              <div key={f} className="flex items-start gap-2 text-sm">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                <span className="text-foreground">{f}</span>
              </div>
            ))}
            <div className="flex items-start gap-2 text-sm">
              <X className="mt-0.5 h-4 w-4 shrink-0 text-slate-300" />
              <span className="text-muted-foreground">Full database access</span>
            </div>
          </div>
          <div className="mt-6 rounded-xl bg-slate-100 px-4 py-3 text-center text-sm font-bold text-slate-700">You're here now</div>
        </div>

        {/* $69/month Membership */}
        <div className="flex flex-col rounded-2xl border-2 border-sky-600 bg-card p-6 shadow-lg lg:scale-105">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="rounded-lg bg-sky-600 p-2"><TrendingUp className="h-5 w-5 text-white" /></div>
              <h3 className="font-heading text-xl font-bold text-foreground">Full Intelligence</h3>
            </div>
            <span className="rounded-full bg-sky-100 px-3 py-1 text-xs font-bold text-sky-800">Most Popular</span>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">$69/month · cancel anytime</p>
          <div className="mt-5 flex-1 space-y-2.5">
            {MEMBER_FEATURES.map((f) => (
              <div key={f} className="flex items-start gap-2 text-sm">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-sky-600" />
                <span className="text-foreground">{f}</span>
              </div>
            ))}
          </div>
          <Link to="/subscribe" className="mt-6 inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-sky-600 px-6 py-3 text-sm font-bold text-white shadow-lg transition hover:bg-sky-500">
            <Lock className="h-4 w-4" /> Unlock Full Intelligence — $69/month
          </Link>
        </div>

        {/* Professional Report */}
        <div className="flex flex-col rounded-2xl border border-border bg-card p-6 shadow-sm">
          <div className="flex items-center gap-2">
            <div className="rounded-lg bg-slate-100 p-2"><FileSearch className="h-5 w-5 text-slate-600" /></div>
            <h3 className="font-heading text-xl font-bold text-foreground">Professional Report</h3>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">Custom pricing — separate service</p>
          <div className="mt-5 flex-1 space-y-2.5">
            {REPORT_FEATURES.map((f) => (
              <div key={f} className="flex items-start gap-2 text-sm">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-slate-600" />
                <span className="text-foreground">{f}</span>
              </div>
            ))}
          </div>
          <Link to="/get-started?mode=report" className="mt-6 inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-slate-50 px-6 py-3 text-sm font-bold text-slate-900 transition hover:bg-slate-100">
            Request Due Diligence
          </Link>
        </div>
      </div>

      <p className="mt-6 text-center text-xs text-muted-foreground">
        S&S Rock Holdings organizes public-source intelligence. We do not represent that every property is for sale. Source data may require independent verification.
      </p>
    </section>
  );
}