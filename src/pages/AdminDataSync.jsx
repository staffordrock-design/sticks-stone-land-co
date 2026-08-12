import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { ArrowLeft, DatabaseZap, Gem, MapPinned, RefreshCw, ShieldCheck } from "lucide-react";
import { useAuth } from "@/lib/AuthContext";

export default function AdminDataSync() {
  const { user } = useAuth();
  const [running, setRunning] = useState(false);
  const [runningGeology, setRunningGeology] = useState(false);
  const [runningParcels, setRunningParcels] = useState(false);
  const [result, setResult] = useState(null);
  const [geologyResult, setGeologyResult] = useState(null);
  const [parcelResult, setParcelResult] = useState(null);
  const [freshness, setFreshness] = useState([]);
  const [runningFreshness, setRunningFreshness] = useState(false);
  const [error, setError] = useState("");

  const loadFreshness = async () => {
    try {
      const rows = await base44.entities.DataFreshnessStatus.list("source", 20);
      setFreshness(rows || []);
    } catch (_) {}
  };

  useEffect(() => { if (user?.role === "admin") loadFreshness(); }, [user?.role]);

  if (!user || user.role !== "admin") {
    return <div className="min-h-screen bg-background p-10 text-center text-muted-foreground">Admin access required.</div>;
  }

  const syncMsha = async () => {
    setRunning(true);
    setError("");
    setResult(null);
    try {
      const response = await base44.functions.invoke("sync-msha-employment", {});
      setResult(response?.data || response);
    } catch (e) {
      setError(e?.message || "MSHA sync failed.");
    } finally {
      setRunning(false);
    }
  };

  const syncGeology = async () => {
    setRunningGeology(true);
    setError("");
    setGeologyResult(null);
    try {
      const response = await base44.functions.invoke("sync-tn-geology", {});
      setGeologyResult(response?.data || response);
    } catch (e) {
      setError(e?.message || "Tennessee geology sync failed.");
    } finally {
      setRunningGeology(false);
    }
  };

  const refreshFreshness = async () => {
    setRunningFreshness(true);
    setError("");
    try {
      await base44.functions.invoke("report-data-freshness", {});
      await loadFreshness();
    } catch (e) {
      setError(e?.message || "Freshness check failed.");
    } finally {
      setRunningFreshness(false);
    }
  };

  const syncParcels = async () => {
    setRunningParcels(true);
    setError("");
    setParcelResult(null);
    try {
      const response = await base44.functions.invoke("sync-parcel-boundaries", { limit: 500 });
      setParcelResult(response?.data || response);
    } catch (e) {
      setError(e?.message || "Tennessee parcel boundary sync failed.");
    } finally {
      setRunningParcels(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-background/90 backdrop-blur">
        <div className="mx-auto max-w-5xl px-6 py-4">
          <Link to="/" className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" /> Back to marketplace
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-10">
        <div className="mb-8">
          <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Admin Data Operations</p>
          <h1 className="mt-2 font-heading text-3xl font-bold text-foreground">Quarry Intelligence Sync</h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            Refresh public-source intelligence used by S&S Rock Holdings Data is source-labeled and missing values stay blank rather than being guessed.
          </p>
        </div>

        <section className="mb-6 rounded-2xl border border-border bg-card p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div><h2 className="font-heading text-xl font-bold text-foreground">Report Source Freshness</h2><p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">Every customer report carries the current freshness state for MSHA, TDEC, geology, parcel/tax, and environmental sources. Stale layers stay visible instead of being presented as current.</p></div>
            <button onClick={refreshFreshness} disabled={runningFreshness} className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl border border-border bg-background px-4 py-2.5 text-sm font-semibold text-foreground disabled:opacity-50"><RefreshCw className={`h-4 w-4 ${runningFreshness ? "animate-spin" : ""}`} />{runningFreshness ? "Checking…" : "Recheck freshness"}</button>
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{freshness.map((f) => <div key={f.source} className="rounded-xl border border-border bg-muted/20 p-4"><div className="flex items-center justify-between gap-3"><div className="font-semibold text-foreground">{f.source}</div><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${f.status === "Current" ? "bg-emerald-100 text-emerald-800" : f.status === "Stale" || f.status === "Error" ? "bg-red-100 text-red-800" : "bg-amber-100 text-amber-900"}`}>{f.status}</span></div><div className="mt-2 text-xs text-muted-foreground">Last sync: {f.last_sync_at ? new Date(f.last_sync_at).toLocaleString() : "Not recorded"}</div></div>)}</div>
        </section>

        <section className="rounded-2xl border border-border bg-card p-6">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <DatabaseZap className="h-5 w-5 text-amber-700" />
                <h2 className="font-heading text-xl font-bold text-foreground">MSHA Part 50 Employment</h2>
              </div>
              <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">
                Downloads the latest Metal/Nonmetal mine file, matches Tennessee records by MSHA mine ID, and imports quarterly employee hours and average employees. Quarry tonnage is not invented because MSHA Part 50 production tonnage fields are coal-only.
              </p>
            </div>
            <button
              onClick={syncMsha}
              disabled={running}
              className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-stone-900 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
            >
              <RefreshCw className={`h-4 w-4 ${running ? "animate-spin" : ""}`} />
              {running ? "Syncing…" : "Sync MSHA now"}
            </button>
          </div>

          <div className="mt-5 flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-950">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
            <span>Source-backed fields are updated in place using the MSHA file/quarter/mine ID as the unique source key.</span>
          </div>

          {error && <div className="mt-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900">{error}</div>}

          {result && (
            <div className="mt-5 rounded-xl border border-border bg-muted/20 p-5">
              <div className="grid gap-4 sm:grid-cols-4">
                <div><div className="text-xs uppercase tracking-wider text-muted-foreground">Period</div><div className="mt-1 font-bold">{result.year} Q{result.quarter}</div></div>
                <div><div className="text-xs uppercase tracking-wider text-muted-foreground">Matched</div><div className="mt-1 font-bold">{result.matched ?? 0}</div></div>
                <div><div className="text-xs uppercase tracking-wider text-muted-foreground">Created</div><div className="mt-1 font-bold">{result.created ?? 0}</div></div>
                <div><div className="text-xs uppercase tracking-wider text-muted-foreground">Updated</div><div className="mt-1 font-bold">{result.updated ?? 0}</div></div>
              </div>
              {result.note && <p className="mt-4 text-sm text-muted-foreground">{result.note}</p>}
            </div>
          )}
        </section>

        <section className="mt-6 rounded-2xl border border-border bg-card p-6">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <Gem className="h-5 w-5 text-amber-700" />
                <h2 className="font-heading text-xl font-bold text-foreground">Tennessee Rock Identification</h2>
              </div>
              <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">
                Matches each Tennessee mine coordinate to the statewide geology polygon layer and stores the mapped primary rock, secondary rock, geologic age and unit. This is location-based screening intelligence, not drilling or laboratory proof.
              </p>
            </div>
            <button
              onClick={syncGeology}
              disabled={runningGeology}
              className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-amber-700 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
            >
              <RefreshCw className={`h-4 w-4 ${runningGeology ? "animate-spin" : ""}`} />
              {runningGeology ? "Matching geology…" : "Sync rock types"}
            </button>
          </div>

          <div className="mt-5 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
            <span>Rock types come from the mapped polygon at the mine coordinates. The profile keeps the source link and confidence label so users can tell mapped geology from confirmed reserve data.</span>
          </div>

          {geologyResult && (
            <div className="mt-5 rounded-xl border border-border bg-muted/20 p-5">
              <div className="grid gap-4 sm:grid-cols-4">
                <div><div className="text-xs uppercase tracking-wider text-muted-foreground">Queried</div><div className="mt-1 font-bold">{geologyResult.queried ?? 0}</div></div>
                <div><div className="text-xs uppercase tracking-wider text-muted-foreground">Matched</div><div className="mt-1 font-bold">{geologyResult.matched ?? 0}</div></div>
                <div><div className="text-xs uppercase tracking-wider text-muted-foreground">Created</div><div className="mt-1 font-bold">{geologyResult.created ?? 0}</div></div>
                <div><div className="text-xs uppercase tracking-wider text-muted-foreground">Updated</div><div className="mt-1 font-bold">{geologyResult.updated ?? 0}</div></div>
              </div>
              {geologyResult.sample?.length > 0 && (
                <div className="mt-5 grid gap-2 sm:grid-cols-2">
                  {geologyResult.sample.slice(0, 8).map((item, index) => (
                    <div key={`${item.msha || item.mine}-${index}`} className="rounded-lg border border-border bg-background p-3 text-sm">
                      <div className="font-semibold text-foreground">{item.mine}</div>
                      <div className="mt-1 text-muted-foreground">{[item.primaryRock, item.secondaryRock].filter(Boolean).join(" / ") || "Rock type unavailable"}</div>
                      <div className="mt-1 text-xs text-muted-foreground">{[item.age, item.unit].filter(Boolean).join(" · ")}</div>
                    </div>
                  ))}
                </div>
              )}
              {geologyResult.note && <p className="mt-4 text-sm text-muted-foreground">{geologyResult.note}</p>}
            </div>
          )}
        </section>

        <section className="mt-6 rounded-2xl border border-border bg-card p-6">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <MapPinned className="h-5 w-5 text-amber-700" />
                <h2 className="font-heading text-xl font-bold text-foreground">Tennessee Parcel Boundaries</h2>
              </div>
              <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">
                Matches each mapped Tennessee quarry/mine coordinate against the Tennessee Comptroller IMPACT parcel feature service, stores the returned parcel polygon and acreage, and links the boundary to the same parcel record used for owner and geology intelligence.
              </p>
            </div>
            <button
              onClick={syncParcels}
              disabled={runningParcels}
              className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-stone-900 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
            >
              <RefreshCw className={`h-4 w-4 ${runningParcels ? "animate-spin" : ""}`} />
              {runningParcels ? "Matching parcels…" : "Sync parcel boundaries"}
            </button>
          </div>

          <div className="mt-5 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
            <span>Parcel polygons are graphical GIS reference geometry from the Tennessee Comptroller and are not legal surveys or legal boundary determinations.</span>
          </div>

          {parcelResult && (
            <div className="mt-5 rounded-xl border border-border bg-muted/20 p-5">
              <div className="grid gap-4 sm:grid-cols-4">
                <div><div className="text-xs uppercase tracking-wider text-muted-foreground">Queried</div><div className="mt-1 font-bold">{parcelResult.queried ?? 0}</div></div>
                <div><div className="text-xs uppercase tracking-wider text-muted-foreground">Matched</div><div className="mt-1 font-bold">{parcelResult.matched ?? 0}</div></div>
                <div><div className="text-xs uppercase tracking-wider text-muted-foreground">Created</div><div className="mt-1 font-bold">{parcelResult.created ?? 0}</div></div>
                <div><div className="text-xs uppercase tracking-wider text-muted-foreground">Updated</div><div className="mt-1 font-bold">{parcelResult.updated ?? 0}</div></div>
              </div>
              <div className="mt-4 grid gap-2 text-sm text-muted-foreground sm:grid-cols-2">
                <div>No coordinates: <strong className="text-foreground">{parcelResult.no_coordinates ?? 0}</strong></div>
                <div>No parcel match: <strong className="text-foreground">{parcelResult.no_match ?? 0}</strong></div>
              </div>
              {parcelResult.note && <p className="mt-4 text-sm text-muted-foreground">{parcelResult.note}</p>}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
