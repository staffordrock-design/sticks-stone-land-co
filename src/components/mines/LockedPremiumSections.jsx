import React from "react";
import {
  DollarSign, FileKey2, Gauge, Gem, Landmark, Leaf, MapPinned, Mountain, ShieldCheck, TrendingUp,
} from "lucide-react";
import LockedValue from "@/components/mines/LockedValue";

// The premium intelligence sections of a quarry record, rendered in place with
// their values obscured for visitors without Full Quarry Intelligence. Mirrors
// the sections the paid record shows so nothing looks missing — it looks locked.
const SECTIONS = [
  {
    icon: MapPinned,
    title: "Owner, Operator & Permitted Footprint",
    rows: ["Recorded land owner", "MSHA operator", "Permittee", "Controller", "Permitted acreage", "Permit acreage basis"],
  },
  {
    icon: Landmark,
    title: "Parcel & Tax Intelligence",
    rows: ["Parcel / tax map ID", "Parcel acreage", "Assessed value", "Land value", "Improvement value", "Property address", "Mailing address"],
  },
  {
    icon: FileKey2,
    title: "Deed References",
    rows: ["Deed book / page", "Ownership transfer date", "Recorded easements"],
  },
  {
    icon: DollarSign,
    title: "Indicative Land-Value Screening",
    rows: ["Screening range", "Value per acre", "Confidence", "Valuation basis"],
  },
  {
    icon: Gauge,
    title: "Opportunity Screening",
    rows: ["S&S Opportunity Score", "Screening band", "Source layers connected", "Environmental flags"],
  },
  {
    icon: Gem,
    title: "Geology / Rock Identification",
    rows: ["Primary rock", "Secondary rock", "Formation", "Geologic age", "Lithology", "Map-match confidence"],
  },
  {
    icon: ShieldCheck,
    title: "Permit, Compliance & Regulatory History",
    rows: ["TDEC permit number", "Permit type", "Permit status", "Effective / expiration", "MSHA inspections", "MSHA violations", "Environmental records"],
  },
  {
    icon: TrendingUp,
    title: "Production Intelligence",
    rows: ["Reported production", "MSHA activity signal", "Modeled production range", "USGS market context"],
  },
  {
    icon: Mountain,
    title: "USGS Mineral Intelligence",
    rows: ["MRDS occurrences", "Commodity list", "Deposit type", "Host rock", "Discovery year"],
  },
  {
    icon: Leaf,
    title: "Contract & Royalty Intelligence",
    rows: ["Agreement type", "Royalty per ton", "Minimum annual royalty", "Purchase option", "Recording reference"],
  },
];

export default function LockedPremiumSections() {
  return (
    <>
      <div className="rounded-2xl border border-sky-200 bg-sky-50/70 p-5">
        <h2 className="font-heading text-xl font-bold text-slate-950">Full Quarry Intelligence unlocks these sections</h2>
        <p className="mt-1 text-sm leading-6 text-slate-600">
          These are examples of membership sections, not confirmation that data exists for this property. Use the coverage indicators above; missing source records remain unavailable after purchase.
        </p>
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        {SECTIONS.map(({ icon: Icon, title, rows }) => (
          <section key={title} className="rounded-2xl border border-border bg-card p-6">
            <div className="mb-4 flex items-center gap-2">
              <Icon className="h-5 w-5 text-sky-700" />
              <h2 className="font-heading text-lg font-bold text-foreground">{title}</h2>
            </div>
            {rows.map((label) => (
              <div key={label} className="grid grid-cols-[150px_1fr] items-center gap-3 border-b border-border/60 py-2.5 last:border-0">
                <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</div>
                <LockedValue />
              </div>
            ))}
          </section>
        ))}
      </div>
    </>
  );
}