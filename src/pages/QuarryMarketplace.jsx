import React, { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  Bookmark, Layers3, Loader2, Map as MapIcon, Mountain, Satellite, Search,
  SlidersHorizontal, X,
} from "lucide-react";
import BrandLogo from "@/components/BrandLogo";
import QuarryMapCanvas from "@/components/quarryMap/QuarryMapCanvas";
import PropertyCard from "@/components/marketplace/PropertyCard";
import ResultsPanel from "@/components/marketplace/ResultsPanel";
import MapLayersPanel from "@/components/marketplace/MapLayersPanel";
import SavedSearchesPanel from "@/components/marketplace/SavedSearchesPanel";
import { base44 } from "@/api/base44Client";
import { premiumEntityQuery } from "@/lib/subscriptionAccess";
import { useProfessionalAccess } from "@/hooks/useProfessionalAccess";
import { SAMPLE_RECORD_ID } from "@/lib/sampleRecord";
import { isPlausibleSoutheastCoordinate } from "@/utils/coordinates";
import { statusGroup } from "@/lib/quarryStatus";

const STATES = ["TN", "GA", "AL", "KY", "NC", "SC", "FL", "MS"];
const STATUSES = ["All", "Active", "Inactive / Idled", "Historical / Abandoned", "New / Potential"];
const BASEMAPS = [
  { id: "street", label: "Street", Icon: MapIcon },
  { id: "satellite", label: "Satellite", Icon: Satellite },
  { id: "topo", label: "Topo", Icon: Mountain },
];

function inBounds(site, bounds) {
  if (!bounds) return true;
  const lat = Number(site.latitude);
  const lng = Number(site.longitude);
  return Number.isFinite(lat) && Number.isFinite(lng) &&
    lat >= bounds.south && lat <= bounds.north && lng >= bounds.west && lng <= bounds.east;
}

