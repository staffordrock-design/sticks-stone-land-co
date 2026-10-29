import React, { useState, useEffect, lazy, Suspense } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/AuthContext";
import AppLoadingScreen from "@/components/AppLoadingScreen";
const QuarryMapCanvas = lazy(() => import("@/components/quarryMap/QuarryMapCanvas"));
import { Layers, TrendingUp, Search } from "lucide-react";
import { Image } from "@/components/ui/image";
import BottomSheetSelect from "@/components/BottomSheetSelect";
import PullToRefresh from "@/components/PullToRefresh";
import BrandLogo from "@/components/BrandLogo";
import { storedOpportunity } from "@/lib/storedScreening";
import { downloadGeologyCsv } from "@/utils/downloadGeologyCsv";
import { isPlausibleSoutheastCoordinate } from "@/utils/coordinates";
import { trackFunnelEvent } from "@/lib/funnelTracking";
import { useProfessionalAccess } from "@/hooks/useProfessionalAccess";
import { premiumEntityQuery, premiumAccessProofParams } from "@/lib/subscriptionAccess";
import { base44 } from "@/api/base44Client";
import AppStoreBadge from "@/components/AppStoreBadge";
import TrustBand from "@/components/TrustBand";
import SampleIntelligenceRecord from "@/components/SampleIntelligenceRecord";
import AudiencePaths from "@/components/AudiencePaths";
import MembershipValueSection from "@/components/MembershipValueSection";
import { SAMPLE_RECORD_ID } from "@/lib/sampleRecord";

const SOURCES = ["All", "MSHA", "TDEC", "County GIS", "Register of Deeds", "Other"];
const STATUS_GROUPS = ["All", "For Sale", "Active", "Inactive / Idled", "Historical / Abandoned", "New / Potential"];
const SOUTHEAST_STATES = ["TN", "GA", "AL", "KY", "NC", "SC", "FL", "MS"];
const STATE_OPTIONS = ["All Southeast", ...SOUTHEAST_STATES];
const MAP_RENDER_LIMIT = 240;
const CARD_RENDER_LIMIT = 90;

function statusGroup(status = "") {
  const s = String(status).toLowerCase();
  // Check inactive/idled terms before "active" because "inactive" contains "active".
  if (s.includes("intermittent") || s.includes("temporarily idled") || s.includes("nonproducing") || s.includes("non-producing") || s.includes("inactive")) return "Inactive / Idled";
  if (s.includes("historical") || s.includes("abandon")) return "Historical / Abandoned";
  if (s.includes("active")) return "Active";
  if (s.includes("new mine") || !s.trim()) return "New / Potential";
  return "New / Potential";
}

