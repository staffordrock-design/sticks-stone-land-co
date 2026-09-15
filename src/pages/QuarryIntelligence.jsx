import React, { useEffect, useMemo, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Search, Loader2, MapPin, ArrowRight, X } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useProfessionalAccess } from "@/hooks/useProfessionalAccess";
import IntelligenceMap from "@/components/quarryIntelligence/IntelligenceMap";
import IntelligenceProfile from "@/components/quarryIntelligence/IntelligenceProfile";
import { isPlausibleSoutheastCoordinate } from "@/utils/coordinates";
import { premiumSiteData } from "@/lib/subscriptionAccess";

const FOCUS_STATE = "TN";
const MAP_SITE_LIMIT = 500;
const NEARBY_RADIUS_MILES = 15;

function distanceMiles(lat1, lon1, lat2, lon2) {
  const a = Number(lat1), b = Number(lon1), c = Number(lat2), d = Number(lon2);
  if (![a, b, c, d].every(Number.isFinite)) return Infinity;
  const rad = (x) => (x * Math.PI) / 180;
  const h = Math.sin(rad(c - a) / 2) ** 2 + Math.cos(rad(a)) * Math.cos(rad(c)) * Math.sin(rad(d - b) / 2) ** 2;
  return 2 * 3958.7613 * Math.asin(Math.sqrt(h));
}

