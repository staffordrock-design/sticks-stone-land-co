import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { ArrowLeft, DatabaseZap, Gem, MapPinned, RefreshCw, ShieldCheck } from "lucide-react";
import { useAuth } from "@/lib/AuthContext";

export default function AdminDataSync() {
  const { user } = useAuth();
  const [running, setRunning] = useState(false);
  const [runningMshaMines, setRunningMshaMines] = useState(false);
  const [runningGeology, setRunningGeology] = useState(false);
  const [runningParcels, setRunningParcels] = useState(false);
  const [result, setResult] = useState(null);
  const [mshaMinesResult, setMshaMinesResult] = useState(null);
  const [geologyResult, setGeologyResult] = useState(null);
  const [parcelResult, setParcelResult] = useState(null);
  const [freshness, setFreshness] = useState([]);
  const [runningFreshness, setRunningFreshness] = useState(false);
  const [runningEnvironmental, setRunningEnvironmental] = useState(false);
  const [environmentalResult, setEnvironmentalResult] = useState(null);
  const [runningOwnershipFootprint, setRunningOwnershipFootprint] = useState(false);
  const [ownershipFootprintResult, setOwnershipFootprintResult] = useState(null);
  const [ownershipOffset, setOwnershipOffset] = useState(0);
  const [runningDmgrPermits, setRunningDmgrPermits] = useState(false);
  const [dmgrPermitResult, setDmgrPermitResult] = useState(null);
  const [runningProductionIntel, setRunningProductionIntel] = useState(false);
  const [productionIntelResult, setProductionIntelResult] = useState(null);
  const [runningMrds, setRunningMrds] = useState(false);
  const [mrdsResult, setMrdsResult] = useState(null);
  const [mrdsOffset, setMrdsOffset] = useState(0);
  const [error, setError] = useState("");

  const loadFreshness = async () => {
    try {
      const rows = await base44.entities.DataFreshnessStatus.list("source", 20);
      setFreshness(rows || []);
    } catch {}
  };

  useEffect(() => { if (user?.role === "admin") loadFreshness(); }, [user?.role]);

  if (!user || user.role !== "admin") {
    return <div className="min-h-screen bg-background p-10 text-center text-muted-foreground">Admin access required.</div>;
  }

  const syncProductionIntel = async () => {
    setRunningProductionIntel(true);
    setProductionIntelResult(null);
    setError("");
    try {
      const mshaResponse = await base44.functions.invoke("sync-msha-employment", {});
      const msha = mshaResponse?.data || mshaResponse;
      if (msha?.success === false) throw new Error(msha?.error || "MSHA activity refresh failed.");

      const usgsResponse = await base44.functions.invoke("sync-usgs-aggregate-production", {});
      const usgs = usgsResponse?.data || usgsResponse;
      if (usgs?.success === false) throw new Error(usgs?.error || "USGS production refresh failed.");

      const estimateResponse = await base44.functions.invoke("build-production-estimates", { state: "TN" });
      const estimates = estimateResponse?.data || estimateResponse;
      if (estimates?.success === false) throw new Error(estimates?.error || "S&S production estimate refresh failed.");

      setProductionIntelResult({ msha, usgs, estimates });
    } catch (e) {
      setError(e?.message || "Production intelligence refresh failed.");
    } finally {
      setRunningProductionIntel(false);
    }
  };

  const syncMshaMines = async () => {
    setRunningMshaMines(true);
    setError("");
    setMshaMinesResult(null);
    try {
      const response = await base44.functions.invoke("sync-msha-mines", {});
      setMshaMinesResult(response?.data || response);
      await loadFreshness();
    } catch (e) {
      setError(e?.message || "MSHA mine master sync failed.");
    } finally {
      setRunningMshaMines(false);
    }
  };

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

  const syncEnvironmental = async () => {
    setRunningEnvironmental(true);
    setEnvironmentalResult(null);
    setError("");
    try {
      const response = await base44.functions.invoke("sync-tn-npdes-environmental", { limit: 500 });
      setEnvironmentalResult(response?.data || response);
      await loadFreshness();
    } catch (e) {
      setError(e?.message || "Tennessee NPDES/environmental sync failed.");
    } finally {
      setRunningEnvironmental(false);
    }
  };

  const syncOwnershipFootprint = async () => {
    setRunningOwnershipFootprint(true);
    setOwnershipFootprintResult(null);
    setError("");
    try {
      const response = await base44.functions.invoke("sync-owner-operator-permit-acreage", { limit: 500, offset: ownershipOffset });
      const payload = response?.data || response;
      setOwnershipFootprintResult(payload);
      setOwnershipOffset(payload?.has_more ? Number(payload.next_offset || 0) : 0);
    } catch (e) {
      setError(e?.message || "Owner/operator/permitted-acre integration failed.");
    } finally {
      setRunningOwnershipFootprint(false);
    }
  };

  const syncDmgrPermits = async () => {
    setRunningDmgrPermits(true);
    setDmgrPermitResult(null);
    setError("");
    try {
      const response = await base44.functions.invoke("sync-tn-dmgr-mining-permits", { limit: 60 });
      const payload = response?.data || response;
      if (payload?.success === false) throw new Error(payload?.error || "TDEC DMGR permit sync failed.");
      setDmgrPermitResult(payload);
      await loadFreshness();
    } catch (e) {
      setError(e?.message || "Tennessee DMGR permit sync failed.");
    } finally {
      setRunningDmgrPermits(false);
    }
  };

  const syncMrds = async () => {
    setRunningMrds(true);
    setMrdsResult(null);
    setError("");
    try {
      const response = await base44.functions.invoke("sync-usgs-mrds", { state: "TN", limit: 40, offset: mrdsOffset });
      const payload = response?.data || response;
      if (payload?.success === false) throw new Error(payload?.error || "USGS MRDS sync failed.");
      setMrdsResult(payload);
      setMrdsOffset(payload?.has_more ? Number(payload.next_offset || 0) : 0);
    } catch (e) {
      setError(e?.message || "USGS mineral intelligence sync failed.");
    } finally {
      setRunningMrds(false);
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
            <ArrowLeft className="h-4 w-4" /> Back to quarry intelligence
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
          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{freshness.map((f) => <div key={f.source} className="rounded-xl border border-border bg-muted/20 p-4"><div className="flex items-center justify-between gap-3"><div className="font-semibold text-foreground">{f.source}</div><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${f.status === "Current" ? "bg-emerald-100 text-emerald-800" : f.status === "Stale" || f.status === "Error" ? "bg-red-100 text-red-800" : "bg-sky-100 text-sky-900"}`}>{f.status}</span></div><div className="mt-2 text-xs text-muted-foreground">Last sync: {f.last_sync_at ? new Date(f.last_sync_at).toLocaleString() : "Not recorded"}</div></div>)}</div>
        </section>

        <section className="mb-6 rounded-2xl border border-sky-300 bg-sky-50/50 p-6">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="flex items-center gap-2"><DatabaseZap className="h-5 w-5 text-sky-800" /><h2 className="font-heading text-xl font-bold text-foreground">Production Intelligence</h2></div>
              <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">Runs the full production pipeline in order: official MSHA quarterly employee hours by Mine ID, official USGS Tennessee aggregate production totals, then S&amp;S modeled mine-level production ranges. MSHA hours and S&amp;S estimates are kept separate so modeled tonnage can never be mistaken for operator-reported production.</p>
            </div>
            <button onClick={syncProductionIntel} disabled={runningProductionIntel} className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-sky-800 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"><RefreshCw className={`h-4 w-4 ${runningProductionIntel ? "animate-spin" : ""}`} />{runningProductionIntel ? "Refreshing production…" : "Refresh production intelligence"}</button>
          </div>
          <div className="mt-5 flex items-start gap-2 rounded-xl border border-sky-200 bg-white p-4 text-sm text-slate-800"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-sky-800" /><span>USGS numbers are statewide market estimates. MSHA contributes mine-level employee hours. S&amp;S estimates are clearly labeled modeled ranges with confidence and methodology — never reported tonnage.</span></div>
          {productionIntelResult && <div className="mt-5 rounded-xl border border-border bg-background p-5"><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5"><div><div className="text-xs uppercase tracking-wider text-muted-foreground">Period</div><div className="mt-1 font-bold">{productionIntelResult.msha?.year ? `${productionIntelResult.msha.year} Q${productionIntelResult.msha.quarter}` : "—"}</div></div><div><div className="text-xs uppercase tracking-wider text-muted-foreground">MSHA matches</div><div className="mt-1 font-bold">{productionIntelResult.msha?.matched ?? 0}</div></div><div><div className="text-xs uppercase tracking-wider text-muted-foreground">USGS groups</div><div className="mt-1 font-bold">{productionIntelResult.usgs?.records?.length ?? 0}</div></div><div><div className="text-xs uppercase tracking-wider text-muted-foreground">Estimates created</div><div className="mt-1 font-bold">{productionIntelResult.estimates?.created ?? 0}</div></div><div><div className="text-xs uppercase tracking-wider text-muted-foreground">Estimates updated</div><div className="mt-1 font-bold">{productionIntelResult.estimates?.updated ?? 0}</div></div></div>{productionIntelResult.estimates?.note && <p className="mt-4 text-sm leading-relaxed text-muted-foreground">{productionIntelResult.estimates.note}</p>}</div>}
        </section>

        <section className="mb-6 rounded-2xl border border-amber-300 bg-amber-50/40 p-6">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-amber-800" /><h2 className="font-heading text-xl font-bold text-foreground">TDEC DMGR Mining Permits &amp; Acreage</h2></div>
              <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">Pulls Tennessee mining and surface-mining permits directly from the Division of Mineral &amp; Geologic Resources. For Mining permits, S&amp;S also reads the public permit-detail page's Mining Specific table to capture acreage the ArcGIS layer leaves blank.</p>
            </div>
            <button onClick={syncDmgrPermits} disabled={runningDmgrPermits} className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-amber-800 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"><RefreshCw className={`h-4 w-4 ${runningDmgrPermits ? "animate-spin" : ""}`} />{runningDmgrPermits ? "Reading TDEC permits…" : "Sync TDEC permits + acres"}</button>
          </div>
          <div className="mt-5 flex items-start gap-2 rounded-xl border border-amber-200 bg-white p-4 text-sm text-amber-950"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" /><span>Permit acreage is accepted only when Tennessee publishes it in the permit record or Mining Specific detail table. Tax-parcel acreage is never substituted. Ambiguous mine-to-permit matches stay unlinked.</span></div>
          {dmgrPermitResult && <div className="mt-5 rounded-xl border border-border bg-background p-5"><div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-6"><div><div className="text-xs uppercase tracking-wider text-muted-foreground">State records</div><div className="mt-1 font-bold">{Number(dmgrPermitResult.source_records_available || 0).toLocaleString()}</div></div><div><div className="text-xs uppercase tracking-wider text-muted-foreground">Processed</div><div className="mt-1 font-bold">{dmgrPermitResult.queried ?? 0}</div></div><div><div className="text-xs uppercase tracking-wider text-muted-foreground">Quarry matches</div><div className="mt-1 font-bold">{dmgrPermitResult.quarry_matches ?? 0}</div></div><div><div className="text-xs uppercase tracking-wider text-muted-foreground">Acreage found</div><div className="mt-1 font-bold">{dmgrPermitResult.permit_acreage_loaded ?? 0}</div></div><div><div className="text-xs uppercase tracking-wider text-muted-foreground">Mine acres linked</div><div className="mt-1 font-bold">{dmgrPermitResult.mine_records_with_acreage_updated ?? 0}</div></div><div><div className="text-xs uppercase tracking-wider text-muted-foreground">Unmatched / ambiguous</div><div className="mt-1 font-bold">{dmgrPermitResult.ambiguous_or_unmatched ?? 0}</div></div></div>{dmgrPermitResult.sample?.length > 0 && <div className="mt-5 grid gap-2 sm:grid-cols-2">{dmgrPermitResult.sample.slice(0, 8).map((item, index) => <div key={`${item.permit}-${index}`} className="rounded-lg border border-border bg-muted/20 p-3 text-sm"><div className="font-semibold text-foreground">{item.mine}</div><div className="mt-1 text-xs text-muted-foreground">{item.permit} · {item.permittee || "Permittee unavailable"}</div><div className="mt-1 text-xs font-semibold text-foreground">{item.permitted_acres ? `${Number(item.permitted_acres).toLocaleString()} permitted acres` : "Acreage not published on this record"}</div></div>)}</div>}{dmgrPermitResult.note && <p className="mt-4 text-sm leading-relaxed text-muted-foreground">{dmgrPermitResult.note}</p>}</div>}
        </section>

        <section className="mb-6 rounded-2xl border border-border bg-card p-6">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="flex items-center gap-2"><MapPinned className="h-5 w-5 text-indigo-700" /><h2 className="font-heading text-xl font-bold text-foreground">Owner · Operator · Permitted Footprint</h2></div>
              <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">Connects assessor parcel ownership, MSHA current operator, TDEC permittee, and permit-specific acreage into one quarry record. Parcel acreage and permitted mining acreage remain separate so the app never implies that the full tax parcel is authorized for mining.</p>
            </div>
            <button onClick={syncOwnershipFootprint} disabled={runningOwnershipFootprint} className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-indigo-800 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"><RefreshCw className={`h-4 w-4 ${runningOwnershipFootprint ? "animate-spin" : ""}`} />{runningOwnershipFootprint ? "Connecting…" : ownershipOffset > 0 ? `Sync next 500 · ${ownershipOffset.toLocaleString()}+` : "Sync owner/operator/acres"}</button>
          </div>
          <div className="mt-5 flex items-start gap-2 rounded-xl border border-indigo-200 bg-indigo-50 p-4 text-sm text-indigo-950"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" /><span>Owner comes from parcel/assessment data. Operator comes from MSHA when available. Permitted acres are accepted only from a connected permit record; parcel acreage is never used as a substitute.</span></div>
          {ownershipFootprintResult && <div className="mt-5 rounded-xl border border-border bg-muted/20 p-5"><div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-6"><div><div className="text-xs uppercase tracking-wider text-muted-foreground">Batch</div><div className="mt-1 font-bold">{Number(ownershipFootprintResult.offset || 0).toLocaleString()}–{Number((ownershipFootprintResult.offset || 0) + (ownershipFootprintResult.queried || 0)).toLocaleString()}</div></div><div><div className="text-xs uppercase tracking-wider text-muted-foreground">Owners linked</div><div className="mt-1 font-bold">{ownershipFootprintResult.owner_linked ?? 0}</div></div><div><div className="text-xs uppercase tracking-wider text-muted-foreground">Operators linked</div><div className="mt-1 font-bold">{ownershipFootprintResult.operator_linked ?? 0}</div></div><div><div className="text-xs uppercase tracking-wider text-muted-foreground">Permittees</div><div className="mt-1 font-bold">{ownershipFootprintResult.permittee_linked ?? 0}</div></div><div><div className="text-xs uppercase tracking-wider text-muted-foreground">Permit acres</div><div className="mt-1 font-bold">{ownershipFootprintResult.permitted_acres_linked ?? 0}</div></div><div><div className="text-xs uppercase tracking-wider text-muted-foreground">Acreage pending</div><div className="mt-1 font-bold">{ownershipFootprintResult.permitted_acres_pending ?? 0}</div></div></div><p className="mt-4 text-xs text-muted-foreground">Scanned {Number(ownershipFootprintResult.parcels_scanned || 0).toLocaleString()} parcel records and {Number(ownershipFootprintResult.permits_scanned || 0).toLocaleString()} permit records. {ownershipFootprintResult.has_more ? "Run the next batch to continue statewide coverage." : "Reached the end of the current Tennessee mine set; the next run restarts at the beginning."}</p>{ownershipFootprintResult.note && <p className="mt-2 text-sm text-muted-foreground">{ownershipFootprintResult.note}</p>}</div>}
        </section>

        <section className="mb-6 rounded-2xl border border-border bg-card p-6">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-emerald-700" /><h2 className="font-heading text-xl font-bold text-foreground">Tennessee NPDES & Environmental Compliance</h2></div>
              <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">Cross-checks mapped Tennessee quarry sites against EPA ECHO / ICIS-NPDES for permit identity, status, expiration, inspection and compliance fields. Tennessee DMGR remains the controlling mining-permit source; unsupported state-only fields are never guessed.</p>
            </div>
            <button onClick={syncEnvironmental} disabled={runningEnvironmental} className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-emerald-800 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"><RefreshCw className={`h-4 w-4 ${runningEnvironmental ? "animate-spin" : ""}`} />{runningEnvironmental ? "Refreshing…" : "Sync NPDES / compliance"}</button>
          </div>
          {environmentalResult && <div className="mt-5 rounded-xl border border-border bg-muted/20 p-5"><div className="grid gap-4 sm:grid-cols-4"><div><div className="text-xs uppercase tracking-wider text-muted-foreground">EPA TN facilities</div><div className="mt-1 font-bold">{environmentalResult.epa_tn_facilities ?? 0}</div></div><div><div className="text-xs uppercase tracking-wider text-muted-foreground">Mine matches</div><div className="mt-1 font-bold">{environmentalResult.matched ?? 0}</div></div><div><div className="text-xs uppercase tracking-wider text-muted-foreground">Environmental</div><div className="mt-1 font-bold">{(environmentalResult.environmental_created ?? 0) + (environmentalResult.environmental_updated ?? 0)}</div></div><div><div className="text-xs uppercase tracking-wider text-muted-foreground">Permit records</div><div className="mt-1 font-bold">{(environmentalResult.permits_created ?? 0) + (environmentalResult.permits_updated ?? 0)}</div></div></div>{environmentalResult.note && <p className="mt-4 text-sm text-muted-foreground">{environmentalResult.note}</p>}</div>}
        </section>

        <section className="mb-6 rounded-2xl border border-border bg-card p-6">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <DatabaseZap className="h-5 w-5 text-slate-800" />
                <h2 className="font-heading text-xl font-bold text-foreground">MSHA Mine Master</h2>
              </div>
              <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">
                Refreshes Southeast mine identity, current status, operator, controller, mine type, commodity, county and coordinates from MSHA's official Mines dataset. Mine ID is treated as the authoritative unique key; S&S parcel and permit links are preserved.
              </p>
            </div>
            <button
              onClick={syncMshaMines}
              disabled={runningMshaMines}
              className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
            >
              <RefreshCw className={`h-4 w-4 ${runningMshaMines ? "animate-spin" : ""}`} />
              {runningMshaMines ? "Refreshing master…" : "Sync MSHA mine master"}
            </button>
          </div>
          {mshaMinesResult && <div className="mt-5 rounded-xl border border-border bg-muted/20 p-5"><div className="grid gap-4 sm:grid-cols-4"><div><div className="text-xs uppercase tracking-wider text-muted-foreground">Official Southeast rows</div><div className="mt-1 font-bold">{mshaMinesResult.official_southeast_records ?? 0}</div></div><div><div className="text-xs uppercase tracking-wider text-muted-foreground">Created</div><div className="mt-1 font-bold">{mshaMinesResult.created ?? 0}</div></div><div><div className="text-xs uppercase tracking-wider text-muted-foreground">Updated</div><div className="mt-1 font-bold">{mshaMinesResult.updated ?? 0}</div></div><div><div className="text-xs uppercase tracking-wider text-muted-foreground">Duplicate IDs</div><div className="mt-1 font-bold">{mshaMinesResult.duplicate_msha_ids_found ?? 0}</div></div></div>{mshaMinesResult.note && <p className="mt-4 text-sm text-muted-foreground">{mshaMinesResult.note}</p>}</div>}
        </section>

        <section className="rounded-2xl border border-border bg-card p-6">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <DatabaseZap className="h-5 w-5 text-sky-700" />
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
                <Gem className="h-5 w-5 text-sky-700" />
                <h2 className="font-heading text-xl font-bold text-foreground">Tennessee Rock Identification</h2>
              </div>
              <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">
                Matches each Tennessee mine coordinate to the statewide geology polygon layer and stores the mapped primary rock, secondary rock, geologic age and unit. This is location-based screening intelligence, not drilling or laboratory proof.
              </p>
            </div>
            <button
              onClick={syncGeology}
              disabled={runningGeology}
              className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-sky-700 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
            >
              <RefreshCw className={`h-4 w-4 ${runningGeology ? "animate-spin" : ""}`} />
              {runningGeology ? "Matching geology…" : "Sync rock types"}
            </button>
          </div>

          <div className="mt-5 flex items-start gap-2 rounded-xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-950">
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

        <section className="mt-6 rounded-2xl border border-violet-200 bg-violet-50/30 p-6">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <Gem className="h-5 w-5 text-violet-700" />
                <h2 className="font-heading text-xl font-bold text-foreground">USGS MRDS Mineral Intelligence</h2>
              </div>
              <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">
                Connects Tennessee mine coordinates to nearby USGS Mineral Resources Data System occurrences and preserves the fields USGS actually publishes: commodity names, mineralogy, deposit type, operation type, geologic model, host rock, associated rock and production-size class.
              </p>
            </div>
            <button
              onClick={syncMrds}
              disabled={runningMrds}
              className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-violet-800 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
            >
              <RefreshCw className={`h-4 w-4 ${runningMrds ? "animate-spin" : ""}`} />
              {runningMrds ? "Reading USGS…" : mrdsOffset > 0 ? `Sync next 40 · ${mrdsOffset.toLocaleString()}+` : "Sync USGS mineral data"}
            </button>
          </div>
          <div className="mt-5 flex items-start gap-2 rounded-xl border border-violet-200 bg-white p-4 text-sm text-violet-950">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
            <span>MRDS is proximity-based mineral context, not proof that the USGS occurrence is the same legal mine or that a reserve is commercially recoverable. Distance is retained on every linked record.</span>
          </div>
          {mrdsResult && <div className="mt-5 rounded-xl border border-border bg-background p-5"><div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-6"><div><div className="text-xs uppercase tracking-wider text-muted-foreground">Batch</div><div className="mt-1 font-bold">{Number(mrdsResult.offset || 0).toLocaleString()}–{Number((mrdsResult.offset || 0) + (mrdsResult.source_rows || 0)).toLocaleString()}</div></div><div><div className="text-xs uppercase tracking-wider text-muted-foreground">Coordinates</div><div className="mt-1 font-bold">{mrdsResult.candidates ?? 0}</div></div><div><div className="text-xs uppercase tracking-wider text-muted-foreground">Matched</div><div className="mt-1 font-bold">{mrdsResult.matched ?? 0}</div></div><div><div className="text-xs uppercase tracking-wider text-muted-foreground">Created</div><div className="mt-1 font-bold">{mrdsResult.created ?? 0}</div></div><div><div className="text-xs uppercase tracking-wider text-muted-foreground">Updated</div><div className="mt-1 font-bold">{mrdsResult.updated ?? 0}</div></div><div><div className="text-xs uppercase tracking-wider text-muted-foreground">No match</div><div className="mt-1 font-bold">{mrdsResult.noMatch ?? 0}</div></div></div><p className="mt-4 text-xs text-muted-foreground">{mrdsResult.has_more ? "Run the next batch to continue through Tennessee records." : "Reached the end of the current Tennessee mine set; the next run restarts at the beginning and refreshes existing links."}</p>{mrdsResult.note && <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{mrdsResult.note}</p>}</div>}
        </section>

        <section className="mt-6 rounded-2xl border border-border bg-card p-6">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <MapPinned className="h-5 w-5 text-sky-700" />
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

          <div className="mt-5 flex items-start gap-2 rounded-xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-950">
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
