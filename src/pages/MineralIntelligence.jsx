import React, { useState, useEffect, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import MineralOccurrenceMap from "@/components/MineralOccurrenceMap";
import { Mountain, TrendingUp, MapPin, Database } from "lucide-react";

const SOUTHEAST_STATES = ["TN", "GA", "AL", "KY", "NC", "SC", "FL", "MS"];

export default function MineralIntelligence() {
  const [occurrences, setOccurrences] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const loadAll = async () => {
      try {
        setLoading(true);
        const all = [];
        for (const state of SOUTHEAST_STATES) {
          for (let offset = 0; offset < 10000; offset += 500) {
            const page = await base44.entities.USGSMineralOccurrence.filter(
              { occurrence_state: state },
              "-created_date",
              500,
              offset
            );
            all.push(...(page || []));
            if (!page || page.length < 500) break;
          }
        }
        setOccurrences(all);
      } catch (err) {
        console.error("MineralIntelligence load failed", err);
        setError(err?.message || "Failed to load mineral occurrence data");
      } finally {
        setLoading(false);
      }
    };
    loadAll();
  }, []);

  const summary = useMemo(() => {
    const byState = {};
    const byStatus = { matched: 0, nearby: 0, historical: 0, unmatched: 0 };
    const clusterCounties = {};
    for (const o of occurrences) {
      if (o.occurrence_state) byState[o.occurrence_state] = (byState[o.occurrence_state] || 0) + 1;
      if (o.match_status) byStatus[o.match_status] = (byStatus[o.match_status] || 0) + 1;
      if (o.match_status === "matched" || o.match_status === "nearby") {
        const key = `${o.occurrence_county || "Unknown"}, ${o.occurrence_state || "?"}`;
        clusterCounties[key] = (clusterCounties[key] || 0) + 1;
      }
    }
    const topClusters = Object.entries(clusterCounties)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);
    return { total: occurrences.length, byState, byStatus, topClusters };
  }, [occurrences]);

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 border-b border-border bg-background/95 shadow-sm backdrop-blur" style={{ paddingTop: "env(safe-area-inset-top, 16px)" }}>
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 pb-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-900 text-slate-50 shadow-sm">
              <Mountain className="h-5 w-5" />
            </div>
            <div className="leading-none">
              <p className="font-heading text-base font-bold tracking-tight text-foreground">Mineral Intelligence</p>
              <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">USGS Occurrence Dashboard</p>
            </div>
          </div>
          <a href="/" className="text-sm font-medium text-muted-foreground hover:text-foreground">← Back to marketplace</a>
        </div>
      </header>

      <section className="mx-auto max-w-7xl px-6 pt-10 pb-6">
        <h1 className="font-heading text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
          USGS Mineral Occurrence Map
        </h1>
        <p className="mt-3 max-w-3xl text-base leading-relaxed text-muted-foreground">
          Interactive dashboard of all USGS MRDS mineral occurrences imported across the Southeast.
          Filter by state and match status to spot investment clusters — areas with dense matched or nearby
          occurrences indicate active mineral districts with existing mine infrastructure and expansion potential.
        </p>
      </section>

      <section className="mx-auto max-w-7xl px-6 pb-8">
        <div className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-border bg-border sm:grid-cols-4">
          <div className="bg-background px-5 py-5">
            <div className="flex items-center gap-2 text-sky-700">
              <Database className="h-4 w-4" />
              <span className="text-xs font-bold uppercase tracking-wider">Total occurrences</span>
            </div>
            <p className="mt-2 font-heading text-3xl font-bold text-foreground">{loading ? "—" : summary.total.toLocaleString()}</p>
          </div>
          <div className="bg-background px-5 py-5">
            <div className="flex items-center gap-2 text-blue-700">
              <TrendingUp className="h-4 w-4" />
              <span className="text-xs font-bold uppercase tracking-wider">Matched to mines</span>
            </div>
            <p className="mt-2 font-heading text-3xl font-bold text-foreground">{loading ? "—" : summary.byStatus.matched.toLocaleString()}</p>
          </div>
          <div className="bg-background px-5 py-5">
            <div className="flex items-center gap-2 text-sky-600">
              <MapPin className="h-4 w-4" />
              <span className="text-xs font-bold uppercase tracking-wider">Nearby mines</span>
            </div>
            <p className="mt-2 font-heading text-3xl font-bold text-foreground">{loading ? "—" : summary.byStatus.nearby.toLocaleString()}</p>
          </div>
          <div className="bg-background px-5 py-5">
            <div className="flex items-center gap-2 text-slate-500">
              <Mountain className="h-4 w-4" />
              <span className="text-xs font-bold uppercase tracking-wider">Historical</span>
            </div>
            <p className="mt-2 font-heading text-3xl font-bold text-foreground">{loading ? "—" : summary.byStatus.historical.toLocaleString()}</p>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-6 pb-10">
        {loading ? (
          <div className="h-[600px] animate-pulse rounded-2xl border border-border bg-muted/40" />
        ) : error ? (
          <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-8 text-center">
            <p className="text-sm font-medium text-destructive">{error}</p>
          </div>
        ) : (
          <MineralOccurrenceMap occurrences={occurrences} height={600} />
        )}
      </section>

      {!loading && !error && summary.topClusters.length > 0 && (
        <section className="mx-auto max-w-7xl px-6 pb-16">
          <div className="rounded-2xl border border-border bg-card p-6">
            <h2 className="font-heading text-xl font-bold text-foreground">Top Investment Clusters</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Counties with the highest concentration of matched and nearby USGS occurrences — areas where existing
              mine infrastructure overlaps dense mineral deposits.
            </p>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
                    <th className="pb-2 pr-4 font-semibold">County</th>
                    <th className="pb-2 pr-4 font-semibold">Matched + Nearby</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.topClusters.map(([county, count]) => (
                    <tr key={county} className="border-b border-border/50 last:border-0">
                      <td className="py-2.5 pr-4 font-medium text-foreground">{county}</td>
                      <td className="py-2.5 pr-4">
                        <div className="flex items-center gap-2">
                          <div className="h-2 rounded-full bg-blue-600" style={{ width: `${Math.min((count / summary.topClusters[0][1]) * 200, 200)}px` }} />
                          <span className="font-semibold text-foreground">{count}</span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}