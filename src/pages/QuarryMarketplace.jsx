import React, { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  ArrowUpRight, Bookmark, ChevronDown, Layers3, List,
  Loader2, Map as MapIcon, MapPin, Search, SlidersHorizontal,
  X,
} from "lucide-react";
import BrandLogo from "@/components/BrandLogo";
import QuarryMapCanvas from "@/components/quarryMap/QuarryMapCanvas";
import { base44 } from "@/api/base44Client";
import { premiumEntityQuery } from "@/lib/subscriptionAccess";
import { useProfessionalAccess } from "@/hooks/useProfessionalAccess";
import { SAMPLE_RECORD_ID } from "@/lib/sampleRecord";
import { isPlausibleSoutheastCoordinate } from "@/utils/coordinates";
import { rockCategoryColor } from "@/lib/rockTypes";

const STATES = ["TN", "GA", "AL", "KY", "NC", "SC", "FL", "MS"];
const STATUSES = ["All", "Active", "Inactive / Idled", "Historical / Abandoned", "New / Potential"];

function statusGroup(status = "") {
  const value = String(status).toLowerCase();
  if (["intermittent", "temporarily idled", "nonproducing", "non-producing", "inactive"].some((s) => value.includes(s))) return "Inactive / Idled";
  if (value.includes("historical") || value.includes("abandon")) return "Historical / Abandoned";
  if (value.includes("active")) return "Active";
  return "New / Potential";
}

function inBounds(site, bounds) {
  if (!bounds) return true;
  const lat = Number(site.latitude);
  const lng = Number(site.longitude);
  return Number.isFinite(lat) && Number.isFinite(lng) &&
    lat >= bounds.south && lat <= bounds.north && lng >= bounds.west && lng <= bounds.east;
}

function recordLink(site) {
  return site.is_verified_listing && site.listing_id
    ? "/listings/" + site.listing_id
    : "/mines/" + site.id;
}

function acreageFor(site, parcel) {
  const acres = Number(parcel?.acreage || site?.acreage || 0);
  return Number.isFinite(acres) && acres > 0 ? acres.toLocaleString(undefined, { maximumFractionDigits: 1 }) + " acres" : null;
}

function QuarryResult({ site, onChoose, selected }) {
  return (
    <button
      type="button"
      onClick={() => onChoose(site.id)}
      className={"w-full rounded-xl border p-3 text-left transition hover:border-sky-400 hover:bg-sky-50 " +
        (selected ? "border-sky-500 bg-sky-50" : "border-slate-200 bg-white")}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="line-clamp-2 text-sm font-bold leading-5 text-slate-950">{site.mine_name || "Quarry / mine site"}</span>
        <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-sky-700" />
      </div>
      <p className="mt-1 text-xs text-slate-600">{[site.county, site.state].filter(Boolean).join(", ") || "Location on record"}</p>
      <div className="mt-2 flex flex-wrap gap-1">
        <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-semibold text-slate-700">{statusGroup(site.mine_status)}</span>
        {site.commodity && <span className="max-w-full truncate rounded-full bg-sky-50 px-2 py-1 text-[10px] font-semibold text-sky-800">{site.commodity}</span>}
      </div>
    </button>
  );
}