export default function QuarryMarketplace() {
  const { hasProfessional, checking } = useProfessionalAccess();
  const [searchParams, setSearchParams] = useSearchParams();
  const initialState = searchParams.get("state");

  const [state, setState] = useState(STATES.includes(initialState) ? initialState : "TN");
  const [query, setQuery] = useState(searchParams.get("q") || "");
  const [status, setStatus] = useState("All");
  const [county, setCounty] = useState("All counties");
  const [commodity, setCommodity] = useState("All materials");
  const [minAcres, setMinAcres] = useState("");
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const [deedOnly, setDeedOnly] = useState(false);

  const [filtersOpen, setFiltersOpen] = useState(false);
  const [layersOpen, setLayersOpen] = useState(false);
  const [savedOpen, setSavedOpen] = useState(false);
  const [resultsOpen, setResultsOpen] = useState(false);
  const [resultLimit, setResultLimit] = useState(30);

  const [basemap, setBasemap] = useState("street");
  const [showGeology, setShowGeology] = useState(false);
  const [showCountyBoundaries, setShowCountyBoundaries] = useState(false);
  const [showMinerals, setShowMinerals] = useState(false);
  const [showParcels, setShowParcels] = useState(false);
  const [countyPickMode, setCountyPickMode] = useState(false);

  const [minerals, setMinerals] = useState([]);
  const [mineralsLoading, setMineralsLoading] = useState(false);
  const [mineralError, setMineralError] = useState("");
  const [parcelStatus, setParcelStatus] = useState("");

  const [mapView, setMapView] = useState({ zoom: 6, bounds: null });
  const [areaBounds, setAreaBounds] = useState(null);

  const [sites, setSites] = useState([]);
  const [parcels, setParcels] = useState([]);
  const [verifications, setVerifications] = useState([]);
  const [geology, setGeology] = useState([]);
  const [permits, setPermits] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [hoveredId, setHoveredId] = useState(null);
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
      setPermits([]);
      try {
        const response = await base44.functions.invoke("get-public-quarry-list", { state });
        const rows = response?.data?.sites || response?.sites || [];
        if (cancelled) return;
        setSites(
          (Array.isArray(rows) ? rows : []).filter(
            (site) => site?.id && isPlausibleSoutheastCoordinate(site.latitude, site.longitude, site.state)
          )
        );
        if (hasProfessional) {
          try {
            const [parcelRows, verifyRows, geologyRows, permitRows] = await Promise.all([
              premiumEntityQuery("ParcelRecord", { state }, "-updated_date", 500),
              premiumEntityQuery("ParcelOwnershipVerification", {}, "-verified_at", 500),
              premiumEntityQuery("GeologyRecord", { state }, "-updated_date", 500),
              premiumEntityQuery("TDECPermit", { state }, "-last_source_update", 300),
            ]);
            if (cancelled) return;
            setParcels(parcelRows || []);
            setVerifications(verifyRows || []);
            setGeology(geologyRows || []);
            setPermits(permitRows || []);
          } catch (premiumError) {
            console.error("Premium map data load failed", premiumError);
          }
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
        if (!cancelled) {
          setMinerals(payload.occurrences.filter((occurrence) =>
            Number.isFinite(Number(occurrence.latitude)) && Number.isFinite(Number(occurrence.longitude)) &&
            Number(occurrence.latitude) > 20 && Number(occurrence.latitude) < 45 && Number(occurrence.longitude) < -70
          ));
        }
      } catch {
        if (!cancelled) setMineralError("USGS mineral layer is temporarily unavailable.");
      } finally {
        if (!cancelled) setMineralsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [showMinerals, state]);

  const parcelByMine = useMemo(
    () => new Map(parcels.filter((row) => row.msha_mine_id).map((row) => [String(row.msha_mine_id), row])),
    [parcels]
  );
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

  const counties = useMemo(
    () => ["All counties", ...Array.from(new Set(sites.map((site) => site.county).filter(Boolean))).sort()],
    [sites]
  );
  const commodities = useMemo(
    () => ["All materials", ...Array.from(new Set(sites.map((site) => site.commodity).filter(Boolean))).sort().slice(0, 80)],
    [sites]
  );

  const filtered = useMemo(() => {
    const search = query.trim().toLowerCase();
    const acres = Number(minAcres);
    return sites.filter((site) => {
      const parcel = site.msha_mine_id ? parcelByMine.get(String(site.msha_mine_id)) : null;
      const verify = verificationBySite.get(site.id) || (site.msha_mine_id ? verificationBySite.get("msha:" + site.msha_mine_id) : null);
      const geo = geologyBySite.get(site.id) || (site.msha_mine_id ? geologyBySite.get("msha:" + site.msha_mine_id) : null);
      const searchable = [
        site.mine_name, site.county, site.state, site.city, site.commodity, site.msha_mine_id,
        site.operator_name, parcel?.owner_name, parcel?.parcel_id, verify?.owner_name, verify?.parcel_id,
        geo?.primary_rock, geo?.lithology, geo?.formation_name,
      ].filter(Boolean).join(" ").toLowerCase();
      if (search && !searchable.includes(search)) return false;
      if (status !== "All" && statusGroup(site.mine_status) !== status) return false;
      if (county !== "All counties" && site.county !== county) return false;
      if (commodity !== "All materials" && site.commodity !== commodity) return false;
      const siteAcres = Number(parcel?.acreage || site.acreage || 0);
      if (Number.isFinite(acres) && acres > 0 && siteAcres < acres) return false;
      if (verifiedOnly && !(verify?.status === "Verified" || parcel?.source_url)) return false;
      if (deedOnly && !(verify?.deed_book_page || parcel?.deed_book_page)) return false;
      return true;
    });
  }, [sites, query, status, county, commodity, minAcres, verifiedOnly, deedOnly, parcelByMine, verificationBySite, geologyBySite]);

  const displayed = useMemo(
    () => (areaBounds ? filtered.filter((site) => inBounds(site, areaBounds)) : filtered),
    [filtered, areaBounds]
  );
  const inView = useMemo(() => {
    // A text search covers every record in the selected state, not only pins
    // inside the current viewport. Choosing a result flies the map to it.
    const rows = query.trim() ? displayed : displayed.filter((site) => inBounds(site, mapView.bounds));
    return [...rows].sort((a, b) => String(a.mine_name || "").localeCompare(String(b.mine_name || "")));
  }, [displayed, mapView.bounds, query]);

  const selectedSite = displayed.find((site) => site.id === selectedId);
  const selectedParcel = selectedSite?.msha_mine_id ? parcelByMine.get(String(selectedSite.msha_mine_id)) : null;
  const selectedVerification = selectedSite
    ? verificationBySite.get(selectedSite.id) || (selectedSite.msha_mine_id ? verificationBySite.get("msha:" + selectedSite.msha_mine_id) : null)
    : null;
  const selectedGeology = selectedSite
    ? geologyBySite.get(selectedSite.id) || (selectedSite.msha_mine_id ? geologyBySite.get("msha:" + selectedSite.msha_mine_id) : null)
    : null;
  const selectedPermits = useMemo(() => {
    if (!selectedSite) return [];
    return permits.filter((permit) =>
      (selectedSite.msha_mine_id && permit.msha_mine_id === selectedSite.msha_mine_id) ||
      (selectedSite.tdec_permit_number && permit.permit_number === selectedSite.tdec_permit_number) ||
      (selectedSite.npdes_permit_number && permit.npdes_permit_number === selectedSite.npdes_permit_number)
    );
  }, [permits, selectedSite]);

  const activeFilterCount = [
    status !== "All",
    county !== "All counties",
    commodity !== "All materials",
    Number(minAcres) > 0,
    verifiedOnly,
    deedOnly,
  ].filter(Boolean).length;

  const currentSearch = useMemo(
    () => ({ state, query: query.trim(), status, county, commodity, minAcres, verifiedOnly, deedOnly }),
    [state, query, status, county, commodity, minAcres, verifiedOnly, deedOnly]
  );

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
    setSavedOpen(false);
    setHoveredId(null);
  };
  const applySavedSearch = (search) => {
    if (STATES.includes(search.state)) setState(search.state);
    setQuery(search.query || "");
    setStatus(search.status || "All");
    setCounty(search.county || "All counties");
    setCommodity(search.commodity || "All materials");
    setMinAcres(search.minAcres || "");
    setVerifiedOnly(Boolean(search.verifiedOnly));
    setDeedOnly(Boolean(search.deedOnly));
    setSelectedId(null);
    setAreaBounds(null);
    setSavedOpen(false);
    setResultsOpen(true);
  };
  const toggleResults = () => {
    setResultsOpen((current) => !current);
    setSelectedId(null);
    setLayersOpen(false);
    setSavedOpen(false);
    setResultLimit(30);
  };

  if (checking) {
    return (
      <div className="flex min-h-[65vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-blue-700" />
      </div>
    );
  }

  const mapControlsHidden = Boolean(selectedSite) || resultsOpen;

  return (
    <div className="flex h-[100dvh] flex-col overflow-hidden bg-slate-100 pb-[calc(66px+env(safe-area-inset-bottom,0px))] lg:pb-0">
      <header
        className="z-30 shrink-0 border-b border-slate-200 bg-white shadow-sm"
        style={{ paddingTop: "max(8px, env(safe-area-inset-top, 0px))" }}
      >
        <div className="mx-auto max-w-[1800px] px-3 pb-2.5 sm:px-5">
          <div className="flex items-center justify-between gap-2">
            <BrandLogo iconClassName="h-8 w-8" />
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => { setSavedOpen((open) => !open); setLayersOpen(false); }}
                aria-label="Saved searches"
                className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-2.5 text-xs font-bold text-slate-700 hover:border-blue-400 hover:text-blue-800"
              >
                <Bookmark className="h-4 w-4" />
                <span className="hidden sm:inline">Saved searches</span>
              </button>
              <Link
                to="/watchlist"
                className="hidden min-h-10 items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-2.5 text-xs font-bold text-slate-700 hover:border-blue-400 hover:text-blue-800 lg:inline-flex"
              >
                Watchlist
              </Link>
              {!hasProfessional && (
                <Link
                  to="/subscribe"
                  className="inline-flex min-h-10 items-center rounded-xl bg-blue-700 px-3 text-xs font-extrabold text-white hover:bg-blue-800"
                >
                  Unlock full data
                </Link>
              )}
            </div>
          </div>

          <div className="mt-2.5 flex gap-2">
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
              <input
                value={query}
                onChange={(event) => { setQuery(event.target.value); setSelectedId(null); setAreaBounds(null); }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") { setResultsOpen(true); setResultLimit(30); setLayersOpen(false); }
                }}
                placeholder="Quarry name, county, owner, rock type or MSHA ID"
                aria-label="Search quarry records"
                className="h-12 w-full rounded-xl border border-slate-300 bg-slate-50 pl-10 pr-9 text-sm font-medium text-slate-950 outline-none placeholder:text-slate-400 focus:border-blue-600 focus:bg-white focus:ring-2 focus:ring-blue-100"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  aria-label="Clear search"
                  className="absolute right-1 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center text-slate-500"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
            <select
              value={state}
              onChange={(event) => updateState(event.target.value)}
              aria-label="Choose state"
              className="h-12 w-[72px] shrink-0 rounded-xl border border-slate-300 bg-white px-2 text-sm font-extrabold text-slate-900 sm:w-[95px]"
            >
              {STATES.map((abbr) => <option value={abbr} key={abbr}>{abbr}</option>)}
            </select>
            <button
              type="button"
              onClick={() => { setFiltersOpen((open) => !open); setSavedOpen(false); }}
              aria-expanded={filtersOpen}
              className={
                "inline-flex h-12 shrink-0 items-center gap-1 rounded-xl border px-3 text-xs font-bold " +
                (filtersOpen || activeFilterCount
                  ? "border-blue-600 bg-blue-50 text-blue-900"
                  : "border-slate-300 bg-white text-slate-700")
              }
            >
              <SlidersHorizontal className="h-4 w-4" />
              <span className="hidden sm:inline">Filters</span>
              <span className="sm:hidden">Filter</span>
              {activeFilterCount ? " (" + activeFilterCount + ")" : ""}
            </button>
          </div>

          {filtersOpen && (
            <div className="mt-2.5 flex max-h-[38dvh] flex-wrap items-end gap-2 overflow-y-auto rounded-xl border border-slate-200 bg-slate-50 p-3">
              <label className="min-w-[115px] flex-1 text-[11px] font-semibold text-slate-600">
                County
                <select value={county} onChange={(event) => setCounty(event.target.value)} className="mt-1 h-10 w-full rounded-lg border border-slate-300 bg-white px-2 text-xs text-slate-900">
                  {counties.map((option) => <option key={option}>{option}</option>)}
                </select>
              </label>
              <label className="min-w-[120px] flex-1 text-[11px] font-semibold text-slate-600">
                Material
                <select value={commodity} onChange={(event) => setCommodity(event.target.value)} className="mt-1 h-10 w-full rounded-lg border border-slate-300 bg-white px-2 text-xs text-slate-900">
                  {commodities.map((option) => <option key={option}>{option}</option>)}
                </select>
              </label>
              <label className="min-w-[115px] flex-1 text-[11px] font-semibold text-slate-600">
                Status
                <select value={status} onChange={(event) => setStatus(event.target.value)} className="mt-1 h-10 w-full rounded-lg border border-slate-300 bg-white px-2 text-xs text-slate-900">
                  {STATUSES.map((option) => <option key={option}>{option}</option>)}
                </select>
              </label>
              <label className="w-24 text-[11px] font-semibold text-slate-600">
                Min. acres
                <input
                  value={minAcres}
                  onChange={(event) => setMinAcres(event.target.value)}
                  type="number"
                  min="0"
                  placeholder="Any"
                  className="mt-1 h-10 w-full rounded-lg border border-slate-300 bg-white px-2 text-xs text-slate-900"
                />
              </label>
              {hasProfessional && (
                <>
                  <label className="flex min-h-10 items-center gap-2 rounded-lg bg-white px-3 text-xs font-semibold text-slate-800">
                    <input type="checkbox" checked={verifiedOnly} onChange={(event) => setVerifiedOnly(event.target.checked)} className="accent-blue-700" />
                    Courthouse linked
                  </label>
                  <label className="flex min-h-10 items-center gap-2 rounded-lg bg-white px-3 text-xs font-semibold text-slate-800">
                    <input type="checkbox" checked={deedOnly} onChange={(event) => setDeedOnly(event.target.checked)} className="accent-blue-700" />
                    Deed reference
                  </label>
                </>
              )}
              <button type="button" onClick={clearFilters} className="min-h-10 rounded-lg px-3 text-xs font-bold text-blue-800">Clear all</button>
              <button type="button" onClick={() => setFiltersOpen(false)} className="ml-auto min-h-10 rounded-lg bg-blue-700 px-4 text-xs font-bold text-white">Show map</button>
            </div>
          )}
        </div>
      </header>

      <main className="relative flex min-h-0 flex-1">
        {error ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 px-4 text-center">
            <p className="font-bold text-slate-900">We couldn't load the quarry map.</p>
            <p className="text-sm text-slate-600">{error}</p>
            <button type="button" onClick={() => setRetryToken((count) => count + 1)} className="rounded-xl bg-blue-700 px-5 py-3 text-sm font-semibold text-white">
              Retry map
            </button>
          </div>
        ) : (
          <>
            <ResultsPanel
              variant="sidebar"
              sites={inView}
              total={displayed.length}
              loading={loading}
              query={query.trim()}
              stateCode={state}
              selectedId={selectedId}
              limit={resultLimit}
              hasProfessional={hasProfessional}
              onChoose={chooseSite}
              onHover={setHoveredId}
              onClear={clearFilters}
              onShowMore={() => setResultLimit((count) => count + 30)}
              sampleId={SAMPLE_RECORD_ID}
            />

            <div className="relative min-h-0 flex-1 bg-slate-200">
              <QuarryMapCanvas
                sites={displayed}
                geologyMap={geologyBySite}
                parcelByMine={parcelByMine}
                verificationBySite={verificationBySite}
                premium={hasProfessional}
                selectedId={selectedId}
                hoveredId={hoveredId}
                onSelectSite={chooseSite}
                onViewport={setMapView}
                viewportKey={state + "|" + query.trim() + "|" + county + "|" + commodity + "|" + status}
                resizeKey={filtersOpen}
                baseLayer={basemap}
                showGeology={showGeology}
                showCountyBoundaries={showCountyBoundaries}
                countyPickMode={countyPickMode}
                selectionOffsetPx={120}
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

              <div className="pointer-events-none absolute inset-x-0 top-2 z-[500] flex justify-center px-[124px]">
                {areaBounds ? (
                  <button
                    type="button"
                    onClick={() => setAreaBounds(null)}
                    className="pointer-events-auto rounded-full border border-blue-200 bg-white px-3.5 py-2 text-[11px] font-extrabold text-blue-800 shadow-lg"
                  >
                    Show all in {state}
                  </button>
                ) : mapView.bounds ? (
                  <button
                    type="button"
                    onClick={() => { setAreaBounds(mapView.bounds); setSelectedId(null); setResultsOpen(true); }}
                    className="pointer-events-auto rounded-full bg-blue-700 px-3.5 py-2 text-[11px] font-extrabold text-white shadow-lg hover:bg-blue-800"
                  >
                    Search this area
                  </button>
                ) : null}
              </div>

              <div className="absolute right-2 top-2 z-[520] flex items-center gap-1 rounded-full border border-slate-200 bg-white/95 p-1 shadow-lg backdrop-blur">
                {BASEMAPS.map(({ id, label, Icon }) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setBasemap(id)}
                    aria-pressed={basemap === id}
                    aria-label={label + " map"}
                    className={
                      "inline-flex min-h-9 items-center gap-1 rounded-full px-2.5 text-[11px] font-bold transition " +
                      (basemap === id ? "bg-blue-700 text-white" : "text-slate-700 hover:bg-slate-100")
                    }
                  >
                    <Icon className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">{label}</span>
                  </button>
                ))}
              </div>

              {savedOpen && (
                <SavedSearchesPanel
                  open={savedOpen}
                  current={currentSearch}
                  onApply={applySavedSearch}
                  onClose={() => setSavedOpen(false)}
                />
              )}

              {!resultsOpen && !selectedSite && (
                <div className="pointer-events-none absolute inset-x-0 bottom-3 z-[500] flex justify-center">
                  <button
                    type="button"
                    onClick={toggleResults}
                    className="pointer-events-auto inline-flex min-h-12 items-center gap-2 rounded-full border border-slate-200 bg-white px-5 text-sm font-extrabold text-slate-900 shadow-xl lg:hidden"
                  >
                    <Search className="h-4 w-4 text-blue-700" />
                    {loading ? "Loading…" : inView.length.toLocaleString() + (inView.length === 1 ? " result" : " results")}
                  </button>
                </div>
              )}

              {!resultsOpen && selectedSite && (
                <div className="pointer-events-none absolute inset-x-2 bottom-2 z-[540] sm:left-3 sm:right-auto sm:bottom-4 sm:w-[382px]">
                  <PropertyCard
                    site={selectedSite}
                    parcel={selectedParcel}
                    verification={selectedVerification}
                    geology={selectedGeology}
                    permits={selectedPermits}
                    premium={hasProfessional}
                    onClose={() => setSelectedId(null)}
                  />
                </div>
              )}

              {resultsOpen && (
                <ResultsPanel
                  variant="overlay"
                  sites={inView}
                  total={displayed.length}
                  loading={loading}
                  query={query.trim()}
                  stateCode={state}
                  selectedId={selectedId}
                  limit={resultLimit}
                  hasProfessional={hasProfessional}
                  onChoose={chooseSite}
                  onHover={setHoveredId}
                  onClose={() => { setResultsOpen(false); setHoveredId(null); }}
                  onClear={clearFilters}
                  onShowMore={() => setResultLimit((count) => count + 30)}
                  sampleId={SAMPLE_RECORD_ID}
                />
              )}

              <div
                className={
                  "absolute bottom-3 right-2 z-[560] flex-col items-end gap-2 sm:bottom-4 sm:right-3 " +
                  (mapControlsHidden ? "hidden" : "flex")
                }
              >
                {layersOpen && (
                  <MapLayersPanel
                    values={{ geology: showGeology, counties: showCountyBoundaries, minerals: showMinerals, parcels: showParcels }}
                    onToggle={(key, value) => {
                      if (key === "geology") setShowGeology(value);
                      if (key === "counties") setShowCountyBoundaries(value);
                      if (key === "minerals") setShowMinerals(value);
                      if (key === "parcels") setShowParcels(value);
                    }}
                    parcelsEnabled={state === "TN"}
                    countyPickMode={countyPickMode}
                    onToggleCountyPick={() => { setCountyPickMode((mode) => !mode); setLayersOpen(false); }}
                    mineralNote={mineralsLoading ? "Loading mineral records…" : mineralError || minerals.length.toLocaleString() + " mineral points loaded"}
                    parcelNote={parcelStatus || "Zoom to level 14 for approximate parcel boundaries."}
                    onClose={() => setLayersOpen(false)}
                  />
                )}
                <button
                  type="button"
                  onClick={() => { setLayersOpen((open) => !open); setSavedOpen(false); }}
                  aria-expanded={layersOpen}
                  className={
                    "flex min-h-11 items-center gap-2 rounded-full border px-4 text-xs font-extrabold shadow-lg " +
                    (layersOpen ? "border-blue-700 bg-blue-700 text-white" : "border-slate-200 bg-white text-slate-900")
                  }
                >
                  <Layers3 className="h-4 w-4" /> Layers
                </button>
              </div>

              {countyPickMode && (
                <div className="pointer-events-none absolute left-1/2 top-14 z-[500] w-max max-w-[85vw] -translate-x-1/2 rounded-full bg-blue-700 px-4 py-2 text-center text-xs font-bold text-white shadow-lg">
                  Tap a county on the map
                </div>
              )}
            </div>
          </>
        )}
      </main>
    </div>
  );
}