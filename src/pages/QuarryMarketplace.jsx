import React, { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  Building2, Database, ExternalLink, FileText, Layers3, List, Loader2,
  LockKeyhole, Map as MapIcon, MapPin, Mountain, Search, ShieldCheck, SlidersHorizontal, X
} from "lucide-react";
import {
  CircleMarker, LayersControl, MapContainer, Popup, TileLayer, Tooltip, useMap, useMapEvents, WMSTileLayer
} from "react-leaflet";
import "leaflet/dist/leaflet.css";
import BrandLogo from "@/components/BrandLogo";
import { premiumEntityQuery } from "@/lib/subscriptionAccess";
import { useProfessionalAccess } from "@/hooks/useProfessionalAccess";
import { isPlausibleSoutheastCoordinate } from "@/utils/coordinates";
import { rockCategoryColor, rockCategoryFor } from "../../base44/shared/rockTypes";

const STATES = ["TN", "GA", "AL", "KY", "NC", "SC", "FL", "MS"];
const STATUS_OPTIONS = ["All", "Active", "Inactive / Idled", "Historical / Abandoned", "New / Potential"];
const USGS_GEOLOGY_WMS = "https://mrdata.usgs.gov/services/sgmc/wms";
const CENSUS_COUNTY_WMS = "https://tigerweb.geo.census.gov/arcgis/services/TIGERweb/tigerWMS_ACS2026/MapServer/WMSServer";
const DEFAULT_CENTER = [34.6, -85.4];

function statusColor(group) {
  if (group === "Active") return "#15803d";
  if (group === "Inactive / Idled") return "#d97706";
  if (group === "Historical / Abandoned") return "#64748b";
  return "#2563eb";
}