function QuarryDetail({ site, parcel, verification, premium, onClose }) {
  const owner = verification?.owner_name || parcel?.owner_name;
  const parcelId = verification?.parcel_id || parcel?.parcel_id || site.parcel_id;
  const deed = verification?.deed_book_page || parcel?.deed_book_page;
  const acres = acreageFor(site, parcel);
  return (
    <section aria-label="Selected quarry" className="pointer-events-auto max-h-[60dvh] w-full overflow-y-auto rounded-2xl border border-slate-200 bg-white p-4 shadow-2xl sm:max-h-[75dvh] sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-black uppercase tracking-[0.15em] text-sky-700">{site.is_verified_listing && site.listing_id ? "Verified seller listing" : "Quarry record"}</p>
          <h2 className="mt-1 line-clamp-2 text-lg font-extrabold leading-6 text-slate-950">{site.mine_name || "Quarry / mine site"}</h2>
          <p className="mt-1 flex items-center gap-1 text-xs text-slate-600"><MapPin className="h-3.5 w-3.5" />{[site.county, site.state].filter(Boolean).join(", ") || "Mapped location"}</p>
        </div>
        <button type="button" onClick={onClose} aria-label="Close quarry detail" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-700 hover:bg-slate-200"><X className="h-4 w-4" /></button>
      </div>
      <div className="mt-3 flex flex-wrap gap-2 text-xs">
        <span className="rounded-full bg-slate-700 px-2.5 py-1 font-bold text-white">{statusGroup(site.mine_status)}</span>
        {site.commodity && <span className="rounded-full bg-sky-100 px-2.5 py-1 font-semibold text-sky-900">{site.commodity}</span>}
        {acres && <span className="rounded-full bg-slate-100 px-2.5 py-1 font-semibold text-slate-800">{acres}</span>}
      </div>
      {premium ? (
        <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 border-t border-slate-100 pt-3 text-xs">
          {owner && <div><dt className="text-slate-500">Owner on record</dt><dd className="mt-0.5 break-words font-semibold text-slate-900">{owner}</dd></div>}
          {parcelId && <div><dt className="text-slate-500">Parcel</dt><dd className="mt-0.5 break-words font-semibold text-slate-900">{parcelId}</dd></div>}
          {deed && <div><dt className="text-slate-500">Deed reference</dt><dd className="mt-0.5 break-words font-semibold text-slate-900">{deed}</dd></div>}
          {site.msha_mine_id && <div><dt className="text-slate-500">MSHA ID</dt><dd className="mt-0.5 font-semibold text-slate-900">{site.msha_mine_id}</dd></div>}
        </dl>
      ) : (
        <p className="mt-3 text-xs leading-5 text-slate-600">Explore the location free. Available ownership, parcel, deed, geology and permit details are in Full Quarry Intelligence.</p>
      )}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Link to={recordLink(site)} className="inline-flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-xl bg-blue-700 px-4 text-sm font-bold text-white hover:bg-blue-800">
          View full record <ArrowUpRight className="h-4 w-4" />
        </Link>
        {!premium && <Link to="/subscribe" className="inline-flex min-h-11 items-center justify-center rounded-xl border border-blue-200 bg-blue-50 px-3 text-xs font-bold text-blue-800">Unlock details</Link>}
      </div>
      <p className="mt-2 text-[10px] leading-4 text-slate-500">Source-linked screening data; not a survey, title opinion or reserve estimate.</p>
    </section>
  );
}