function escapeRegex(v = "") {
  return String(v).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isQuarryRelevant(site) {
  const c = String(site?.commodity || "").toLowerCase().trim();
  if (!c) return true;
  if (c.includes("coal")) return false;
  return ["stone", "limestone", "sand", "gravel", "aggregate", "marble", "granite", "slate", "shale", "quartz", "clay", "dolomite", "rock", "lime"].some((t) => c.includes(t));
}

async function fetchIntelligenceData(site) {
  if (!site?.id || site.id.startsWith("location-")) {
    return { parcel: null, permits: [], environmental: [], inspections: [], violations: [], profile: null, production: [], geology: null, usgsOccurrences: [], tdotDemand: [], tdotProducer: null };
  }

  const data = await premiumSiteData(site.id);
  const mshaId = site.msha_mine_id;
  const parcelId = site.parcel_id;
  return {
    parcel: (data.parcels || []).find((p) => p.parcel_id === parcelId || p.msha_mine_id === mshaId) || (data.parcels || [])[0] || null,
    permits: data.permits || [],
    environmental: data.environmental || [],
    inspections: data.inspections || [],
    violations: data.violations || [],
    profile: (data.profiles || [])[0] || null,
    production: data.production || [],
    geology: (data.geology || [])[0] || null,
    usgsOccurrences: data.usgsOccurrences || [],
    tdotDemand: data.tdotDemand || [],
    tdotProducer: (data.tdotProducerPlants || [])[0] || null,
  };
}

export default function QuarryIntelligence() {
  const navigate = useNavigate();
  const { hasProfessional } = useProfessionalAccess();
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [mapSites, setMapSites] = useState([]);
  const [mapLoading, setMapLoading] = useState(true);
  const [selectedSite, setSelectedSite] = useState(null);
  const [liveParcel, setLiveParcel] = useState(null);
  const [intelData, setIntelData] = useState(null);
  const [loadingIntel, setLoadingIntel] = useState(false);

  // Load mine sites for the map
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setMapLoading(true);
      try {
        const rows = await base44.entities.MiningSite.filter({ state: FOCUS_STATE }, "-updated_date", MAP_SITE_LIMIT);
        if (!cancelled) setMapSites((rows || []).filter(isQuarryRelevant));
      } catch (e) {
        console.error("Map site load failed", e);
      } finally {
        if (!cancelled) setMapLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Debounced search
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setSearchResults([]);
      setSearching(false);
      return undefined;
    }
    setSearching(true);
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const safe = escapeRegex(q).slice(0, 80);
        const rows = await base44.entities.MiningSite.filter({
          $or: [
            { mine_name: { $regex: safe, $options: "i" } },
            { msha_mine_id: { $regex: safe, $options: "i" } },
            { county: { $regex: safe, $options: "i" } },
            { commodity: { $regex: safe, $options: "i" } },
            { operator_name: { $regex: safe, $options: "i" } },
            { parcel_id: { $regex: safe, $options: "i" } },
            { tdec_permit_number: { $regex: safe, $options: "i" } },
          ],
        }, "-updated_date", 30);
        if (!cancelled) {
          setSearchResults((rows || []).filter(isQuarryRelevant));
          setShowResults(true);
        }
      } catch {
        if (!cancelled) setSearchResults([]);
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 300);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [query]);

  // Fetch intelligence data when a site is selected
  useEffect(() => {
    if (!selectedSite) return;
    let cancelled = false;
    setLoadingIntel(true);
    (async () => {
      const data = await fetchIntelligenceData(selectedSite);
      if (!cancelled) {
        setIntelData(data);
        setLoadingIntel(false);
      }
    })();
    return () => { cancelled = true; };
  }, [selectedSite]);

  const handleSelectSite = useCallback((site) => {
    setShowResults(false);
    setQuery(site.mine_name || "");
    setLiveParcel(null);
    setSelectedSite(site);
    window.scrollTo({ top: document.body.scrollHeight * 0.35, behavior: "smooth" });
  }, []);

  const handleMapTap = useCallback(async (lat, lng) => {
    setShowResults(false);
    // Find nearest mine site from loaded markers
    const nearest = mapSites
      .map((s) => ({ s, d: distanceMiles(lat, lng, s.latitude, s.longitude) }))
      .filter((x) => x.d <= NEARBY_RADIUS_MILES)
      .sort((a, b) => a.d - b.d)[0];

    if (nearest && nearest.d <= 2) {
      handleSelectSite(nearest.s);
      return;
    }

    // No very close site — fetch parcel data for the tapped location
    let parcel = null;
    try {
      const response = await base44.functions.invoke("fetch-parcel-data", { lat, lng, state: FOCUS_STATE });
      parcel = response?.data || response;
      if (parcel?.fallback) parcel = null;
    } catch (e) {
      console.error("Live parcel fetch failed", e);
    }

    const minimalSite = {
      id: `location-${lat.toFixed(5)}-${lng.toFixed(5)}`,
      mine_name: parcel?.situs_address || parcel?.parcel_display_id || `Location ${lat.toFixed(4)}, ${lng.toFixed(4)}`,
      latitude: lat,
      longitude: lng,
      state: FOCUS_STATE,
      county: "",
      source: "Map Location Search",
      mine_status: "Location Search",
      commodity: "",
    };
    setLiveParcel(parcel);
    setSelectedSite(minimalSite);
    setQuery("");
  }, [mapSites, handleSelectSite]);

  const handleAddressSearch = useCallback(async () => {
    const q = query.trim();
    if (!q) return;
    setSearching(true);
    try {
      const response = await base44.functions.invoke("geocode-query", { query: q });
      const matches = response?.data?.matches || response?.matches || [];
      if (matches.length) {
        const { lat, lng } = matches[0];
        await handleMapTap(lat, lng);
      }
    } catch (e) {
      console.error("Address geocode failed", e);
    } finally {
      setSearching(false);
    }
  }, [query, handleMapTap]);

  const nearbySites = useMemo(() => {
    if (!selectedSite || !mapSites.length) return [];
    return mapSites
      .filter((s) => s.id !== selectedSite.id)
      .map((s) => ({ ...s, _dist: distanceMiles(selectedSite.latitude, selectedSite.longitude, s.latitude, s.longitude) }))
      .filter((s) => s._dist <= NEARBY_RADIUS_MILES && /active/i.test(s.mine_status || ""))
      .sort((a, b) => a._dist - b._dist)
      .slice(0, 5);
  }, [selectedSite, mapSites]);

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 border-b border-border bg-background/95 shadow-sm backdrop-blur" style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}>
        <div className="mx-auto max-w-7xl px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="font-heading text-xl font-bold text-foreground">Quarry &amp; Land Intelligence</h1>
              <p className="text-xs text-muted-foreground">Tennessee · combine official parcel, geology, permit, environmental &amp; market data</p>
            </div>
            <button onClick={() => navigate("/")} className="text-sm font-semibold text-sky-700 hover:underline">← Home</button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-8">
        {/* Search */}
        <div className="relative">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onFocus={() => searchResults.length && setShowResults(true)}
                onKeyDown={(e) => e.key === "Enter" && handleAddressSearch()}
                placeholder="Search quarry name, MSHA ID, parcel number, county, or address…"
                className="w-full rounded-xl border border-input bg-card py-3 pl-11 pr-10 text-sm text-foreground outline-none transition focus:ring-2 focus:ring-ring"
              />
              {query && (
                <button onClick={() => { setQuery(""); setSearchResults([]); setShowResults(false); }} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" aria-label="Clear search">
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
            <button onClick={handleAddressSearch} disabled={searching || !query.trim()} className="inline-flex items-center gap-2 rounded-xl bg-sky-700 px-5 py-3 text-sm font-bold text-white transition hover:bg-sky-800 disabled:opacity-50">
              {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              Analyze
            </button>
          </div>

          {showResults && searchResults.length > 0 && (
            <div className="absolute z-30 mt-2 max-h-80 w-full overflow-y-auto rounded-xl border border-border bg-card shadow-lg">
              {searchResults.slice(0, 15).map((s) => (
                <button
                  key={s.id}
                  onClick={() => handleSelectSite(s)}
                  className="flex w-full items-center justify-between border-b border-border/50 px-4 py-3 text-left transition last:border-0 hover:bg-muted/40"
                >
                  <div>
                    <div className="text-sm font-semibold text-foreground">{s.mine_name}</div>
                    <div className="text-xs text-muted-foreground">{s.county} · {s.state} · {s.commodity || "Commodity not recorded"}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="rounded-full border border-border bg-muted/30 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">{s.mine_status || "—"}</span>
                    <ArrowRight className="h-4 w-4 text-muted-foreground" />
                  </div>
                </button>
              ))}
            </div>
          )}
          {showResults && !searching && searchResults.length === 0 && query.trim().length >= 2 && (
            <div className="absolute z-30 mt-2 w-full rounded-xl border border-border bg-card p-4 shadow-lg">
              <p className="text-sm text-muted-foreground">No quarry records match "{query}". Try an address — click <strong>Analyze</strong> to geocode it.</p>
            </div>
          )}
        </div>

        {/* Map */}
        <div className="mt-6">
          {mapLoading ? (
            <div className="flex h-[420px] items-center justify-center rounded-2xl border border-border bg-muted/20">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <IntelligenceMap
              sites={mapSites}
              selectedSite={selectedSite}
              onLocationSelect={handleMapTap}
              height={420}
            />
          )}
          <p className="mt-2 text-xs text-muted-foreground">
            {mapSites.length.toLocaleString()} Tennessee quarry records loaded. Tap any location on the map to analyze it, or search above.
          </p>
        </div>

        {/* Profile */}
        {selectedSite && (
          <div className="mt-8">
            {loadingIntel ? (
              <div className="flex items-center justify-center rounded-2xl border border-border bg-card p-12">
                <Loader2 className="h-6 w-6 animate-spin text-sky-700" />
                <span className="ml-3 text-sm text-muted-foreground">Assembling intelligence profile…</span>
              </div>
            ) : (
              <IntelligenceProfile
                site={selectedSite}
                parcel={intelData?.parcel}
                liveParcel={liveParcel}
                geology={intelData?.geology}
                permits={intelData?.permits}
                environmental={intelData?.environmental}
                inspections={intelData?.inspections}
                violations={intelData?.violations}
                profile={intelData?.profile}
                production={intelData?.production}
                usgsOccurrences={intelData?.usgsOccurrences}
                tdotDemand={intelData?.tdotDemand}
                tdotProducer={intelData?.tdotProducer}
                nearbySites={nearbySites}
                hasProfessional={hasProfessional}
              />
            )}
          </div>
        )}

        {!selectedSite && !mapLoading && (
          <div className="mt-8 rounded-2xl border border-dashed border-border bg-muted/10 p-10 text-center">
            <MapPin className="mx-auto h-8 w-8 text-muted-foreground" />
            <h2 className="mt-3 font-heading text-lg font-bold text-foreground">Analyze a Quarry or Property</h2>
            <p className="mx-auto mt-2 max-w-lg text-sm text-muted-foreground">
              Search above by quarry name, MSHA ID, parcel number, county, or address. Or tap any location on the map to receive a combined intelligence profile with property, geology, permits, environmental, market, and opportunity data.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}