function withinBounds(site, bounds) {
  if (!bounds) return true;
  const lat = Number(site.latitude);
  const lng = Number(site.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  return lat >= bounds.south && lat <= bounds.north && lng >= bounds.west && lng <= bounds.east;
}

function clusterSites(sites, zoom) {
  if (zoom >= 9) return sites.map((site) => ({ kind: "site", site }));
  const cell = zoom <= 5 ? 1.25 : zoom === 6 ? 0.7 : zoom === 7 ? 0.35 : 0.18;
  const groups = new Map();
  for (const site of sites) {
    const lat = Number(site.latitude);
    const lng = Number(site.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    const key = `${Math.floor(lat / cell)}:${Math.floor(lng / cell)}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(site);
  }
  return Array.from(groups.values()).map((group) => {
    if (group.length === 1) return { kind: "site", site: group[0] };
    return {
      kind: "cluster",
      sites: group,
      lat: group.reduce((sum, s) => sum + Number(s.latitude), 0) / group.length,
      lng: group.reduce((sum, s) => sum + Number(s.longitude), 0) / group.length,
    };
  });
}

function statusGroup(status = "") {
  const s = String(status).toLowerCase();
  if (s.includes("intermittent") || s.includes("temporarily idled") || s.includes("nonproducing") || s.includes("non-producing") || s.includes("inactive")) return "Inactive / Idled";
  if (s.includes("historical") || s.includes("abandon")) return "Historical / Abandoned";
  if (s.includes("active")) return "Active";
  return "New / Potential";
}

function formatDate(value) {
  if (!value) return "Not dated";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleDateString();
}

function MapViewportTracker({ onChange }) {
  useMapEvents({
    moveend(event) {
      const map = event.target;
      const b = map.getBounds();
      onChange({
        zoom: map.getZoom(),
        bounds: { south: b.getSouth(), west: b.getWest(), north: b.getNorth(), east: b.getEast() },
      });
    },
    zoomend(event) {
      const map = event.target;
      const b = map.getBounds();
      onChange({
        zoom: map.getZoom(),
        bounds: { south: b.getSouth(), west: b.getWest(), north: b.getNorth(), east: b.getEast() },
      });
    },
  });
  return null;
}

function ClusterBubble({ cluster }) {
  const map = useMap();
  const count = cluster.sites.length;
  return (
    <CircleMarker
      center={[cluster.lat, cluster.lng]}
      radius={Math.min(24, 10 + Math.log2(count + 1) * 3)}
      pathOptions={{ color: "#fff", weight: 2.5, fillColor: "#0f172a", fillOpacity: 0.92 }}
      eventHandlers={{ click: () => map.flyTo([cluster.lat, cluster.lng], Math.min(11, map.getZoom() + 2), { duration: 0.5 }) }}
    >
      <Tooltip permanent direction="center" className="ss-map-cluster-count">{count}</Tooltip>
    </CircleMarker>
  );
}

function MapController({ sites, selectedId }) {
  const map = useMap();

  useEffect(() => {
    if (!sites.length) return;
    const selected = sites.find((s) => s.id === selectedId);
    if (selected) {
      map.flyTo([Number(selected.latitude), Number(selected.longitude)], Math.max(map.getZoom(), 11), { duration: 0.6 });
      return;
    }
    const points = sites
      .slice(0, 250)
      .map((s) => [Number(s.latitude), Number(s.longitude)])
      .filter(([lat, lng]) => Number.isFinite(lat) && Number.isFinite(lng));
    if (!points.length) return;
    if (points.length === 1) map.setView(points[0], 10);
    else map.fitBounds(points, { padding: [28, 28], maxZoom: 9 });
  }, [map, selectedId, sites]);

  return null;
}

function DataBadge({ children, tone = "slate" }) {
  const tones = {
    slate: "border-slate-200 bg-slate-50 text-slate-700",
    green: "border-emerald-200 bg-emerald-50 text-emerald-800",
    blue: "border-sky-200 bg-sky-50 text-sky-800",
    amber: "border-amber-200 bg-amber-50 text-amber-800",
  };
  return <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-bold ${tones[tone] || tones.slate}`}>{children}</span>;
}

function PropertyCard({ site, parcel, verification, selected, onSelect }) {
  const rock = site.commodity || "Material not classified";
  const group = statusGroup(site.mine_status);
  const owner = verification?.owner_name || parcel?.owner_name;
  const parcelId = verification?.parcel_id || parcel?.parcel_id || site.parcel_id;
  const acreage = parcel?.acreage || site.acreage;
  const deed = verification?.deed_book_page || parcel?.deed_book_page;
  const verified = verification?.status === "Verified" || Boolean(parcel?.source_url);

  return (
    <article
      className={`rounded-2xl border bg-card p-4 transition ${selected ? "border-sky-500 ring-2 ring-sky-100" : "border-border hover:border-slate-300"}`}
    >
      <button type="button" onClick={onSelect} className="w-full text-left">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap gap-2">
              <DataBadge tone={group === "Active" ? "green" : group === "Inactive / Idled" ? "amber" : "slate"}>{group}</DataBadge>
              {verified && <DataBadge tone="blue"><ShieldCheck className="mr-1 h-3 w-3" />Courthouse-linked</DataBadge>}
            </div>
            <h3 className="mt-3 line-clamp-2 font-heading text-lg font-black text-foreground">{site.mine_name || "Quarry / Mine Site"}</h3>
            <p className="mt-1 flex items-center gap-1 text-sm text-muted-foreground"><MapPin className="h-3.5 w-3.5" />{[site.county, site.state].filter(Boolean).join(", ") || "Location on file"}</p>
          </div>
          <div className="rounded-xl bg-slate-950 px-2.5 py-2 text-center text-white">
            <div className="text-[9px] font-bold uppercase tracking-wider text-slate-300">Rock</div>
            <div className="mt-0.5 max-w-[95px] truncate text-xs font-bold">{rock}</div>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2">
          <div className="rounded-xl bg-muted/40 p-2.5">
            <div className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">Parcel acres</div>
            <div className="mt-1 text-sm font-black">{Number(acreage) > 0 ? Number(acreage).toLocaleString() : "—"}</div>
          </div>
          <div className="rounded-xl bg-muted/40 p-2.5">
            <div className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">Permit acres</div>
            <div className="mt-1 text-sm font-black">{Number(site.permitted_acres) > 0 ? Number(site.permitted_acres).toLocaleString() : "—"}</div>
          </div>
          <div className="rounded-xl bg-muted/40 p-2.5">
            <div className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">Source</div>
            <div className="mt-1 truncate text-sm font-black">{site.source || "Public"}</div>
          </div>
        </div>

        <div className="mt-4 space-y-2 border-t border-border pt-3 text-xs">
          <div className="flex items-start justify-between gap-3"><span className="text-muted-foreground">Owner</span><strong className="max-w-[65%] text-right">{owner || "Open record"}</strong></div>
          <div className="flex items-start justify-between gap-3"><span className="text-muted-foreground">Parcel / tax map</span><strong className="max-w-[65%] truncate text-right">{parcelId || "—"}</strong></div>
          <div className="flex items-start justify-between gap-3"><span className="text-muted-foreground">Deed reference</span><strong>{deed || "—"}</strong></div>
        </div>
      </button>

      <div className="mt-4 flex gap-2">
        <Link to={`/mines/${site.id}`} className="inline-flex min-h-11 flex-1 items-center justify-center rounded-xl bg-slate-950 px-3 text-xs font-bold text-white hover:bg-slate-800">
          Open full intelligence
        </Link>
        {(verification?.source_url || parcel?.source_url) && (
          <a
            href={verification?.source_url || parcel?.source_url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex min-h-11 items-center justify-center rounded-xl border border-border px-3 text-xs font-bold"
            title="Open source record"
          >
            <ExternalLink className="h-4 w-4" />
          </a>
        )}
      </div>
    </article>
  );
}

export default function QuarryMarketplace() {
  const { hasProfessional, checking } = useProfessionalAccess();
  const [searchParams, setSearchParams] = useSearchParams();
  const [state, setState] = useState(searchParams.get("state") || "TN");
  const [query, setQuery] = useState(searchParams.get("q") || "");
  const [status, setStatus] = useState("All");
  const [county, setCounty] = useState("All counties");
  const [commodity, setCommodity] = useState("All materials");
  const [minAcres, setMinAcres] = useState("");
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const [deedOnly, setDeedOnly] = useState(false);
  const [mapView, setMapView] = useState({ zoom: 6, bounds: null });
  const [areaBounds, setAreaBounds] = useState(null);
  const [sites, setSites] = useState([]);
  const [parcels, setParcels] = useState([]);
  const [verifications, setVerifications] = useState([]);
  const [geology, setGeology] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [mobileView, setMobileView] = useState("list");
  const [error, setError] = useState("");

  useEffect(() => {
    if (checking || !hasProfessional) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError("");
      try {
        const [siteRows, parcelRows, verifyRows, geologyRows] = await Promise.all([
          premiumEntityQuery("MiningSite", { state }, "-updated_date", 500),
          premiumEntityQuery("ParcelRecord", { state }, "-updated_date", 500),
          premiumEntityQuery("ParcelOwnershipVerification", {}, "-verified_at", 500),
          premiumEntityQuery("GeologyRecord", { state }, "-updated_date", 500),
        ]);
        if (cancelled) return;
        setSites((siteRows || []).filter((s) => s?.id && isPlausibleSoutheastCoordinate(s.latitude, s.longitude, s.state)));
        setParcels(parcelRows || []);
        setVerifications(verifyRows || []);
        setGeology(geologyRows || []);
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
    () => areaBounds ? filtered.filter((site) => withinBounds(site, areaBounds)) : filtered,
    [filtered, areaBounds]
  );
  const clusterItems = useMemo(() => clusterSites(displayed.slice(0, 450), mapView.zoom), [displayed, mapView.zoom]);

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

  if (!hasProfessional) {
    return (
      <main className="mx-auto max-w-4xl px-6 py-16">
        <div className="rounded-3xl border border-slate-700 bg-slate-950 p-8 text-white sm:p-10">
          <LockKeyhole className="h-8 w-8 text-sky-300" />
          <h1 className="mt-5 font-heading text-3xl font-black">Interactive Quarry Property Map</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300">The live map includes quarry locations, parcel/tax-map links, ownership records, deed references when available, geology and source-linked intelligence. Full access is included with the $69/month membership.</p>
          <Link to="/subscribe" className="mt-7 inline-flex min-h-12 items-center justify-center rounded-xl bg-sky-600 px-6 text-sm font-bold text-white">Unlock Full Intelligence — $69/month</Link>
        </div>
      </main>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-[1000] border-b border-border bg-background/95 backdrop-blur" style={{ paddingTop: "env(safe-area-inset-top, 12px)" }}>
        <div className="mx-auto max-w-[1600px] px-4 pb-3 sm:px-6">
          <div className="flex items-center justify-between gap-3">
            <BrandLogo />
            <div className="hidden items-center gap-2 md:flex">
              <DataBadge tone="blue"><ShieldCheck className="mr-1 h-3 w-3" />Source-linked</DataBadge>
              <Link to="/data-sources" className="text-xs font-bold text-muted-foreground hover:text-foreground">How the data works</Link>
            </div>
          </div>

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
              <select value={state} onChange={(e) => { setState(e.target.value); setCounty("All counties"); }} className="min-h-12 rounded-xl border border-border bg-card px-3 text-sm font-bold">
                {STATES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
              <select value={county} onChange={(e) => setCounty(e.target.value)} className="min-h-12 rounded-xl border border-border bg-card px-3 text-sm font-bold">
                {counties.map((c) => <option key={c}>{c}</option>)}
              </select>
              <select value={commodity} onChange={(e) => setCommodity(e.target.value)} className="min-h-12 min-w-0 rounded-xl border border-border bg-card px-3 text-sm font-bold">
                {commodities.map((c) => <option key={c}>{c}</option>)}
              </select>
              <select value={status} onChange={(e) => setStatus(e.target.value)} className="min-h-12 rounded-xl border border-border bg-card px-3 text-sm font-bold">
                {STATUS_OPTIONS.map((s) => <option key={s}>{s}</option>)}
              </select>
            </div>
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-2">
            <div className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-border bg-card px-3">
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
            <DataBadge>{loading ? "Loading…" : `${filtered.length.toLocaleString()} properties`}</DataBadge>
            <DataBadge tone="blue">{linkedParcelCount.toLocaleString()} parcel-linked</DataBadge>
            <DataBadge tone="green">{deedCount.toLocaleString()} deed refs</DataBadge>
            {(query || status !== "All" || county !== "All counties" || commodity !== "All materials" || minAcres) && (
              <button type="button" onClick={clearFilters} className="text-xs font-bold text-sky-800 hover:underline">Clear filters</button>
            )}
            <div className="ml-auto flex rounded-xl border border-border bg-card p-1 lg:hidden">
              <button type="button" onClick={() => setMobileView("list")} className={`inline-flex min-h-9 items-center gap-1 rounded-lg px-3 text-xs font-bold ${mobileView === "list" ? "bg-slate-950 text-white" : ""}`}><List className="h-4 w-4" />List</button>
              <button type="button" onClick={() => setMobileView("map")} className={`inline-flex min-h-9 items-center gap-1 rounded-lg px-3 text-xs font-bold ${mobileView === "map" ? "bg-slate-950 text-white" : ""}`}><MapIcon className="h-4 w-4" />Map</button>
            </div>
          </div>
        </div>
      </header>

      {error ? (
        <div className="mx-auto max-w-4xl px-6 py-10"><div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-800">{error}</div></div>
      ) : (
        <main className="mx-auto grid max-w-[1600px] lg:grid-cols-[minmax(360px,44%)_1fr]">
          <section className={`${mobileView === "map" ? "hidden lg:block" : "block"} border-r border-border bg-background`}>
            <div className="border-b border-border px-4 py-4 sm:px-6">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-sky-700">Find properties</p>
              <h1 className="mt-1 font-heading text-2xl font-black">Quarry & Mineral Property Intelligence</h1>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">Browse quarry records like commercial real estate, then open the source-linked parcel, ownership, permit and geology intelligence behind each location.</p>
            </div>

            <div className="grid gap-3 p-4 sm:grid-cols-2 sm:p-6 lg:grid-cols-1 xl:grid-cols-2">
              {loading ? [...Array(8)].map((_, i) => <div key={i} className="h-72 animate-pulse rounded-2xl border border-border bg-muted/30" />) : filtered.length ? (
                filtered.slice(0, 160).map((site) => {
                  const parcel = site.msha_mine_id ? parcelByMine.get(String(site.msha_mine_id)) : null;
                  const verification = verificationBySite.get(site.id) || (site.msha_mine_id ? verificationBySite.get(`msha:${site.msha_mine_id}`) : null);
                  return (
                    <PropertyCard
                      key={site.id}
                      site={site}
                      parcel={parcel}
                      verification={verification}
                      selected={selectedId === site.id}
                      onSelect={() => { setSelectedId(site.id); setMobileView("map"); }}
                    />
                  );
                })
              ) : (
                <div className="rounded-2xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground sm:col-span-2 lg:col-span-1 xl:col-span-2">No properties match these filters.</div>
              )}
            </div>
          </section>

          <section className={`${mobileView === "list" ? "hidden lg:block" : "block"} relative min-h-[680px] bg-muted/20`}>
            <div className="sticky top-[190px] h-[calc(100vh-190px)] min-h-[620px]">
              <MapContainer center={DEFAULT_CENTER} zoom={6} minZoom={4} style={{ height: "100%", width: "100%" }} scrollWheelZoom>
                <MapController sites={filtered} selectedId={selectedId} />
                <LayersControl position="topright">
                  <LayersControl.BaseLayer checked name="Street">
                    <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="&copy; OpenStreetMap contributors" />
                  </LayersControl.BaseLayer>
                  <LayersControl.BaseLayer name="Satellite / aerial">
                    <TileLayer url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}" attribution="Tiles &copy; Esri" />
                  </LayersControl.BaseLayer>
                  <LayersControl.BaseLayer name="USGS Topographic">
                    <TileLayer url="https://basemap.nationalmap.gov/arcgis/rest/services/USGSTopo/MapServer/tile/{z}/{y}/{x}" attribution="&copy; USGS National Map" />
                  </LayersControl.BaseLayer>
                  <LayersControl.Overlay name="Bedrock geology (USGS)">
                    <WMSTileLayer url={USGS_GEOLOGY_WMS} layers="SGMC" format="image/png" transparent opacity={0.58} attribution="USGS State Geologic Map Compilation" />
                  </LayersControl.Overlay>
                </LayersControl>

                {filtered.slice(0, 450).map((site) => {
                  const parcel = site.msha_mine_id ? parcelByMine.get(String(site.msha_mine_id)) : null;
                  const verification = verificationBySite.get(site.id) || (site.msha_mine_id ? verificationBySite.get(`msha:${site.msha_mine_id}`) : null);
                  const geo = geologyBySite.get(site.id) || (site.msha_mine_id ? geologyBySite.get(`msha:${site.msha_mine_id}`) : null);
                  const rock = geo?.primary_rock || geo?.lithology || site.commodity;
                  const color = rockCategoryColor(rock);
                  const linked = Boolean(verification?.status === "Verified" || parcel?.source_url);
                  const owner = verification?.owner_name || parcel?.owner_name;
                  return (
                    <CircleMarker
                      key={site.id}
                      center={[Number(site.latitude), Number(site.longitude)]}
                      radius={selectedId === site.id ? 10 : linked ? 8 : 6}
                      pathOptions={{ color: "#fff", weight: selectedId === site.id ? 3 : 1.5, fillColor: color, fillOpacity: 0.9 }}
                      eventHandlers={{ click: () => setSelectedId(site.id) }}
                    >
                      <Popup>
                        <div className="min-w-[240px]">
                          <div className="text-xs font-bold uppercase tracking-wider text-slate-500">{linked ? "Courthouse-linked quarry record" : "Quarry intelligence record"}</div>
                          <strong className="mt-1 block text-base">{site.mine_name || "Quarry / Mine Site"}</strong>
                          <div>{[site.county, site.state].filter(Boolean).join(", ")}</div>
                          {rock && <div className="mt-2"><strong>Rock:</strong> {rock} <span className="text-xs text-slate-500">({rockCategoryFor(rock)})</span></div>}
                          {owner && <div><strong>Owner:</strong> {owner}</div>}
                          {(verification?.parcel_id || parcel?.parcel_id) && <div><strong>Parcel:</strong> {verification?.parcel_id || parcel?.parcel_id}</div>}
                          {(verification?.deed_book_page || parcel?.deed_book_page) && <div><strong>Deed:</strong> {verification?.deed_book_page || parcel?.deed_book_page}</div>}
                          <div className="mt-2 text-xs text-slate-500">Source checked {formatDate(verification?.verified_at || parcel?.last_source_update || site.last_source_update)}</div>
                          <Link to={`/mines/${site.id}`} className="mt-3 inline-block font-bold text-sky-800">Open full intelligence →</Link>
                        </div>
                      </Popup>
                    </CircleMarker>
                  );
                })}
              </MapContainer>

              <div className="pointer-events-none absolute bottom-5 left-5 z-[500] max-w-xs rounded-2xl border border-border bg-card/95 p-3 shadow-lg backdrop-blur">
                <div className="flex items-center gap-2 text-xs font-black"><Layers3 className="h-4 w-4" />Map intelligence</div>
                <div className="mt-2 grid grid-cols-2 gap-2 text-[11px] text-muted-foreground">
                  <span className="flex items-center gap-1"><Mountain className="h-3 w-3" />USGS geology</span>
                  <span className="flex items-center gap-1"><Building2 className="h-3 w-3" />Parcel ownership</span>
                  <span className="flex items-center gap-1"><FileText className="h-3 w-3" />Deed references</span>
                  <span className="flex items-center gap-1"><Database className="h-3 w-3" />Mine / permit data</span>
                </div>
              </div>
            </div>
          </section>
        </main>
      )}

      <div className="border-t border-border bg-card px-6 py-5 text-center text-[11px] leading-5 text-muted-foreground">
        Parcel, tax-map, deed, permit, geology and mine records are source-linked screening information. They are not a title opinion, legal description, survey, appraisal, reserve estimate or guarantee of current ownership.
      </div>
    </div>
  );
}