export default function QuarryMarketplace() {
  const { hasProfessional, checking } = useProfessionalAccess();
  const [searchParams, setSearchParams] = useSearchParams();
  const initialState = searchParams.get("state");
  const [state, setState] = useState(STATES.includes(initialState) ? initialState : "TN");
  const [query, setQuery] = useState(searchParams.get("q") || "");
  const [status, setStatus] = useState("All");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [layersOpen, setLayersOpen] = useState(false);
  const [resultsOpen, setResultsOpen] = useState(false);
  const [resultLimit, setResultLimit] = useState(30);
  const [satellite, setSatellite] = useState(false);
  const [showMinerals, setShowMinerals] = useState(false);
  const [showParcels, setShowParcels] = useState(false);
  const [showGeology, setShowGeology] = useState(false);
  const [showCountyBoundaries, setShowCountyBoundaries] = useState(false);
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
  const [retryToken, setRetryToken] = useState(0);
  const [error, setError] = useState("");

  useEffect(() => {
    if (checking) return undefined;
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError("");
      setSites([]);
      setParcels([]);
      setVerifications([]);
      setGeology([]);
      try {
        const response = await base44.functions.invoke("get-public-quarry-list", { state });
        const rows = response?.data?.sites || response?.sites || [];
        if (cancelled) return;
        setSites((Array.isArray(rows) ? rows : []).filter((site) => site?.id && isPlausibleSoutheastCoordinate(site.latitude, site.longitude, site.state)));
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
            console.error("Premium map data load failed", premiumError);
          }
        } else {
          setParcels([]);
          setVerifications([]);
          setGeology([]);
        }
      } catch (failure) {
        if (!cancelled) setError(failure?.message || "The quarry map could not load.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [checking, hasProfessional, state, retryToken]);

  useEffect(() => {
    const next = {};
    if (query.trim()) next.q = query.trim();
    if (state) next.state = state;
    setSearchParams(next, { replace: true });
  }, [query, state, setSearchParams]);

  useEffect(() => {
    if (!showMinerals) {
      setMinerals([]);
      setMineralError("");
      setMineralsLoading(false);
      return undefined;
    }
    let cancelled = false;
    setMineralsLoading(true);
    setMineralError("");
    (async () => {
      try {
        const response = await base44.functions.invoke("get-public-mineral-occurrences", { state });
        const payload = response?.data || response || {};
        if (payload?.error) throw new Error(payload.error);
        if (!Array.isArray(payload.occurrences)) throw new Error("No mineral dataset returned");
        if (!cancelled) setMinerals(payload.occurrences.filter((o) =>
          Number.isFinite(Number(o.latitude)) && Number.isFinite(Number(o.longitude)) &&
          Number(o.latitude) > 20 && Number(o.latitude) < 45 && Number(o.longitude) < -70
        ));
      } catch {
        if (!cancelled) setMineralError("USGS mineral layer is temporarily unavailable.");
      } finally {
        if (!cancelled) setMineralsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [showMinerals, state]);

  const parcelByMine = useMemo(() => new Map(parcels.filter((p) => p.msha_mine_id).map((p) => [String(p.msha_mine_id), p])), [parcels]);
  const verificationBySite = useMemo(() => {
    const map = new Map();
    for (const row of verifications) {
      if (row.mining_site_id && !map.has(row.mining_site_id)) map.set(row.mining_site_id, row);
      if (row.msha_mine_id && !map.has("msha:" + row.msha_mine_id)) map.set("msha:" + row.msha_mine_id, row);
    }
    return map;
  }, [verifications]);
  const geologyBySite = useMemo(() => {
    const map = new Map();
    for (const row of geology) {
      if (row.mining_site_id) map.set(row.mining_site_id, row);
      if (row.msha_mine_id) map.set("msha:" + row.msha_mine_id, row);
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
      const verify = verificationBySite.get(site.id) || (site.msha_mine_id ? verificationBySite.get("msha:" + site.msha_mine_id) : null);
      const searchable = [site.mine_name, site.county, site.state, site.city, site.commodity, site.msha_mine_id,
        site.operator_name, parcel?.owner_name, parcel?.parcel_id, verify?.owner_name, verify?.parcel_id]
        .filter(Boolean).join(" ").toLowerCase();
      if (q && !searchable.includes(q)) return false;
      if (status !== "All" && statusGroup(site.mine_status) !== status) return false;
      if (county !== "All counties" && site.county !== county) return false;
      if (commodity !== "All materials" && site.commodity !== commodity) return false;
      const siteAcres = Number(parcel?.acreage || site.acreage || 0);
      if (Number.isFinite(acres) && acres > 0 && siteAcres < acres) return false;
      if (verifiedOnly && !(verify?.status === "Verified" || parcel?.source_url)) return false;
      if (deedOnly && !(verify?.deed_book_page || parcel?.deed_book_page)) return false;
      return true;
    });
  }, [sites, query, status, county, commodity, minAcres, verifiedOnly, deedOnly, parcelByMine, verificationBySite]);

  const displayed = useMemo(() => areaBounds ? filtered.filter((site) => inBounds(site, areaBounds)) : filtered, [filtered, areaBounds]);
  const inView = useMemo(() => {
    // Text searches cover every record in the selected state, not only pins
    // currently visible in the viewport. Selecting a result flies to it.
    const rows = query.trim() ? displayed : displayed.filter((site) => inBounds(site, mapView.bounds));
    return rows.sort((a, b) => String(a.mine_name || "").localeCompare(String(b.mine_name || "")));
  }, [displayed, mapView.bounds, query]);
  const selectedSite = displayed.find((s) => s.id === selectedId);
  const selectedParcel = selectedSite?.msha_mine_id ? parcelByMine.get(String(selectedSite.msha_mine_id)) : null;
  const selectedVerification = selectedSite ? (verificationBySite.get(selectedSite.id) || (selectedSite.msha_mine_id ? verificationBySite.get("msha:" + selectedSite.msha_mine_id) : null)) : null;
  const activeFilterCount = [status !== "All", county !== "All counties", commodity !== "All materials",
    Number(minAcres) > 0, verifiedOnly, deedOnly].filter(Boolean).length;

  const updateState = (next) => {
    if (!STATES.includes(next) || next === state) return;
    setState(next);
    setCounty("All counties");
    setCommodity("All materials");
    setAreaBounds(null);
    setSelectedId(null);
    setResultsOpen(false);
    setCountyPickMode(false);
    setShowParcels(false);
  };
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
  const chooseSite = (id) => {
    setSelectedId(id);
    setResultsOpen(false);
    setLayersOpen(false);
  };
  const toggleResults = () => {
    setResultsOpen((current) => !current);
    setSelectedId(null);
    setLayersOpen(false);
    setResultLimit(30);
  };

  if (checking) {
    return <div className="flex min-h-[65vh] items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-blue-700" /></div>;
  }

  return (
    <div className="flex h-[100dvh] flex-col overflow-hidden bg-slate-50 pb-[calc(66px+env(safe-area-inset-bottom,0px))] lg:pb-0">
      <header className="z-20 shrink-0 border-b border-slate-200 bg-white px-3 pb-3 shadow-sm sm:px-5" style={{ paddingTop: "max(10px, env(safe-area-inset-top, 0px))" }}>
        <div className="mx-auto max-w-[1700px]">
          <div className="flex items-center justify-between gap-3">
            <BrandLogo iconClassName="h-8 w-8" />
            <div className="flex items-center gap-3">
              <Link to="/discover" className="hidden text-xs font-bold text-slate-600 hover:text-blue-700 sm:inline">About S&amp;S</Link>
              <Link to="/sell" className="hidden text-xs font-bold text-slate-600 hover:text-blue-700 lg:inline">List property</Link>
              <Link to="/watchlist" className="hidden items-center gap-1 text-xs font-bold text-slate-600 hover:text-blue-700 lg:inline-flex"><Bookmark className="h-4 w-4" /> Saved</Link>
              {!hasProfessional && <Link to="/subscribe" className="inline-flex min-h-10 items-center rounded-xl bg-blue-700 px-3 text-xs font-extrabold text-white hover:bg-blue-800">Unlock full data</Link>}
            </div>
          </div>
          <div className="mt-3 flex gap-2">
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
              <input
                value={query}
                onChange={(event) => { setQuery(event.target.value); setSelectedId(null); setAreaBounds(null); }}
                onKeyDown={(event) => { if (event.key === "Enter") { setResultsOpen(true); setResultLimit(30); setLayersOpen(false); } }}
                placeholder="Find a quarry, county, rock type or mine ID"
                aria-label="Search quarry records"
                className="h-12 w-full rounded-xl border border-slate-300 bg-slate-50 pl-10 pr-9 text-sm font-medium text-slate-950 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
              />
              {query && <button type="button" onClick={() => setQuery("")} aria-label="Clear search" className="absolute right-1 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center text-slate-600"><X className="h-4 w-4" /></button>}
            </div>
            <select value={state} onChange={(event) => updateState(event.target.value)} aria-label="Choose state" className="h-12 w-[72px] shrink-0 rounded-xl border border-slate-300 bg-white px-2 text-sm font-extrabold text-slate-900 sm:w-[95px]">
              {STATES.map((abbr) => <option value={abbr} key={abbr}>{abbr}</option>)}
            </select>
            <button type="button" onClick={() => setFiltersOpen((v) => !v)} aria-expanded={filtersOpen} className={"inline-flex h-12 shrink-0 items-center gap-1 rounded-xl border px-3 text-xs font-bold " + (filtersOpen || activeFilterCount ? "border-blue-500 bg-blue-50 text-blue-900" : "border-slate-300 bg-white text-slate-700")}>
              <SlidersHorizontal className="h-4 w-4" /><span className="hidden sm:inline">Filters</span><span className="sm:hidden">Filter</span>{activeFilterCount ? " (" + activeFilterCount + ")" : ""}
            </button>
          </div>
          {filtersOpen && (
            <div className="mt-3 flex max-h-[35dvh] flex-wrap items-end gap-2 overflow-y-auto rounded-xl border border-slate-200 bg-slate-50 p-3">
              <label className="min-w-[115px] flex-1 text-[11px] font-semibold text-slate-600">County
                <select value={county} onChange={(e) => setCounty(e.target.value)} className="mt-1 h-10 w-full rounded-lg border border-slate-300 bg-white px-2 text-xs text-slate-900">{counties.map((c) => <option key={c}>{c}</option>)}</select>
              </label>
              <label className="min-w-[120px] flex-1 text-[11px] font-semibold text-slate-600">Material
                <select value={commodity} onChange={(e) => setCommodity(e.target.value)} className="mt-1 h-10 w-full rounded-lg border border-slate-300 bg-white px-2 text-xs text-slate-900">{commodities.map((c) => <option key={c}>{c}</option>)}</select>
              </label>
              <label className="min-w-[115px] flex-1 text-[11px] font-semibold text-slate-600">Status
                <select value={status} onChange={(e) => setStatus(e.target.value)} className="mt-1 h-10 w-full rounded-lg border border-slate-300 bg-white px-2 text-xs text-slate-900">{STATUSES.map((s) => <option key={s}>{s}</option>)}</select>
              </label>
              <label className="w-24 text-[11px] font-semibold text-slate-600">Min. acres
                <input value={minAcres} onChange={(e) => setMinAcres(e.target.value)} type="number" min="0" placeholder="Any" className="mt-1 h-10 w-full rounded-lg border border-slate-300 bg-white px-2 text-xs text-slate-900" />
              </label>
              {hasProfessional && (
                <>
                  <label className="flex min-h-10 items-center gap-2 rounded-lg bg-white px-3 text-xs font-semibold text-slate-800"><input type="checkbox" checked={verifiedOnly} onChange={(e) => setVerifiedOnly(e.target.checked)} />Courthouse linked</label>
                  <label className="flex min-h-10 items-center gap-2 rounded-lg bg-white px-3 text-xs font-semibold text-slate-800"><input type="checkbox" checked={deedOnly} onChange={(e) => setDeedOnly(e.target.checked)} />Deed reference</label>
                </>
              )}
              <button type="button" onClick={clearFilters} className="min-h-10 rounded-lg px-3 text-xs font-bold text-blue-800">Clear all</button>
              <button type="button" onClick={() => setFiltersOpen(false)} className="ml-auto min-h-10 rounded-lg bg-blue-700 px-4 text-xs font-bold text-white">Show map</button>
            </div>
          )}
        </div>
      </header>

      <main className="relative min-h-0 flex-1 overflow-hidden bg-slate-200" aria-label="Interactive quarry map">
        {error ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 px-4 text-center">
            <p className="font-bold text-slate-900">We couldn't load the quarry map.</p>
            <p className="text-sm text-slate-600">{error}</p>
            <button type="button" onClick={() => setRetryToken((n) => n + 1)} className="rounded-xl bg-blue-700 px-5 py-3 text-sm font-semibold text-white">Retry map</button>
          </div>
        ) : (
          <QuarryMapCanvas
            sites={displayed}
            geologyMap={geologyBySite}
            parcelByMine={parcelByMine}
            verificationBySite={verificationBySite}
            premium={hasProfessional}
            selectedId={selectedId}
            onSelectSite={chooseSite}
            onViewport={setMapView}
            viewportKey={state}
            resizeKey={filtersOpen}
            baseLayer={satellite ? "satellite" : "street"}
            showGeology={showGeology}
            showCountyBoundaries={showCountyBoundaries}
            countyPickMode={countyPickMode}
            onCountyPick={({ county: pickedCounty, state: pickedState }) => {
              if (pickedState && pickedState !== state) updateState(pickedState);
              setCounty(pickedCounty || "All counties");
              setCountyPickMode(false);
              setAreaBounds(null);
            }}
            minerals={showMinerals ? minerals : []}
            showParcels={showParcels && state === "TN"}
            onParcelStatus={setParcelStatus}
          />
        )}

        <div className="pointer-events-none absolute left-1/2 top-3 z-[500] flex w-full -translate-x-1/2 justify-center px-20">
          {areaBounds ? (
            <button type="button" onClick={() => setAreaBounds(null)} className="pointer-events-auto rounded-full border border-blue-200 bg-white px-4 py-2.5 text-xs font-extrabold text-blue-800 shadow-lg">Show all in {state}</button>
          ) : mapView.bounds && (
            <button type="button" onClick={() => { setAreaBounds(mapView.bounds); setSelectedId(null); setResultsOpen(true); }} className="pointer-events-auto rounded-full bg-blue-700 px-4 py-2.5 text-xs font-extrabold text-white shadow-lg">Search this area</button>
          )}
        </div>

        {!resultsOpen && !selectedSite && (
          <div className="pointer-events-none absolute bottom-4 left-3 z-[500] sm:bottom-5 sm:left-5">
            <button type="button" onClick={toggleResults} className="pointer-events-auto inline-flex min-h-12 items-center gap-2 rounded-full border border-slate-200 bg-white px-4 text-sm font-extrabold text-slate-900 shadow-xl">
              <List className="h-4 w-4 text-blue-700" />{loading ? "Loading…" : "View " + inView.length.toLocaleString() + " results"}
            </button>
          </div>
        )}

        {!resultsOpen && selectedSite && (
          <div className="pointer-events-none absolute bottom-3 left-3 z-[500] w-[min(400px,calc(100%-24px))] sm:bottom-5 sm:left-5">
            <QuarryDetail site={selectedSite} parcel={selectedParcel} verification={selectedVerification} premium={hasProfessional} onClose={() => setSelectedId(null)} />
          </div>
        )}

        {resultsOpen && (
          <aside aria-label="Quarries in map view" className="absolute bottom-3 left-3 top-14 z-[550] flex w-[min(370px,calc(100%-24px))] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl sm:bottom-5 sm:left-5 sm:top-4">
            <div className="flex items-start justify-between gap-2 border-b border-slate-100 px-4 py-3">
              <div>
                <h2 className="text-base font-extrabold text-slate-950">{query.trim() ? "Search results" : "Quarries on this map"}</h2>
                <p className="mt-0.5 text-xs text-slate-500">{loading ? "Loading records…" : inView.length.toLocaleString() + (query.trim() ? " matching records in " + state : " in view · " + displayed.length.toLocaleString() + " total matches")}</p>
              </div>
              <button type="button" onClick={() => setResultsOpen(false)} aria-label="Close results" className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-700"><X className="h-4 w-4" /></button>
            </div>
            <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
              {loading ? <div className="flex items-center gap-2 p-4 text-sm text-slate-600"><Loader2 className="h-4 w-4 animate-spin" />Loading quarries…</div> :
                inView.length === 0 ? (
                  <div className="p-5 text-center text-sm leading-6 text-slate-600">
                    No matching records. Try a different search term, move the map, or choose another state.
                    <button type="button" onClick={clearFilters} className="mt-3 block w-full rounded-xl bg-blue-700 px-3 py-2.5 text-xs font-bold text-white">Clear filters</button>
                  </div>
                ) : (
                  <>
                    {inView.slice(0, resultLimit).map((site) => <QuarryResult key={site.id} site={site} selected={site.id === selectedId} onChoose={chooseSite} />)}
                    {inView.length > resultLimit && <button type="button" onClick={() => setResultLimit((n) => n + 30)} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-xs font-bold text-slate-800">Show more quarries <ChevronDown className="ml-1 inline h-4 w-4" /></button>}
                  </>
                )}
            </div>
            {!hasProfessional && <Link to={"/mines/" + SAMPLE_RECORD_ID} className="border-t border-slate-100 px-4 py-3 text-center text-xs font-bold text-blue-700">Explore a complete sample record <ArrowUpRight className="inline h-3.5 w-3.5" /></Link>}
          </aside>
        )}

        <div className={"absolute bottom-4 right-3 z-[560] flex-col items-end gap-2 sm:bottom-5 sm:right-5 sm:flex " + ((selectedSite || resultsOpen) ? "hidden" : "flex")}>
          {layersOpen && (
            <div className="w-[235px] max-w-[65vw] rounded-2xl border border-slate-200 bg-white p-3 shadow-2xl">
              <div className="mb-2 flex items-center justify-between"><strong className="text-sm text-slate-900">Map layers</strong><button type="button" onClick={() => setLayersOpen(false)} aria-label="Close layers" className="flex h-8 w-8 items-center justify-center text-slate-500"><X className="h-4 w-4" /></button></div>
              {[
                { label: "Bedrock geology", value: showGeology, update: setShowGeology },
                { label: "County boundaries", value: showCountyBoundaries, update: setShowCountyBoundaries },
                { label: "USGS mineral deposits", value: showMinerals, update: setShowMinerals },
                { label: "TN parcel outlines", value: showParcels, update: setShowParcels, disabled: state !== "TN" },
              ].map((layer) => (
                <label key={layer.label} className={"flex min-h-10 items-center gap-2 border-t border-slate-100 text-xs font-semibold text-slate-800 " + (layer.disabled ? "opacity-50" : "")}>
                  <input type="checkbox" checked={layer.value} onChange={(e) => layer.update(e.target.checked)} disabled={layer.disabled} className="h-4 w-4 accent-blue-700" />
                  {layer.label}
                </label>
              ))}
              <div className="mt-3 border-t border-slate-200 pt-3">
                <p className="text-[11px] font-bold text-slate-900">Marker colors · rock type</p>
                <div className="mt-2 grid grid-cols-2 gap-x-2 gap-y-2">
                  {["Limestone", "Granite", "Quartzite", "Sandstone", "Sand & gravel", "Clay"].map((rock) => (
                    <div key={rock} className="flex items-center gap-1.5 text-[10px] text-slate-700">
                      <span className="h-3 w-3 shrink-0 rounded-full border border-white shadow-sm" style={{ backgroundColor: rockCategoryColor(rock) }} />
                      <span>{rock}</span>
                    </div>
                  ))}
                </div>
              </div>
              <button type="button" onClick={() => { setCountyPickMode((v) => !v); setLayersOpen(false); }} className="mt-3 w-full rounded-lg bg-slate-100 px-2 py-2.5 text-xs font-bold text-slate-800">{countyPickMode ? "Cancel county picker" : "Pick county on map"}</button>
              {showMinerals && <p className="mt-2 text-[11px] text-slate-500">{mineralsLoading ? "Loading mineral records…" : mineralError || minerals.length.toLocaleString() + " mineral points loaded"}</p>}
              {showParcels && state === "TN" && <p className="mt-1 text-[11px] text-slate-500">{parcelStatus || "Zoom to level 14 for approximate parcel boundaries."}</p>}
              <Link to="/data-sources" className="mt-3 block border-t border-slate-100 pt-2 text-[11px] font-bold text-blue-700">Data sources and limitations</Link>
            </div>
          )}
          <button type="button" onClick={() => setSatellite((v) => !v)} aria-pressed={satellite} className="flex min-h-11 items-center gap-2 rounded-full border border-slate-200 bg-white px-4 text-xs font-extrabold text-slate-900 shadow-lg">
            <MapIcon className="h-4 w-4 text-blue-700" />{satellite ? "Street map" : "Satellite"}
          </button>
          <button type="button" onClick={() => setLayersOpen((v) => !v)} aria-expanded={layersOpen} className={"flex min-h-11 items-center gap-2 rounded-full border px-4 text-xs font-extrabold shadow-lg " + (layersOpen ? "border-blue-700 bg-blue-700 text-white" : "border-slate-200 bg-white text-slate-900")}>
            <Layers3 className="h-4 w-4" />Layers
          </button>
        </div>

        {countyPickMode && <div className="pointer-events-none absolute left-1/2 top-16 z-[500] w-max max-w-[85vw] -translate-x-1/2 rounded-full bg-blue-700 px-4 py-2 text-center text-xs font-bold text-white shadow-lg">Tap a county on the map</div>}
      </main>
    </div>
  );
}