function escapeRegex(value = "") {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isQuarryRelevant(site) {
  const commodity = String(site?.commodity || "").toLowerCase().trim();
  if (!commodity) return true;
  if (commodity.includes("coal")) return false;
  return [
    "stone", "limestone", "sand", "gravel", "aggregate", "marble", "granite",
    "slate", "shale", "quartz", "clay", "dolomite", "rock", "lime"
  ].some((term) => commodity.includes(term));
}

export default function Home() {
  const { user, isLoadingAuth } = useAuth();
  const { hasProfessional, checking: checkingAccess } = useProfessionalAccess();
  const navigate = useNavigate();
  const [sites, setSites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [inventoryUnavailable, setInventoryUnavailable] = useState(false);
  const [teaserSites, setTeaserSites] = useState([]);
  const [sampleBundle, setSampleBundle] = useState(null);
  const [profiles, setProfiles] = useState([]);
  const [parcels, setParcels] = useState([]);
  const [geology, setGeology] = useState([]);
  const [permits, setPermits] = useState([]);
  const [environmental, setEnvironmental] = useState([]);
  const [comps, setComps] = useState([]);
  const [query, setQuery] = useState("");
  const [remoteSearchSites, setRemoteSearchSites] = useState([]);
  const [source, setSource] = useState("All");
  const [statusFilter, setStatusFilter] = useState("All");
  const [stateFilter, setStateFilter] = useState("All Southeast");
  const [sortMode, setSortMode] = useState("Opportunity Priority");
  const [mappedTotal, setMappedTotal] = useState(null);

  const loadSeq = React.useRef(0);

  const loadData = async () => {
    // Guards the deferred enrichment below: a newer load (state change, refresh)
    // must not be overwritten by a slow response from the previous one.
    const seq = ++loadSeq.current;
    const stale = () => seq !== loadSeq.current;
    setLoading(true);
    setInventoryUnavailable(false);
    try {
      const limit = 80;
      const safeLoad = async (label, request) => {
        try {
          return await request;
        } catch (error) {
          console.error(`Home data load failed: ${label}`, error);
          return [];
        }
      };

      const premiumReady = !checkingAccess && hasProfessional;
      const stateParam = stateFilter === "All Southeast" ? "ALL" : stateFilter;

      const loadMiningSiteInventory = async () => {
        // Paid-only premium query (admin fields). Falls back to the public list
        // below if this returns nothing (e.g. preview RLS limitations).
        // One batched request per view instead of one per state: eight parallel
        // round trips held up first paint and the backend rate limit.
        if (!premiumReady) return [];
        const statesToLoad = stateFilter === "All Southeast" ? SOUTHEAST_STATES : [stateFilter];
        const rows = await safeLoad(
          "MiningSite working set",
          premiumEntityQuery("MiningSite", { state: { $in: statesToLoad } }, "-updated_date", 1200)
        );
        return (rows || []).filter((site) => site?.id && isQuarryRelevant(site));
      };

      // Always load the public quarry list (service role) so the page populates
      // for everyone — paid and unpaid — regardless of client-side RLS state.
      let publicSites = [];
      try {
        // The proof params let the endpoint decide entitlement server-side and,
        // for entitled viewers only, include the stored S&S score and estimate.
        const publicResponse = await base44.functions.invoke("get-public-quarry-list", {
          state: stateParam,
          ...(await premiumAccessProofParams()),
        });
        publicSites = publicResponse?.data?.sites || publicResponse?.sites || [];
      } catch (error) {
        console.error("Public quarry list load failed", error);
        publicSites = [];
      }

      // Phase 1 — only what the list needs to paint: the public inventory plus a
      // single premium merge call.
      const premiumSites = await loadMiningSiteInventory();

      // Merge premium fields onto the public list by id. If the premium query
      // returns nothing, paid users still see the populated public list. Unpaid
      // users use the public list as-is (premium fields stay absent/locked).
      let data = publicSites;
      if (premiumReady && premiumSites.length) {
        const byId = new Map(premiumSites.map((s) => [s.id, s]));
        // Premium row first, public row second: both come from the same record,
        // so the public row's stored screening values are never blanked out by a
        // premium row that did not carry them.
        data = publicSites.map((s) => ({ ...(byId.get(s.id) || {}), ...s }));
      }

      if (!premiumReady) {
        setTeaserSites(publicSites);
        try {
          const sampleResponse = await base44.functions.invoke("get-sample-site", {});
          const sampleData = sampleResponse?.data || sampleResponse || {};
          setSampleBundle(sampleData?.site ? sampleData : null);
        } catch (error) {
          console.error("Sample site load failed", error);
          setSampleBundle(null);
        }
      } else {
        setTeaserSites([]);
        setSampleBundle(null);
      }

      const siteList = Array.from(new Map((data || []).map((site) => [site.id, site])).values());

      setSites(siteList);
      setInventoryUnavailable(siteList.length === 0);
      // Paint the list now; the page becomes usable while enrichment continues.
      setLoading(false);

      // Phase 2 — supplementary datasets, one request at a time. Firing all of
      // them alongside the public list and stats burst past the backend limit
      // (the intermittent 500s) and held the page until the slowest returned.
      const compData = await safeLoad("QuarryComparable", base44.entities.QuarryComparable.list("-updated_date", 200));
      if (stale()) return;
      setComps(compData || []);
      if (!premiumReady) return;

      const profileData = await safeLoad("QuarryPotentialProfile", premiumEntityQuery("QuarryPotentialProfile", {}, "-updated_date", limit));
      if (stale()) return;
      setProfiles(profileData || []);

      const parcelData = await safeLoad("ParcelRecord", premiumEntityQuery("ParcelRecord", {}, "-updated_date", 500));
      if (stale()) return;
      setParcels(parcelData || []);

      const geologyData = await safeLoad("GeologyRecord", premiumEntityQuery("GeologyRecord", {}, "-updated_date", limit));
      if (stale()) return;
      setGeology(geologyData || []);

      const permitData = await safeLoad("TDECPermit", premiumEntityQuery("TDECPermit", {}, "-last_source_update", limit));
      if (stale()) return;
      setPermits(permitData || []);

      const environmentalData = await safeLoad("EnvironmentalRecord", premiumEntityQuery("EnvironmentalRecord", {}, "-last_source_update", limit));
      if (stale()) return;
      setEnvironmental(environmentalData || []);
    } catch (error) {
      console.error("Home quarry inventory load failed", error);
      setInventoryUnavailable(true);
    } finally {
      setLoading(false);
    }
  };
  // Wait for the membership answer before the first fetch. Firing while it was
  // still open ran the whole load twice (public-only, then again with premium),
  // doubling every request on the home page.
  useEffect(() => {
    if (checkingAccess) return;
    loadData();
  }, [stateFilter, hasProfessional, checkingAccess]);

  // Mapped total comes from the stored inventory snapshot, not from however many
  // records this visit happened to load, so the number is identical every load.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await base44.functions.invoke("get-public-stats", {});
        const data = response?.data || response || {};
        const count = Number(data?.mappedCount);
        if (!cancelled && Number.isFinite(count) && count > 0) setMappedTotal(count);
      } catch (error) {
        console.error("Mapped total load failed", error);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    trackFunnelEvent({ page_type: "homepage", resource_id: "homepage_viewed", path: "/" });
  }, []);

  useEffect(() => {
    if (!hasProfessional && teaserSites.length > 0) {
      trackFunnelEvent({ page_type: "quarry_teaser", resource_id: "quarry_teaser", path: "/", user });
    }
  }, [hasProfessional, teaserSites.length, user]);

  useEffect(() => {
    if (!hasProfessional && sampleBundle?.site) {
      trackFunnelEvent({ page_type: "sample_record", resource_id: "sample_record_viewed", path: "/", user });
    }
  }, [hasProfessional, sampleBundle, user]);

  useEffect(() => {
    if (query.trim().length >= 2) {
      trackFunnelEvent({ page_type: "search", resource_id: "search_started", path: "/", user });
    }
  }, [query]);

  useEffect(() => {
    if (!hasProfessional) {
      setRemoteSearchSites([]);
      return undefined;
    }
    const q = query.trim();
    if (q.length < 2) {
      setRemoteSearchSites([]);
      return undefined;
    }

    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const safe = escapeRegex(q).slice(0, 80);
        const publicQuery = {
          $or: [
            { mine_name: { $regex: safe, $options: "i" } },
            { county: { $regex: safe, $options: "i" } },
            { state: { $regex: safe, $options: "i" } },
            { city: { $regex: safe, $options: "i" } },
            { commodity: { $regex: safe, $options: "i" } },
          ],
        };
        const paidQuery = {
          $or: [
            ...publicQuery.$or,
            { operator_name: { $regex: safe, $options: "i" } },
            { msha_mine_id: { $regex: safe, $options: "i" } },
            { tdec_permit_number: { $regex: safe, $options: "i" } },
            { parcel_id: { $regex: safe, $options: "i" } },
          ],
        };
        const rows = await premiumEntityQuery("MiningSite", paidQuery, "-updated_date", 100);
        if (!cancelled) setRemoteSearchSites(rows || []);
      } catch {
        if (!cancelled) setRemoteSearchSites([]);
      }
    }, 300);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, hasProfessional]);

  const visibleSites = Array.from(
    [...sites, ...remoteSearchSites].reduce((map, site) => {
      const mineId = String(site.msha_mine_id || "").trim();
      const key = mineId ? `msha:${mineId}` : `record:${site.id}`;
      const completeness = (row) => [row.mine_name,row.mine_status,row.commodity,row.operator_name,row.county,row.latitude,row.longitude,row.tdec_permit_number,row.npdes_permit_number,row.parcel_id,row.acreage].filter((v) => v !== null && v !== undefined && String(v).trim() !== "").length;
      const existing = map.get(key);
      if (!existing || completeness(site) > completeness(existing)) map.set(key, site);
      return map;
    }, new Map()).values()
  );

  const quarrySites = visibleSites.filter(isQuarryRelevant);

  const filtered = quarrySites.filter((s) => {
    const matchesSource = source === "All" || s.source === source;
    const q = query.toLowerCase();
    const matchesQuery =
      !q ||
      s.mine_name?.toLowerCase().includes(q) ||
      s.state?.toLowerCase().includes(q) ||
      s.county?.toLowerCase().includes(q) ||
      s.commodity?.toLowerCase().includes(q) ||
      s.operator_name?.toLowerCase().includes(q) ||
      String(s.msha_mine_id || "").toLowerCase().includes(q) ||
      String(s.tdec_permit_number || "").toLowerCase().includes(q) ||
      String(s.parcel_id || "").toLowerCase().includes(q);
    const stateCode = String(s.state || "").trim().toUpperCase();
    const matchesState = stateFilter === "All Southeast"
      ? SOUTHEAST_STATES.includes(stateCode)
      : stateCode === stateFilter;
    const matchesStatus = statusFilter === "All" || (statusFilter === "For Sale" ? Boolean(s.is_verified_listing && s.listing_id) : statusGroup(s.mine_status) === statusFilter);
    return matchesSource && matchesQuery && matchesStatus && matchesState;
  });

  const completenessScore = (s) => [s.msha_mine_id,s.mine_status,s.commodity,s.operator_name,s.county,s.latitude,s.longitude,s.tdec_permit_number,s.npdes_permit_number,s.parcel_id,s.acreage].filter((v) => v !== null && v !== undefined && String(v).trim() !== "").length;
  const profileForSite = (s) => profiles.find((p) => p.mining_site_id === s.id || (s.msha_mine_id && p.msha_mine_id === s.msha_mine_id));
  const parcelForSite = (s) => parcels.find((p) => (s.parcel_id && p.parcel_id === s.parcel_id) || (s.msha_mine_id && p.msha_mine_id === s.msha_mine_id));
  const geologyForSite = (s) => geology.find((g) => g.mining_site_id === s.id || (s.msha_mine_id && g.msha_mine_id === s.msha_mine_id) || (s.parcel_id && g.parcel_id === s.parcel_id));
  const permitsForSite = (s) => permits.filter((p) => (s.msha_mine_id && p.msha_mine_id === s.msha_mine_id) || (s.tdec_permit_number && p.permit_number === s.tdec_permit_number));
  const environmentalForSite = (s) => environmental.filter((r) => (s.msha_mine_id && r.msha_mine_id === s.msha_mine_id) || (s.npdes_permit_number && r.npdes_permit_number === s.npdes_permit_number));
  // Stored, not recalculated: the score is computed once with the complete source
  // data so the same record always shows the same number.
  const opportunityForSite = (s) => storedOpportunity(s, {
    parcel: parcelForSite(s),
    geology: geologyForSite(s),
  });
  const opportunityPriorityScore = (s) => (opportunityForSite(s)?.score || 0) * 10 + completenessScore(s);
  const ranked = [...filtered].sort((a, b) => {
    if (sortMode === "Opportunity Priority") return opportunityPriorityScore(b) - opportunityPriorityScore(a) || completenessScore(b) - completenessScore(a) || String(a.mine_name || "").localeCompare(String(b.mine_name || ""));
    if (sortMode === "Most Complete") return completenessScore(b) - completenessScore(a) || String(a.mine_name || "").localeCompare(String(b.mine_name || ""));
    if (sortMode === "Largest Acreage") return Number(b.acreage || 0) - Number(a.acreage || 0);
    return String(a.mine_name || "").localeCompare(String(b.mine_name || ""));
  });

  const priorityOpportunities = ranked.filter((s) => ["New / Potential", "Inactive / Idled"].includes(statusGroup(s.mine_status))).slice(0, 3);
  const featured = ranked.find((s) => isPlausibleSoutheastCoordinate(s.latitude, s.longitude, s.state)) || sites.find((s) => isPlausibleSoutheastCoordinate(s.latitude, s.longitude, s.state));
  const geologyLookup = React.useMemo(() => {
    const map = {};
    for (const g of geology) {
      if (g.mining_site_id) map[g.mining_site_id] = g;
      if (g.msha_mine_id) map[`msha:${g.msha_mine_id}`] = g;
    }
    return map;
  }, [geology]);

  const parcelByMine = React.useMemo(() => {
    const map = new Map();
    for (const p of parcels) {
      if (p.msha_mine_id) map.set(String(p.msha_mine_id), p);
    }
    return map;
  }, [parcels]);

  const featuredGeology = featured ? geologyLookup[featured.id] || (featured.msha_mine_id ? geologyLookup[`msha:${featured.msha_mine_id}`] : null) : null;
  const filtersActive = Boolean(query || source !== "All" || statusFilter !== "All" || stateFilter !== "All Southeast" || sortMode !== "Opportunity Priority");
  const clearFilters = () => {
    setQuery("");
    setSource("All");
    setStatusFilter("All");
    setStateFilter("All Southeast");
    setSortMode("Opportunity Priority");
  };

  const scrollToOpportunities = () => {
    const q = query.trim();
    navigate(q ? `/search?q=${encodeURIComponent(q)}&state=${stateFilter === "All Southeast" ? "TN" : stateFilter}` : `/search?state=${stateFilter === "All Southeast" ? "TN" : stateFilter}`);
  };

  // Identity first. The home route is public, so the app shell and membership
  // gate render it immediately — before auth and the access answer resolve. From
  // that unresolved state the page used to paint the public/locked variant
  // ("Public Access", the unlock button, locked premium sections) and only flip
  // to the signed-in owner view once the checks finished. Hold a neutral loading
  // state until we know who is signed in, then pick the variant once.
  if (isLoadingAuth || checkingAccess) {
    return <AppLoadingScreen message="Loading quarry intelligence…" />;
  }

  return (
    <>
    <PullToRefresh onRefresh={loadData}>
    <div className="min-h-screen bg-background">
      {/* Top bar */}
      <header className="sticky top-0 z-40 border-b border-border bg-background/95 shadow-sm backdrop-blur" style={{ paddingTop: "env(safe-area-inset-top, 16px)" }}>
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 pb-4">
          <BrandLogo />
          <nav className="hidden items-center gap-6 text-sm text-muted-foreground lg:flex">
            <button type="button" onClick={scrollToOpportunities} className="font-medium text-foreground hover:text-sky-700">Find Opportunities</button>
            <Link to="/search" className="hover:text-foreground">Map</Link>
            <Link to="/us-geology-map" className="hover:text-foreground">US Geology</Link>
            <Link to="/land-intelligence" className="font-semibold text-sky-800 hover:text-sky-700">Land Intelligence</Link>
            <Link to="/watchlist" className="hover:text-foreground">Saved</Link>
            <Link to="/sell" className="hover:text-foreground">List Property</Link>
            <Link to="/enterprise" className="font-semibold text-sky-800 hover:text-sky-700">Enterprise</Link>
            <Link to="/courthouse-records" className="hover:text-foreground">Records</Link>
            <Link to="/data-sources" className="hover:text-foreground">How the Data Works</Link>
            <Link to="/support" className="hover:text-foreground">Help</Link>
            {user?.role === "admin" && <Link to="/admin/leads" className="font-semibold text-sky-700 hover:text-sky-800">Lead Inbox</Link>}
            {user?.role === "admin" && <Link to="/admin/conversions" className="font-semibold text-sky-700 hover:text-sky-800">Conversions</Link>}
            {user?.role === "admin" && <Link to="/admin/reports" className="font-semibold text-sky-700 hover:text-sky-800">Reports</Link>}
            {user?.role === "admin" && <button onClick={() => downloadGeologyCsv(geology, `SS-Geology-Data-${new Date().toISOString().slice(0,10)}.csv`)} className="font-semibold text-sky-700 hover:text-sky-800">Download Geology CSV</button>}
          </nav>
          <div className="flex items-center gap-3">
            {!hasProfessional && <Link to="/subscribe" className="rounded-lg bg-sky-600 px-3 py-2 text-xs font-bold text-white shadow-sm hover:bg-sky-500 sm:text-sm">Unlock — $39/mo</Link>}
            <div className="hidden text-sm font-medium text-foreground sm:block">{user?.name || user?.email || "Public Access"}</div>
          </div>
        </div>
      </header>

      {/* Hero — search-first, Zillow-style */}
      <section className="relative overflow-hidden border-b border-slate-300">
        <div className="absolute inset-0">
          <Image
            src="https://media.base44.com/images/public/6a78376a454093ba2f431acd/4d73516b6_generated_image.png"
            alt="Aerial view of an active industrial quarry at golden hour"
            fittingType="fill"
            className="h-full w-full"
          />
        </div>
        <div className="absolute inset-0 bg-white/70" />
        <div className="absolute inset-0 bg-gradient-to-b from-white/50 via-white/30 to-white/60" />
        <div className="relative mx-auto max-w-5xl px-6 py-16 sm:py-24">
          <div className="text-center">
            <h1 className="font-heading text-4xl font-black leading-[1.05] tracking-tight text-slate-950 sm:text-5xl lg:text-6xl">
              Rock &amp; Quarry Intelligence.<br className="hidden sm:block" /> From the Ground Up.
            </h1>
            <p className="mx-auto mt-5 max-w-3xl text-base font-semibold text-slate-800 sm:text-lg">
              Search quarry properties, operating mines, inactive sites, mineral opportunities, ownership, permits, geology, production, acreage, and market intelligence in one place.
            </p>
          </div>
          <div className="mx-auto mt-8 max-w-3xl rounded-2xl border border-slate-300 bg-white/90 p-3 shadow-xl backdrop-blur">
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key !== "Enter") return;
                  scrollToOpportunities();
                }}
                placeholder="Search by quarry name, county, state, MSHA ID, permit number, owner, or location"
                aria-label="Search quarry opportunities"
                className="min-h-14 flex-1 rounded-xl border border-slate-300 bg-white px-4 text-base font-medium text-slate-950 outline-none ring-offset-2 placeholder:text-slate-500 focus:ring-2 focus:ring-sky-400"
              />
              <button type="button" onClick={scrollToOpportunities} className="inline-flex min-h-14 items-center justify-center gap-2 rounded-xl bg-sky-600 px-8 text-sm font-bold text-white shadow-lg hover:bg-sky-500">
                <Search className="h-4 w-4" /> Search Quarry Opportunities
              </button>
            </div>
          </div>
          <div className="mt-5 text-center">
            <button type="button" onClick={() => navigate(`/mines/${SAMPLE_RECORD_ID}`)} className="inline-flex min-h-12 items-center justify-center gap-2 text-sm font-bold text-sky-800 hover:underline">
              <Layers className="h-4 w-4" /> View a sample intelligence record
            </button>
          </div>
        </div>
      </section>

      {/* Interactive quarry map — the primary way to browse records */}
      <section id="quarry-intelligence" className="mx-auto max-w-7xl scroll-mt-28 px-4 py-10 sm:px-6">
        <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-sky-700">Map intelligence</p>
            <h2 className="mt-1 font-heading text-2xl font-bold text-foreground">Explore Quarries on the Map</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
              {loading ? "Loading mapped quarry records…" : inventoryUnavailable ? "Mapped records temporarily unavailable." : `${filtered.length.toLocaleString()} quarry records match your filters. Tap a marker for the key facts, then open the full record.`}
            </p>
          </div>
          {!hasProfessional && (
            <Link to="/subscribe" className="inline-flex min-h-12 w-fit items-center gap-2 rounded-xl bg-sky-600 px-6 py-3 text-sm font-bold text-white shadow-lg hover:bg-sky-500">
              <TrendingUp className="h-4 w-4" /> Unlock Full Intelligence — $39/month
            </Link>
          )}
        </div>

        <div className="mb-3 flex flex-wrap items-center gap-2">
          <BottomSheetSelect value={stateFilter} onChange={setStateFilter} options={STATE_OPTIONS} label="Filter by state" />
          <BottomSheetSelect value={source} onChange={setSource} options={SOURCES} label="Filter by source" />
          {STATUS_GROUPS.map((s) => (
            <button key={s} onClick={() => setStatusFilter(s)} className={`inline-flex min-h-[44px] items-center rounded-full px-3.5 py-1.5 text-xs font-medium transition ${statusFilter === s ? "bg-slate-800 text-white shadow-sm" : "border border-border bg-card text-muted-foreground hover:bg-muted"}`}>{s}</button>
          ))}
          {filtersActive && <button type="button" onClick={clearFilters} className="ml-1 text-xs font-bold text-sky-800 hover:underline">Clear filters</button>}
        </div>

        <div className="relative h-[70vh] min-h-[520px] overflow-hidden rounded-2xl border border-border bg-muted/20">
          {inventoryUnavailable && !loading ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
              <p className="font-semibold text-foreground">Quarry records could not load.</p>
              <p className="max-w-md text-sm text-muted-foreground">The database is still intact. Check the connection and try again.</p>
              <button type="button" onClick={loadData} className="min-h-11 rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-bold text-white">Try again</button>
            </div>
          ) : (
            <Suspense fallback={<div className="h-full w-full animate-pulse bg-muted/30" />}>
              <QuarryMapCanvas
                sites={filtered}
                geologyMap={geologyLookup}
                parcelByMine={parcelByMine}
                premium={hasProfessional}
              />
            </Suspense>
          )}
        </div>
        <p className="mt-2 text-xs text-muted-foreground">Marker color = rock type · ring = operating status · zoom out to cluster. Base maps: OpenStreetMap, Esri World Imagery, USGS, Census TIGERweb. Aerial imagery is not a current-condition survey or parcel-boundary depiction.</p>
      </section>

      {/* Trust band — real verified data, right below hero */}
      <TrustBand />

      {/* Audience paths — primary navigation, right below trust */}
      <AudiencePaths />

      {/* Sample intelligence record — secondary action for unpaid visitors */}
      {!hasProfessional && sampleBundle?.site && (
        <section id="sample-record" className="mx-auto max-w-7xl px-6 py-14">
          <div className="mb-6 text-center">
            <h2 className="font-heading text-2xl font-bold text-foreground sm:text-3xl">See What a Full Quarry Record Looks Like</h2>
            <p className="mt-2 max-w-3xl mx-auto text-sm leading-6 text-muted-foreground">
              This sample shows the source-linked property facts S&S can assemble. Each live record displays only the information actually available for that property; missing facts are not guessed.
            </p>
          </div>
          <div className="mx-auto max-w-3xl">
            <SampleIntelligenceRecord bundle={sampleBundle} sampleSiteId={SAMPLE_RECORD_ID} />
          </div>
        </section>
      )}

      {/* Mid-page unlock CTA for unpaid visitors */}
      {!hasProfessional && (
        <section className="mx-auto max-w-7xl px-6 py-10">
          <div className="rounded-3xl border border-sky-200 bg-gradient-to-br from-sky-50 to-white p-8 text-center shadow-sm sm:p-12">
            <h2 className="font-heading text-2xl font-bold text-slate-950 sm:text-3xl">Unlock Every Quarry Record</h2>
            <p className="mx-auto mt-3 max-w-2xl text-sm leading-6 text-slate-700 sm:text-base">Unlock the available ownership, geology, permits and screening behind the records. Check coverage for your target first; membership does not guarantee every field on every property.</p>
            <p className="mt-3 text-xs text-slate-500">Cancel anytime. No account required.</p>
          </div>
        </section>
      )}

      {/* Tennessee land-investigation pilot */}
      <section className="mx-auto max-w-7xl px-6 py-8">
        <div className="flex flex-col gap-4 rounded-2xl border border-sky-200 bg-gradient-to-r from-sky-50 to-white px-6 py-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="max-w-2xl">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-sky-800">New · Tennessee land pilot</p>
            <h2 className="mt-1 font-heading text-xl font-bold text-slate-950">Investigate land beyond quarry listings</h2>
            <p className="mt-2 text-sm leading-6 text-slate-700">Explore Polk, Bradley, and McMinn County parcels using public GIS boundaries, owner fields, acreage, and available deed references. Detailed land research is part of Full Quarry Intelligence.</p>
          </div>
          <Link to="/land-intelligence" className="inline-flex min-h-12 shrink-0 items-center justify-center rounded-xl bg-slate-900 px-5 py-3 text-sm font-bold text-white hover:bg-slate-800">Open Land Intelligence →</Link>
        </div>
      </section>

      {/* Membership value comparison */}
      <MembershipValueSection />

      <footer className="border-t border-border bg-muted">
        <div className="mx-auto max-w-7xl px-6 py-10">
          <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <div className="font-heading text-base font-bold text-foreground">S&amp;S Rock Holdings LLC</div>
              <p className="mt-2 text-sm text-muted-foreground">Quarry, aggregate, mineral-property and land intelligence. We organize public-source data into useful quarry intelligence for buyers, operators, landowners, investors and industry professionals.</p>
              <div className="mt-3 space-y-1 text-sm text-muted-foreground">
                <div>Website: <a href="https://ssrockholdings.com" className="font-medium text-foreground hover:underline">ssrockholdings.com</a></div>
                <div>Email: <a href="mailto:contact@ssrockholdings.com" className="font-medium text-foreground hover:underline">contact@ssrockholdings.com</a></div>
              </div>
            </div>
            <div>
              <div className="font-heading text-sm font-bold text-foreground">Intelligence</div>
              <div className="mt-3 flex flex-col gap-2 text-sm">
                <Link to="/data-sources" className="text-muted-foreground hover:text-foreground hover:underline">Data Sources &amp; Methodology</Link>
                <Link to="/subscribe" className="text-muted-foreground hover:text-foreground hover:underline">Full Intelligence — $39/month</Link>
                <Link to="/sell" className="text-muted-foreground hover:text-foreground hover:underline">List a Property</Link>
                <Link to="/due-diligence" className="text-muted-foreground hover:text-foreground hover:underline">Request Due Diligence</Link>
              </div>
            </div>
            <div>
              <div className="font-heading text-sm font-bold text-foreground">Company</div>
              <div className="mt-3 flex flex-col gap-2 text-sm">
                <Link to="/support" className="text-muted-foreground hover:text-foreground hover:underline">Support</Link>
                <Link to="/privacy" className="text-muted-foreground hover:text-foreground hover:underline">Privacy Policy</Link>
                <Link to="/terms" className="text-muted-foreground hover:text-foreground hover:underline">Terms of Use</Link>
                <Link to="/account/delete" className="text-muted-foreground hover:text-foreground hover:underline">Delete Account</Link>
              </div>
            </div>
          </div>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <AppStoreBadge variant="dark" />
            <a href="https://play.google.com/store/apps/details?id=com.ssrockholdings.quarrymarketplace" target="_blank" rel="noreferrer" aria-label="Get S&S Rock Holdings on Google Play" className="inline-flex items-center gap-2 rounded-full bg-slate-900 px-5 py-1.5 text-sm font-semibold text-white shadow-sm transition hover:opacity-90">Get it on Google Play</a>
          </div>
          <div className="mt-6 border-t border-border pt-6 text-center text-xs text-muted-foreground">
            &copy; {new Date().getFullYear()} S&amp;S Rock Holdings LLC · Quarry marketplace + industrial intelligence · Source data may require independent verification.
          </div>
        </div>
      </footer>
    </div>
    </PullToRefresh>
    </>
  );
}