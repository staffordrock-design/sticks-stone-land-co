import React from "react";
import { Link } from "react-router-dom";
import { Lock, MapPin, TrendingUp } from "lucide-react";

const LOCKED_FIELDS = [
  "Owner / Operator",
  "Parcel ID & Acreage",
  "Geology & Rock Type",
  "Permits & Compliance",
  "Production Context",
  "Opportunity Score",
];

export default function QuarryTeaserSection({ sites, loading }) {
  if (loading) {
    return (
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="h-72 animate-pulse rounded-2xl border border-border bg-muted/40" />
        ))}
      </div>
    );
  }

  if (!sites?.length) {
    return (
      <div className="rounded-2xl border border-dashed border-border p-12 text-center">
        <p className="font-semibold text-foreground">Quarry preview is loading.</p>
        <p className="mt-2 text-sm text-muted-foreground">Check the connection and try again.</p>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="font-heading text-2xl font-bold text-foreground">Southeast Quarry Preview</h2>
            <span className="rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-bold text-sky-700">{sites.length} sample records</span>
          </div>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">A small sample of the quarry records in our database. Unlock Full Quarry Intelligence to see every site — with ownership, parcel data, geology, permits, production, compliance, valuation and opportunity scores.</p>
        </div>
      </div>

      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {sites.map((site) => (
          <div key={site.id} className="flex flex-col rounded-2xl border border-border bg-card overflow-hidden">
            <div className="border-b border-border bg-slate-50 p-5">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h3 className="font-heading text-lg font-bold text-foreground">{site.mine_name || "Unnamed site"}</h3>
                  <div className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
                    <MapPin className="h-3.5 w-3.5" />
                    {[site.county, site.state].filter(Boolean).join(", ")}
                  </div>
                </div>
                <span className="shrink-0 rounded-full bg-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-700">{site.source}</span>
              </div>
            </div>

            <div className="space-y-3 p-5">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-xs uppercase tracking-wider text-muted-foreground">Commodity</p>
                  <p className="mt-0.5 font-medium text-foreground">{site.commodity || "—"}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wider text-muted-foreground">Status</p>
                  <p className="mt-0.5 font-medium text-foreground">{site.mine_status || "—"}</p>
                </div>
              </div>

              <div className="space-y-2 border-t border-border pt-3">
                {LOCKED_FIELDS.map((field) => (
                  <div key={field} className="flex items-center justify-between rounded-lg bg-muted/30 px-3 py-2 text-sm">
                    <span className="text-muted-foreground">{field}</span>
                    <Lock className="h-3.5 w-3.5 text-muted-foreground" />
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-auto border-t border-border p-4">
              <Link to="/subscribe" className="flex min-h-11 items-center justify-center gap-2 rounded-xl bg-sky-700 px-4 py-2.5 text-sm font-bold text-white hover:bg-sky-800">
                <TrendingUp className="h-4 w-4" /> Unlock this record
              </Link>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-8 rounded-2xl border border-slate-700 bg-slate-950 p-6 text-center text-white">
        <h3 className="font-heading text-xl font-bold">This is just a sample.</h3>
        <p className="mx-auto mt-2 max-w-2xl text-sm text-slate-300">Full Quarry Intelligence includes every quarry record across the Southeast — with ownership, parcel data, geology, permitted acreage, compliance history, production context, contract intelligence, valuation screening, and S&amp;S opportunity scores.</p>
        <Link to="/subscribe" className="mt-4 inline-flex min-h-12 items-center justify-center rounded-xl bg-sky-600 px-6 py-3 text-sm font-bold text-white shadow-lg hover:bg-sky-500">Unlock Full Intelligence — $69/month</Link>
        <p className="mt-3 text-xs text-slate-400">No free trial. Cancel anytime.</p>
      </div>
    </div>
  );
}