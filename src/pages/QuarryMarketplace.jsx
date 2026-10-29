import React, { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  FileText, Layers3, Loader2, MapPin, Search, ShieldCheck, SlidersHorizontal, X,
} from "lucide-react";
import BrandLogo from "@/components/BrandLogo";
import QuarryMapCanvas from "@/components/quarryMap/QuarryMapCanvas";
import { base44 } from "@/api/base44Client";
import { premiumEntityQuery } from "@/lib/subscriptionAccess";
import { useProfessionalAccess } from "@/hooks/useProfessionalAccess";
import { SAMPLE_RECORD_ID } from "@/lib/sampleRecord";
import { isPlausibleSoutheastCoordinate } from "@/utils/coordinates";

const STATES = ["TN", "GA", "AL", "KY", "NC", "SC", "FL", "MS"];
const STATUS_OPTIONS = ["All", "Active", "Inactive / Idled", "Historical / Abandoned", "New / Potential"];

function statusGroup(status = "") {
  const s = String(status).toLowerCase();
  if (s.includes("intermittent") || s.includes("temporarily idled") || s.includes("nonproducing") || s.includes("non-producing") || s.includes("inactive")) return "Inactive / Idled";
  if (s.includes("historical") || s.includes("abandon")) return "Historical / Abandoned";
  if (s.includes("active")) return "Active";
  return "New / Potential";
}

