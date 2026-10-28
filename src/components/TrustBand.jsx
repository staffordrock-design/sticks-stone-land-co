import React, { useState, useEffect } from "react";
import { MapPin, Database, RefreshCw, Layers, FileText } from "lucide-react";
import { base44 } from "@/api/base44Client";

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
    // Statistics are an inventory-wide aggregate. Letting them start on mount
    // put a full database scan in front of the page's own first paint, so the
    // band fills in a moment after the page itself is usable.
    const timer = setTimeout(() => {
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
    }, 1200);
    return () => { cancelled = true; clearTimeout(timer); };
  }, []);

  const recordCount = stats?.recordCount ?? null;
  const mappedCount = stats?.mappedCount ?? null;
  const parcelLinkedCount = stats?.parcelLinkedCount ?? null;
  const deedLinkedCount = stats?.deedLinkedCount ?? null;
  const latestRefresh = formatDate(stats?.latestRefresh);

  const statsDisplay = [
    {
      icon: Database,
      label: "Quarry & Mineral Records",
      value: loading ? "…" : recordCount != null ? recordCount.toLocaleString() : "—",
      sub: "Total quarry-relevant records in the S&S database",
    },
    {
      icon: MapPin,
      label: "Mapped Mine Locations",
      value: loading ? "…" : mappedCount != null ? mappedCount.toLocaleString() : "—",
      sub: "Records with usable mapped coordinates; not surveyed boundaries",
    },
    {
      icon: Layers,
      label: "Parcel-Linked Records",
      value: loading ? "…" : parcelLinkedCount != null ? parcelLinkedCount.toLocaleString() : "—",
      sub: "Linked to a county parcel or tax-map ID",
    },
    {
      icon: FileText,
      label: "Deed-Linked Records",
      value: loading ? "…" : deedLinkedCount != null ? deedLinkedCount.toLocaleString() : "—",
      sub: "Parcel records with deed book & page references",
    },
  ];

  return (
    <section className="border-b border-border bg-slate-50/80">
      <div className="mx-auto max-w-7xl px-6 py-8">
        <div className="mb-5 text-center">
          <h2 className="font-heading text-lg font-bold text-foreground">Source-Linked Intelligence, Organized for Diligence</h2>
          <p className="mt-1 text-sm text-muted-foreground">Government and public-source records, with coverage shown below. Mapped, parcel-linked and deed-linked records are overlapping subsets of the total.</p>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {statsDisplay.map(({ icon: Icon, label, value, sub }) => (
            <div key={label} className="rounded-xl border border-border bg-background p-5 shadow-sm">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-500">
                <Icon className="h-4 w-4" />
                {label}
              </div>
              <div className="mt-2 font-heading text-2xl font-bold text-slate-950">{value}</div>
              <p className="mt-1 text-xs leading-4 text-muted-foreground">{sub}</p>
            </div>
          ))}
        </div>
        <p className="mt-4 text-center text-sm text-muted-foreground">Coverage varies by property. A membership unlocks available linked data, not missing ownership, deeds or boundaries. Search your county and open a record to check available layers before subscribing.</p>
        <div className="mt-4 flex items-center justify-center gap-2 text-xs text-muted-foreground">
          <RefreshCw className="h-3 w-3" />
          <span>Last database refresh: {loading ? "…" : latestRefresh || "—"}</span>
        </div>
      </div>
    </section>
  );
}