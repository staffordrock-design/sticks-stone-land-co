import React, { useState, useEffect } from "react";
import { MapPin, Database, RefreshCw, Layers } from "lucide-react";
import { base44 } from "@/api/base44Client";

const SOURCE_FAMILIES = [
  "MSHA",
  "State mining & environmental agencies",
  "County GIS / parcel records",
  "Deeds / ownership records",
  "USGS",
  "Geology datasets",
  "TDOT / transportation demand data",
];

function formatDate(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

export default function TrustBand() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await base44.functions.invoke("get-public-stats", {});
        const data = response?.data || response || {};
        if (!cancelled) setStats(data);
      } catch (error) {
        console.error("Public stats load failed", error);
        if (!cancelled) setStats(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const recordCount = stats?.recordCount ?? null;
  const statesCovered = stats?.statesCovered ?? [];
  const latestRefresh = formatDate(stats?.latestRefresh);

  const stats_display = [
    {
      icon: MapPin,
      label: "States Covered",
      value: loading ? "…" : statesCovered.length > 0 ? statesCovered.join(", ") : "Loading…",
    },
    {
      icon: Database,
      label: "Quarry / Mineral Records",
      value: loading ? "…" : recordCount != null ? recordCount.toLocaleString() : "—",
    },
    {
      icon: RefreshCw,
      label: "Data Refresh",
      value: loading ? "…" : latestRefresh || "—",
    },
    {
      icon: Layers,
      label: "Intelligence Sources",
      value: loading ? "…" : SOURCE_FAMILIES.length + " source families",
      sub: SOURCE_FAMILIES,
    },
  ];

  return (
    <section className="border-b border-border bg-slate-50/80">
      <div className="mx-auto max-w-7xl px-6 py-8">
        <div className="mb-5 text-center">
          <h2 className="font-heading text-lg font-bold text-foreground">Verified Intelligence, Built from Public Sources</h2>
          <p className="mt-1 text-sm text-muted-foreground">Real data from real government and public-source records — not placeholders.</p>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {stats_display.map(({ icon: Icon, label, value, sub }) => (
            <div key={label} className="rounded-xl border border-border bg-background p-5 shadow-sm">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-500">
                <Icon className="h-4 w-4" />
                {label}
              </div>
              <div className="mt-2 font-heading text-lg font-bold text-slate-950">{value}</div>
              {sub && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {sub.map((s) => (
                    <span key={s} className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600">{s}</span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}