function withinBounds(site, bounds) {
  if (!bounds) return true;
  const lat = Number(site.latitude);
  const lng = Number(site.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  return lat >= bounds.south && lat <= bounds.north && lng >= bounds.west && lng <= bounds.east;
}

function DataBadge({ children, tone = "slate" }) {
  const tones = {
    slate: "border-slate-200 bg-slate-50 text-slate-700",
    green: "border-emerald-200 bg-emerald-50 text-emerald-800",
    blue: "border-sky-200 bg-sky-50 text-sky-800",
  };
  return <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-bold ${tones[tone] || tones.slate}`}>{children}</span>;
}

export default function QuarryMarketplace() {
  const { hasProfessional, checking } = useProfessionalAccess();
  const [searchParams, setSearchParams] = useSearchParams();
  const [state, setState] = useState(searchParams.get("state") || "TN");
  const [query, setQuery] = useState(searchParams.get("q") || "");
  const [status, setStatus] = useState("All");
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [showMinerals, setShowMinerals] = useState(false);
  const [showParcels, setShowParcels] = useState(false);
  const [minerals, setMinerals] = useState([]);
  const [mineralsLoading, setMineralsLoading] = useState(false);
  const [mineralError, setMineralError] = useState("");
  const [parcelStatus, setParcelStatus] = useState("");
  const [county, setCounty] = useState("All counties");
  const [commodity, setCommodity] = useState("All materials");
  const [minAcres, setMinAcres] = useState("");
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const [deedOnly, setDeedOnly] = useState(false);
  const [mapView, setMapView] = useState({ zoom: 6, bounds: null });
  const [areaBounds, setAreaBounds] = useState(null);
  const [countyPickMode, setCountyPickMode] = useState(false);
  const [sites, setSites] = useState([]);
  const [parcels, setParcels] = useState([]);
  const [verifications, setVerifications] = useState([]);
  const [geology, setGeology] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (checking) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError("");
      try {
        const response = await base44.functions.invoke("get-public-quarry-list", { state });
        const publicSites = response?.data?.sites || response?.sites || [];
        if (cancelled) return;
        setSites(publicSites.filter((s) => s?.id && isPlausibleSoutheastCoordinate(s.latitude, s.longitude, s.state)));

        if (hasProfessional) {
          try {
            const [parcelRows, verifyRows, geologyRows] = await Promise.all([
              premiumEntityQuery("ParcelRecord", { state }, "-updated_date", 500),
              premiumEntityQuery("ParcelOwnershipVerification", {}, "-verified_at", 500),
              premiumEntityQuery("GeologyRecord", { state }, "-updated_date", 500),
            ]);
            if (cancelled) return;
            setParcels(parcelRows || []);
            setVerifications(verifyRows || []);
            setGeology(geologyRows || []);
          } catch (premiumError) {
            console.error("Premium data load failed", premiumError);
          }
        } else {
          setParcels([]);
          setVerifications([]);
          setGeology([]);
        }
      } catch (e) {
        if (!cancelled) setError(e?.message || "The quarry map could not load.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [checking, hasProfessional, state]);

  useEffect(() => {
    const next = {};
    if (query.trim()) next.q = query.trim();
    if (state) next.state = state;
    setSearchParams(next, { replace: true });
  }, [query, state, setSearchParams]);

  // The public USGS layer is a bounded, state-scoped, opt-in data request.
  // Do not read the admin-only occurrence entity directly or expose premium records.
  useEffect(() => {
    if (!showMinerals) {
      setMinerals([]);
      setMineralError("");
      setMineralsLoading(false);
      return;
    }
    let cancelled = false;
    setMinerals([]);
    setMineralsLoading(true);
    setMineralError("");
    (async () => {
      try {
        const response = await base44.functions.invoke("get-public-mineral-occurrences", { state });
        const payload = response?.data || response || {};
        if (payload?.error) throw new Error(payload.error);
        if (!Array.isArray(payload.occurrences)) throw new Error("No mineral dataset returned");
        if (!cancelled) setMinerals(payload.occurrences.filter((o) =>
          Number.isFinite(Number(o.latitude)) && Number.isFinite(Number(o.longitude))
          && Number(o.latitude) > 20 && Number(o.latitude) < 45 && Number(o.longitude) < -70
        ));
      } catch {
        if (!cancelled) setMineralError("USGS mineral layer is temporarily unavailable.");
      } finally {
        if (!cancelled) setMineralsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [showMinerals, state]);

  const parcelByMine = useMemo(() => {
    const map = new Map();
    for (const row of parcels) {
      if (row.msha_mine_id) map.set(String(row.msha_mine_id), row);
    }
    return map;
  }, [parcels]);

  const verificationBySite = useMemo(() => {
    const map = new Map();
    for (const row of verifications) {
      if (row.mining_site_id && !map.has(row.mining_site_id)) map.set(row.mining_site_id, row);
      if (row.msha_mine_id && !map.has(`msha:${row.msha_mine_id}`)) map.set(`msha:${row.msha_mine_id}`, row);
    }
    return map;
  }, [verifications]);

  const geologyBySite = useMemo(() => {
    const map = new Map();
    for (const row of geology) {
      if (row.mining_site_id) map.set(row.mining_site_id, row);
      if (row.msha_mine_id) map.set(`msha:${row.msha_mine_id}`, row);
    }
    return map;
  }, [geology]);

  const counties = useMemo(() => ["All counties", ...Array.from(new Set(sites.map((s) => s.county).filter(Boolean))).sort()], [sites]);
  const commodities = useMemo(() => ["All materials", ...Array.from(new Set(sites.map((s) => s.commodity).filter(Boolean))).sort().slice(0, 80)], [sites]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const acres = Number(minAcres);
    return sites.filter((site) => {
      const parcel = site.msha_mine_id ? parcelByMine.get(String(site.msha_mine_id)) : null;
      const verification = verificationBySite.get(site.id) || (site.msha_mine_id ? verificationBySite.get(`msha:${site.msha_mine_id}`) : null);
      const haystack = [
        site.mine_name, site.county, site.state, site.city, site.commodity, site.msha_mine_id,
        site.operator_name, parcel?.owner_name, parcel?.parcel_id, verification?.owner_name, verification?.parcel_id
      ].filter(Boolean).join(" ").toLowerCase();

      if (q && !haystack.includes(q)) return false;
      if (status !== "All" && statusGroup(site.mine_status) !== status) return false;
      if (county !== "All counties" && site.county !== county) return false;
      if (commodity !== "All materials" && site.commodity !== commodity) return false;
      const effectiveAcres = Number(parcel?.acreage || site.acreage || 0);
      if (Number.isFinite(acres) && acres > 0 && effectiveAcres < acres) return false;
      const isVerified = verification?.status === "Verified" || Boolean(parcel?.source_url);
      const hasDeed = Boolean(verification?.deed_book_page || parcel?.deed_book_page);
      if (verifiedOnly && !isVerified) return false;
      if (deedOnly && !hasDeed) return false;
      return true;
    });
  }, [sites, query, status, county, commodity, minAcres, verifiedOnly, deedOnly, parcelByMine, verificationBySite]);

  const displayed = useMemo(
    () => (areaBounds ? filtered.filter((site) => withinBounds(site, areaBounds)) : filtered),
    [filtered, areaBounds]
  );

  const linkedParcelCount = displayed.filter((s) => s.msha_mine_id && parcelByMine.has(String(s.msha_mine_id))).length;
  const deedCount = displayed.filter((s) => {
    const v = verificationBySite.get(s.id) || (s.msha_mine_id ? verificationBySite.get(`msha:${s.msha_mine_id}`) : null);
    const p = s.msha_mine_id ? parcelByMine.get(String(s.msha_mine_id)) : null;
    return Boolean(v?.deed_book_page || p?.deed_book_page);
  }).length;

  const clearFilters = () => {
    setQuery("");
    setStatus("All");
    setCounty("All counties");
    setCommodity("All materials");
    setMinAcres("");
    setVerifiedOnly(false);
    setDeedOnly(false);
    setAreaBounds(null);
    setSelectedId(null);
  };

  if (checking) {
    return <div className="flex min-h-[60vh] items-center justify-center"><Loader2 className="h-7 w-7 animate-spin" /></div>;
  }

  return (
    <div className="flex min-h-[100dvh] flex-col bg-background">
      <header className="border-b border-border bg-background px-4 pb-3 sm:px-6" style={{ paddingTop: "env(safe-area-inset-top, 14px)" }}>
        <div className="mx-auto max-w-[1600px]">
          <div className="flex items-center justify-between gap-3">
            <BrandLogo />
            <div className="hidden items-center gap-2 md:flex">
              <DataBadge tone="blue"><ShieldCheck className="mr-1 h-3 w-3" />Source-linked</DataBadge>
              <Link to="/discover" className="text-xs font-bold text-sky-800 hover:underline">Discover S&amp;S</Link>
              <Link to="/data-sources" className="text-xs font-bold text-muted-foreground hover:text-foreground">How the data works</Link>
            </div>
          </div>

          <p className="mt-1 text-xs font-medium text-muted-foreground">Explore quarry locations, rock types and mineral opportunities right on the map.</p>

          <div className="mt-3 flex flex-col gap-2 lg:flex-row">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search quarry, county, owner, parcel ID, rock type or MSHA ID"
                className="min-h-12 w-full rounded-xl border border-border bg-card pl-10 pr-10 text-base outline-none focus:ring-2 focus:ring-sky-400"
              />
              {query && <button type="button" onClick={() => setQuery("")} className="absolute right-3 top-1/2 -translate-y-1/2"><X className="h-4 w-4" /></button>}
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:flex">
              <select value={state} onChange={(e) => { setState(e.target.value); setCounty("All counties"); setAreaBounds(null); setCountyPickMode(false); setShowParcels(false); }} className="min-h-12 rounded-xl border border-border bg-card px-3 text-sm font-bold">
                {STATES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
              <button type="button" onClick={() => setShowAdvancedFilters((v) => !v)} aria-expanded={showAdvancedFilters} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-border bg-card px-3 text-sm font-bold md:hidden">
                <SlidersHorizontal className="h-4 w-4" />{showAdvancedFilters ? "Hide filters" : "Filters"}
              </button>
              <select value={county} onChange={(e) => setCounty(e.target.value)} className={`${showAdvancedFilters ? "" : "hidden"} min-h-12 rounded-xl border border-border bg-card px-3 text-sm font-bold md:block`}>
                {counties.map((c) => <option key={c}>{c}</option>)}
              </select>
              <select value={commodity} onChange={(e) => setCommodity(e.target.value)} className={`${showAdvancedFilters ? "" : "hidden"} min-h-12 min-w-0 rounded-xl border border-border bg-card px-3 text-sm font-bold md:block`}>
                {commodities.map((c) => <option key={c}>{c}</option>)}
              </select>
              <select value={status} onChange={(e) => setStatus(e.target.value)} className={`${showAdvancedFilters ? "" : "hidden"} min-h-12 rounded-xl border border-border bg-card px-3 text-sm font-bold md:block`}>
                {STATUS_OPTIONS.map((s) => <option key={s}>{s}</option>)}
              </select>
            </div>
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-2">
            <div className={`${showAdvancedFilters ? "" : "hidden"} min-h-10 items-center gap-2 rounded-xl border border-border bg-card px-3 md:inline-flex`}>
              <SlidersHorizontal className="h-4 w-4 text-muted-foreground" />
              <input
                type="number"
                min="0"
                step="1"
                value={minAcres}
                onChange={(e) => setMinAcres(e.target.value)}
                placeholder="Min acres"
                className="w-24 bg-transparent text-sm outline-none"
              />
            </div>
            <DataBadge>{loading ? "Loading…" : `${displayed.length.toLocaleString()} properties`}</DataBadge>
            {hasProfessional && <DataBadge tone="blue">{linkedParcelCount.toLocaleString()} parcel-linked</DataBadge>}
            {hasProfessional && <DataBadge tone="green">{deedCount.toLocaleString()} deed refs</DataBadge>}
            {hasProfessional && (
              <>
                <button type="button" onClick={() => setVerifiedOnly((v) => !v)} className={`${showAdvancedFilters ? "inline-flex" : "hidden"} min-h-10 items-center gap-1.5 rounded-xl border px-3 text-xs font-black md:inline-flex ${verifiedOnly ? "border-sky-300 bg-sky-50 text-sky-900" : "border-border bg-card text-muted-foreground"}`}><ShieldCheck className="h-4 w-4" />Courthouse linked</button>
                <button type="button" onClick={() => setDeedOnly((v) => !v)} className={`${showAdvancedFilters ? "inline-flex" : "hidden"} min-h-10 items-center gap-1.5 rounded-xl border px-3 text-xs font-black md:inline-flex ${deedOnly ? "border-emerald-300 bg-emerald-50 text-emerald-900" : "border-border bg-card text-muted-foreground"}`}><FileText className="h-4 w-4" />Has deed ref</button>
              </>
            )}
            {(query || status !== "All" || county !== "All counties" || commodity !== "All materials" || minAcres || verifiedOnly || deedOnly || areaBounds) && (
              <button type="button" onClick={clearFilters} className="text-xs font-bold text-sky-800 hover:underline">Clear filters</button>
            )}
            {!hasProfessional && (
              <Link to="/subscribe" className="ml-auto text-xs font-bold text-sky-800 hover:underline">Unlock ownership, geology &amp; deed detail — $39/month</Link>
            )}
          </div>
        </div>
      </header>

      {error ? (
        <div className="mx-auto max-w-4xl px-6 py-10"><div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-800">{error}</div></div>
      ) : (
        <main className="relative min-h-[540px] flex-1">
          <div className="absolute inset-0">
            <QuarryMapCanvas
              sites={displayed}
              geologyMap={geologyBySite}
              parcelByMine={parcelByMine}
              verificationBySite={verificationBySite}
              premium={hasProfessional}
              selectedId={selectedId}
              onSelectSite={setSelectedId}
              onViewport={setMapView}
              countyPickMode={countyPickMode}
              minerals={showMinerals ? minerals : []}
              showParcels={showParcels && state === "TN"}
              onParcelStatus={setParcelStatus}
              onCountyPick={({ county: pickedCounty, state: pickedState }) => {
                if (pickedState && pickedState !== state) {
                  setState(pickedState);
                  setCounty(pickedCounty);
                } else {
                  setCounty(pickedCounty);
                }
                setAreaBounds(null);
                setCountyPickMode(false);
              }}
            />
          </div>

          <div className="pointer-events-none absolute left-3 top-[76px] z-[600] flex max-w-[min(230px,65vw)] flex-col items-start gap-2 sm:top-3">
            <button type="button" onClick={() => setShowMinerals((v) => !v)} aria-pressed={showMinerals}
              className={`pointer-events-auto min-h-11 rounded-xl border px-3 text-xs font-bold shadow-md backdrop-blur ${showMinerals ? "border-violet-700 bg-violet-700 text-white" : "border-slate-200 bg-white/95 text-slate-900"}`}>
              {showMinerals ? "✓ " : ""}USGS mineral deposits
            </button>
            {showMinerals && (
              <div role="status" className="rounded-lg bg-white/95 px-2 py-1 text-[11px] font-semibold text-slate-700 shadow">
                {mineralsLoading ? "Loading mineral records…" : mineralError || (minerals.length ? `${minerals.length.toLocaleString()} USGS occurrences shown (${state}, up to 1,500)` : "No USGS records returned; try another state or reload.")}
              </div>
            )}
            <button type="button" onClick={() => { setShowParcels((v) => !v); setParcelStatus(""); }} disabled={state !== "TN"} aria-pressed={showParcels}
              title={state === "TN" ? "Tennessee parcel boundaries (zoom 14+)" : "Parcel geometry currently available for Tennessee only"}
              className={`pointer-events-auto min-h-11 rounded-xl border px-3 text-xs font-bold shadow-md backdrop-blur disabled:cursor-not-allowed disabled:opacity-60 ${showParcels ? "border-sky-700 bg-sky-700 text-white" : "border-slate-200 bg-white/95 text-slate-900"}`}>
              {showParcels ? "✓ " : ""}TN parcel outlines
            </button>
            {showParcels && state === "TN" && <div role="status" className="rounded-lg bg-white/95 px-2 py-1 text-[11px] leading-4 text-slate-700 shadow">{parcelStatus || "Zoom in to see parcel outlines. Public GIS, not a survey."}</div>}
          </div>
          <div className="pointer-events-none absolute left-1/2 top-3 z-[600] flex w-full max-w-full -translate-x-1/2 flex-wrap items-center justify-center gap-2 px-3">
            {mapView.bounds && (
              <button
                type="button"
                onClick={() => { setAreaBounds(mapView.bounds); setSelectedId(null); }}
                className="pointer-events-auto min-h-11 rounded-xl border border-slate-300 bg-white/95 px-4 text-xs font-black text-slate-900 shadow-lg backdrop-blur hover:bg-white"
              >
                Search this map area
              </button>
            )}
            {areaBounds && (
              <button
                type="button"
                onClick={() => setAreaBounds(null)}
                className="pointer-events-auto min-h-11 rounded-xl border border-slate-300 bg-white/95 px-4 text-xs font-black text-sky-800 shadow-lg backdrop-blur hover:bg-white"
              >
                Show all filtered properties
              </button>
            )}
            <button
              type="button"
              onClick={() => setCountyPickMode((v) => !v)}
              className={`pointer-events-auto min-h-11 rounded-xl border px-4 text-xs font-black shadow-lg backdrop-blur ${countyPickMode ? "border-sky-500 bg-sky-600 text-white" : "border-slate-300 bg-white/95 text-slate-900 hover:bg-white"}`}
            >
              {countyPickMode ? "Tap a county on the map" : "Pick county from map"}
            </button>
          </div>

          <div className="pointer-events-none absolute bottom-4 left-4 z-[500] hidden max-w-xs rounded-2xl border border-border bg-card/95 p-3 shadow-lg backdrop-blur md:block">
            <div className="flex items-center gap-2 text-xs font-black"><Layers3 className="h-4 w-4" />Map intelligence</div>
            <div className="mt-1.5 flex items-center gap-1 text-[11px] text-muted-foreground"><MapPin className="h-3 w-3" />Tap a marker for owner, parcel, deed and geology detail; zoom out to cluster.</div>
            <div className="mt-2 border-t border-border pt-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Status ring</div>
            <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-muted-foreground">
              <span className="flex items-center gap-1"><i className="h-2.5 w-2.5 rounded-full bg-green-700" />Active</span>
              <span className="flex items-center gap-1"><i className="h-2.5 w-2.5 rounded-full bg-amber-600" />Inactive / idled</span>
              <span className="flex items-center gap-1"><i className="h-2.5 w-2.5 rounded-full bg-slate-500" />Historical</span>
              <span className="flex items-center gap-1"><i className="h-2.5 w-2.5 rounded-full bg-blue-600" />New / potential</span>
            </div>
          </div>

          {!hasProfessional && (
            <div className="absolute bottom-20 right-3 z-[500] max-w-[215px] rounded-2xl border border-sky-200 bg-white/95 p-3 shadow-lg backdrop-blur sm:bottom-4 sm:right-4 sm:max-w-[240px]">
              <p className="text-xs font-bold text-sky-950">Public quarry records</p>
              <p className="mt-1 text-[11px] leading-4 text-sky-800">Ownership, deeds, geology and opportunity scoring are inside the paid record.</p>
              <Link to={`/mines/${SAMPLE_RECORD_ID}`} className="mt-2 inline-block text-[11px] font-bold text-sky-900 underline">View a full sample record</Link>
            </div>
          )}
        </main>
      )}

      <div className="border-t border-border bg-card px-6 py-4 text-center text-[11px] leading-5 text-muted-foreground">
        Parcel, tax-map, deed, permit, geology and mine records are source-linked screening information. Tennessee GIS parcel outlines are approximate and not a legal survey. USGS occurrence locations do not establish recoverable mineral reserves. Records are not a title opinion, legal description, survey, appraisal, reserve estimate or guarantee of current ownership.
      </div>
    </div>
  );
}