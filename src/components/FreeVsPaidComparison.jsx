import React from "react";
import { Check, X, LockKeyhole } from "lucide-react";

const FREE_FEATURES = [
  "Homepage and company information",
  "Sample intelligence record",
  "Public methodology / data sources page",
  "Basic public search results (name, county, state, material, status)",
  "Basic map preview with quarry markers",
  "Limited watchlist (save up to 2 targets)",
  "Property inquiry / ask about a property",
  "Request due diligence / custom research",
];

const PAID_FEATURES = [
  "Full searchable database — every quarry, every county, every state",
  "Full quarry and property records with all fields unlocked",
  "Ownership and parcel intelligence (owner, deed, tax-map, acreage)",
  "Geology and rock type (formation, age, lithology, USGS MRDS)",
  "Permits and compliance (TDEC, NPDES, MSHA inspections, violations)",
  "Production intelligence (reported, modeled, USGS market context)",
  "Market and transportation demand (TDOT producer and demand data)",
  "Comparable quarry sales data for benchmarking",
  "Opportunity screening (S&S 0–100 opportunity score)",
  "Unlimited saved targets",
  "Alerts and data updates",
];

function FeatureRow({ label, free, paid }) {
  return (
    <div className="flex items-center gap-3 border-b border-border py-2.5 last:border-0">
      <div className="flex-1 text-sm text-foreground">{label}</div>
      <div className="w-16 text-center">
        {free ? <Check className="mx-auto h-4 w-4 text-emerald-600" /> : <X className="mx-auto h-4 w-4 text-slate-300" />}
      </div>
      <div className="w-16 text-center">
        {paid ? <Check className="mx-auto h-4 w-4 text-emerald-600" /> : <LockKeyhole className="mx-auto h-4 w-4 text-slate-400" />}
      </div>
    </div>
  );
}

export default function FreeVsPaidComparison() {
  const allFeatures = [
    ...FREE_FEATURES.map((f) => ({ label: f, free: true, paid: true })),
    ...PAID_FEATURES.filter((f) => !FREE_FEATURES.includes(f)).map((f) => ({ label: f, free: false, paid: true })),
  ];

  return (
    <div className="mt-8 overflow-hidden rounded-2xl border border-border bg-card">
      <div className="border-b border-border bg-muted/30 px-6 py-4">
        <h2 className="font-heading text-xl font-bold text-foreground">Free vs. Full Quarry Intelligence</h2>
        <p className="mt-1 text-sm text-muted-foreground">See exactly what you get with each access level.</p>
      </div>
      <div className="grid grid-cols-[1fr_80px_80px] gap-2 px-6 py-3 text-xs font-bold uppercase tracking-wider text-muted-foreground">
        <div>Feature</div>
        <div className="text-center">Free</div>
        <div className="text-center">$39/mo</div>
      </div>
      <div className="px-6">
        {allFeatures.map((f, i) => (
          <FeatureRow key={i} {...f} />
        ))}
      </div>
      <div className="border-t border-border bg-muted/20 px-6 py-4 text-center">
        <p className="text-xs text-muted-foreground">
          Public-source data may require independent verification before any transaction, investment, or operational decision.
        </p>
      </div>
    </div>
  );
}