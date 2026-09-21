import React, { useState, useEffect, lazy, Suspense } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/AuthContext";
import MiningSiteCard from "@/components/MiningSiteCard";
const ParcelMap = lazy(() => import("@/components/ParcelMap"));
const TennesseeMineMap = lazy(() => import("@/components/TennesseeMineMap"));
import { Layers, TrendingUp } from "lucide-react";
import { Image } from "@/components/ui/image";
import BottomSheetSelect from "@/components/BottomSheetSelect";
import QuarrySearchAutocomplete from "@/components/QuarrySearchAutocomplete";
import PullToRefresh from "@/components/PullToRefresh";
import BrandLogo from "@/components/BrandLogo";
import { calculateIndicativeQuarryValue } from "@/utils/quarryValuation";
import { calculateOpportunityScore } from "@/utils/opportunityScore";
import { downloadGeologyCsv } from "@/utils/downloadGeologyCsv";
import { isPlausibleSoutheastCoordinate } from "@/utils/coordinates";
import { trackFunnelEvent } from "@/lib/funnelTracking";
import { useProfessionalAccess } from "@/hooks/useProfessionalAccess";
import { premiumEntityQuery } from "@/lib/subscriptionAccess";
import { base44 } from "@/api/base44Client";
import AppStoreBadge from "@/components/AppStoreBadge";
import TrustBand from "@/components/TrustBand";
import SampleIntelligenceRecord from "@/components/SampleIntelligenceRecord";
import AudiencePaths from "@/components/AudiencePaths";
import MembershipValueSection from "@/components/MembershipValueSection";

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
  const { user } = useAuth();
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
  const [query, setQuery] = useState("");
  const [remoteSearchSites, setRemoteSearchSites] = useState([]);
  const [source, setSource] = useState("All");
  const [statusFilter, setStatusFilter] = useState("All");
  const [stateFilter, setStateFilter] = useState("TN");
  const [sortMode, setSortMode] = useState("Opportunity Priority");

  const loadData = async () => {
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

      const loadMiningSiteInventory = async () => {
        // Do not expose quarry records at all until a paid entitlement is verified.
        if (!premiumReady) return [];
        const statesToLoad = stateFilter === "All Southeast" ? SOUTHEAST_STATES : [stateFilter];
        const perStateLimit = stateFilter === "All Southeast" ? 80 : 500;

        // Keep the first screen fast and reliable on phones. Search still queries the
        // full MiningSite database, so older records remain discoverable without
        // downloading tens of thousands of rows before anything can render.
        const stateRows = await Promise.all(statesToLoad.map(async (state) => {
          const page = await safeLoad(
            `MiningSite working set ${state}`,
            premiumEntityQuery("MiningSite", { state }, "-updated_date", perStateLimit)
          );
          return (page || []).filter((site) => site?.id && isQuarryRelevant(site));
        }));

        const seen = new Set();
        const rows = [];
        for (const site of stateRows.flat()) {
          if (seen.has(site.id)) continue;
          seen.add(site.id);
          rows.push(site);
        }
        return rows;
      };

      // Do not let one optional enrichment source blank the entire marketplace.
      // MiningSite is the core public inventory; parcel/geology/permit/environmental
      // data enrich the cards when available.
      const [data, profileData, parcelData, geologyData, permitData, environmentalData] = await Promise.all([
        loadMiningSiteInventory(),
        premiumReady ? safeLoad("QuarryPotentialProfile", premiumEntityQuery("QuarryPotentialProfile", {}, "-updated_date", limit)) : Promise.resolve([]),
        premiumReady ? safeLoad("ParcelRecord", premiumEntityQuery("ParcelRecord", {}, "-updated_date", 500)) : Promise.resolve([]),
        premiumReady ? safeLoad("GeologyRecord", premiumEntityQuery("GeologyRecord", {}, "-updated_date", limit)) : Promise.resolve([]),
        premiumReady ? safeLoad("TDECPermit", premiumEntityQuery("TDECPermit", {}, "-last_source_update", limit)) : Promise.resolve([]),
        premiumReady ? safeLoad("EnvironmentalRecord", premiumEntityQuery("EnvironmentalRecord", {}, "-last_source_update", limit)) : Promise.resolve([]),
      ]);

      // Load a small teaser set for unpaid visitors so they see real quarry data
      // instead of a blank lock screen, creating a reason to subscribe.
      if (!premiumReady) {
        try {
          const teaserResponse = await base44.functions.invoke("get-teaser-sites", {});
          setTeaserSites(teaserResponse?.data?.sites || teaserResponse?.sites || []);
        } catch (error) {
          console.error("Teaser load failed", error);
          setTeaserSites([]);
        }
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
      const geoRecords = geologyData || [];

      setSites(siteList);
      setInventoryUnavailable(premiumReady && siteList.length === 0);
      setProfiles(profileData || []);
      setParcels(parcelData || []);
      setGeology(geoRecords);
      setPermits(permitData || []);
      setEnvironmental(environmentalData || []);
    } catch (error) {
      console.error("Home quarry inventory load failed", error);
      setInventoryUnavailable(true);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { loadData(); }, [stateFilter, hasProfessional, checkingAccess]);

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
  const opportunityForSite = (s) => calculateOpportunityScore({
    site: s,
    parcel: parcelForSite(s),
    geology: geologyForSite(s),
    permits: permitsForSite(s),
    environmental: environmentalForSite(s),
    profile: profileForSite(s),
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
    if (!hasProfessional) {
      navigate("/subscribe");
      return;
    }
    const q = query.trim();
    navigate(q ? `/search?q=${encodeURIComponent(q)}&state=${stateFilter === "All Southeast" ? "TN" : stateFilter}` : `/search?state=${stateFilter === "All Southeast" ? "TN" : stateFilter}`);
  };

  return (
    <PullToRefresh onRefresh={loadData}>
    <div className="min-h-screen bg-background">
      {/* Top bar */}
      <header className="sticky top-0 z-40 border-b border-border bg-background/95 shadow-sm backdrop-blur" style={{ paddingTop: "env(safe-area-inset-top, 16px)" }}>
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 pb-4">
          <BrandLogo />
          <nav className="hidden items-center gap-6 text-sm text-muted-foreground lg:flex">
            <button type="button" onClick={scrollToOpportunities} className="font-medium text-foreground hover:text-sky-700">Find Opportunities</button>
            <Link to="/search" className="hover:text-foreground">Map</Link>
            <Link to="/watchlist" className="hover:text-foreground">Saved</Link>
            <Link to="/sell" className="hover:text-foreground">List Property</Link>
            <Link to="/data-sources" className="hover:text-foreground">How the Data Works</Link>
            <Link to="/support" className="hover:text-foreground">Help</Link>
            {!hasProfessional && <Link to="/subscribe" className="rounded-lg bg-sky-600 px-3 py-2 font-bold text-white hover:bg-sky-500">Unlock — $69/mo</Link>}
            {user?.role === "admin" && <Link to="/admin/leads" className="font-semibold text-sky-700 hover:text-sky-800">Lead Inbox</Link>}
            {user?.role === "admin" && <Link to="/admin/conversions" className="font-semibold text-sky-700 hover:text-sky-800">Conversions</Link>}
            {user?.role === "admin" && <Link to="/admin/reports" className="font-semibold text-sky-700 hover:text-sky-800">Reports</Link>}
            {user?.role === "admin" && <button onClick={() => downloadGeologyCsv(geology, `SS-Geology-Data-${new Date().toISOString().slice(0,10)}.csv`)} className="font-semibold text-sky-700 hover:text-sky-800">Download Geology CSV</button>}
          </nav>
          <div className="flex items-center gap-3">
            <AppStoreBadge className="hidden sm:inline-flex" />
            {!hasProfessional && <Link to="/subscribe" className="rounded-lg bg-sky-600 px-3 py-2 text-xs font-bold text-white shadow-sm hover:bg-sky-500 sm:text-sm">Unlock — $69/mo</Link>}
            <div className="hidden text-sm font-medium text-foreground sm:block">{user?.name || user?.email || "Public Access"}</div>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden border-b border-slate-300 text-slate-900">
        <div className="absolute inset-0">
          <Image
            src="https://media.base44.com/images/public/6a78376a454093ba2f431acd/4d73516b6_generated_image.png"
            alt="Aerial view of an active industrial quarry at golden hour"
            fittingType="fill"
            className="h-full w-full"
          />
        </div>
        <div className="absolute inset-0 bg-white/60" />
        <div className="absolute inset-0 bg-gradient-to-r from-white/80 via-white/50 to-transparent" />
        <div className="relative mx-auto max-w-7xl px-6 py-16 sm:py-24">
          <div className="max-w-4xl">
            <h1 className="font-heading text-4xl font-black leading-[1.02] tracking-tight text-slate-950 drop-shadow-sm sm:text-6xl lg:text-7xl">
              <span className="block">KNOW THE ROCK.</span>
              <span className="block">KNOW THE LAND.</span>
              <span className="block text-sky-700">KNOW THE DEAL.</span>
            </h1>
            <p className="mt-5 max-w-2xl text-base font-semibold text-slate-800 sm:text-lg">
              Quarry marketplace + intelligence for buyers, operators, landowners, investors, and industry professionals.
            </p>
            <p className="mt-3 max-w-2xl text-sm font-medium text-slate-700 sm:text-base">
              Search quarry and mineral-property intelligence built from mining records, permits, ownership data, geology, GIS, production, transportation demand, and other public-source intelligence.
            </p>
            <div className="mt-8 max-w-2xl rounded-2xl border border-slate-300 bg-white/80 p-3 shadow-lg backdrop-blur">
              <div className="flex flex-col gap-2 sm:flex-row">
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key !== "Enter") return;
                    scrollToOpportunities();
                  }}
                  placeholder="Search quarry, county, state, rock type or MSHA ID"
                  aria-label="Search quarry records"
                  className="min-h-12 flex-1 rounded-xl border border-slate-300 bg-white px-4 text-base font-medium text-slate-950 outline-none ring-offset-2 placeholder:text-slate-500 focus:ring-2 focus:ring-sky-400"
                />
                <button type="button" onClick={scrollToOpportunities} className="min-h-12 rounded-xl bg-sky-600 px-6 text-sm font-bold text-white shadow-lg hover:bg-sky-500">{hasProfessional ? "FIND OPPORTUNITIES" : "UNLOCK FULL ACCESS — $69/MO"}</button>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2 px-1 text-xs text-slate-700">
                <span className="font-semibold">Try:</span>
                {["Tennessee", "Polk County", "Limestone", "MSHA Mine ID", "Quarry name"].map((s) => (
                  <button key={s} type="button" onClick={() => { if (!hasProfessional) { navigate("/subscribe"); return; } setQuery(s); navigate(`/search?q=${encodeURIComponent(s)}&state=TN`); }} className="rounded-full border border-slate-300 bg-white/70 px-2.5 py-0.5 font-medium text-slate-800 hover:bg-slate-100">{s}</button>
                ))}
              </div>
            </div>
            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
              <button type="button" onClick={() => document.getElementById("sample-record")?.scrollIntoView({ behavior: "smooth" })} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-slate-400 bg-white/70 px-5 text-sm font-bold text-slate-900 shadow-sm hover:bg-white">
                <Layers className="h-4 w-4" /> VIEW SAMPLE INTELLIGENCE RECORD
              </button>
            </div>
            <div className="mt-6">
              <AppStoreBadge variant="dark" />
            </div>
          </div>
        </div>
      </section>

      {/* Trust band — real verified data from the database */}
      <TrustBand />

      {/* Sample intelligence record — one polished public record for unpaid visitors */}
      {!hasProfessional && sampleBundle?.site && (
        <section id="sample-record" className="mx-auto max-w-7xl px-6 py-14">
          <div className="mb-6 text-center">
            <h2 className="font-heading text-2xl font-bold text-foreground sm:text-3xl">See What a Full Quarry Record Looks Like</h2>
            <p className="mt-2 max-w-3xl mx-auto text-sm leading-6 text-muted-foreground">
              This sample shows the source-linked property facts S&S can assemble. Each live record displays only the information actually available for that property; missing facts are not guessed.
            </p>
          </div>
          <div className="mx-auto max-w-3xl">
            <SampleIntelligenceRecord bundle={sampleBundle} />
          </div>
        </section>
      )}

      {/* Audience paths */}
      <AudiencePaths />

      {/* Membership value comparison */}
      <MembershipValueSection />

      {/* Priority quarry opportunities */}
      {priorityOpportunities.length > 0 && (
        <section className="mx-auto max-w-7xl px-6 py-14">
          <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-sky-700">Opportunity first</p>
              <h2 className="mt-1 font-heading text-2xl font-bold text-foreground">Priority Quarry Opportunities</h2>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">New and idled mine records are surfaced first, then ranked using available source coverage such as geology, parcel links, permits, location, acreage and verified screening data when present.</p>
            </div>
            <span className="text-xs text-muted-foreground">Screening priority only · not an appraisal or sale listing</span>
          </div>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {priorityOpportunities.map((s) => {
              const parcel = parcelForSite(s);
              const geologyRecord = geologyForSite(s);
              const profile = profileForSite(s);
              const sitePermits = permitsForSite(s);
              const siteEnvironmental = environmentalForSite(s);
              const opportunity = opportunityForSite(s);
              const valuation = calculateIndicativeQuarryValue({ site: s, parcel, profile, geology: geologyRecord });
              return <MiningSiteCard key={`priority-${s.id}`} site={s} valuation={valuation} geology={geologyRecord} parcel={parcel} permits={sitePermits} environmental={siteEnvironmental} opportunity={opportunity} emphasizeOpportunity previewMode={!hasProfessional} />;
            })}
          </div>
        </section>
      )}

      {/* Featured parcel with map */}
      {featured && (
        <section className="mx-auto max-w-7xl px-6 py-14">
          <div className="mb-6 flex items-end justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                Featured Mine Site
              </p>
              <h2 className="mt-1 font-heading text-2xl font-bold text-foreground">
                {featured.mine_name}
              </h2>
            </div>
          </div>
          <div className="grid gap-6 lg:grid-cols-2">
            <Suspense fallback={<div className="h-[420px] rounded-xl border border-border bg-muted/30 animate-pulse" />}>
              <ParcelMap
                lat={featured.latitude}
                lng={featured.longitude}
                rockType={featuredGeology?.primary_rock || featuredGeology?.lithology || featured.commodity}
                height={420}
                previewMode={!hasProfessional}
              />
            </Suspense>
            <div className="flex flex-col justify-center rounded-2xl border border-border bg-card p-8">
              <span className="inline-flex w-fit items-center rounded-full bg-slate-200 px-3 py-1 text-xs font-semibold text-slate-900">
                {featured.source}
              </span>
              <h3 className="mt-4 font-heading text-2xl font-bold text-foreground">
                {featured.county ? `${featured.county}, ` : ""}
                {featured.state}
              </h3>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                {featured.commodity ? `Commodity: ${featured.commodity}. ` : ""}
                This Public Quarry Information shows the site and public mine identity. Open the full intelligence record to see owner/operator, permitted footprint, geology, regulatory and production context.
              </p>
              <div className="mt-6 grid grid-cols-3 gap-4 border-t border-border pt-6">
                <div>
                  <p className="text-xs uppercase tracking-wider text-muted-foreground">Detail level</p>
                  <p className="mt-1 font-display text-sm font-bold text-foreground">Public Record</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wider text-muted-foreground">Status</p>
                  <p className="mt-1 font-display text-sm font-semibold text-foreground">
                    {featured.mine_status || "—"}
                  </p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wider text-muted-foreground">Source</p>
                  <p className="mt-1 font-display text-sm font-semibold text-foreground">
                    {featured.source}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Southeast intelligence map — paid members only */}
      {hasProfessional && (
        <section className="mx-auto max-w-7xl px-6 pb-14">
          <Suspense fallback={<div className="h-[560px] rounded-xl border border-border bg-muted/30 animate-pulse" />}>
            <TennesseeMineMap
              sites={ranked.slice(0, MAP_RENDER_LIMIT)}
              geologyMap={geologyLookup}
              height={560}
              loading={loading}
              unavailable={inventoryUnavailable}
              onRetry={loadData}
              previewMode={false}
            />
          </Suspense>
          <p className="mt-2 text-xs text-muted-foreground">Aerial imagery uses Esri World Imagery tiles tied to each site's coordinates; it is not a current-condition survey or exact parcel-boundary depiction. Records with the same MSHA Mine ID are consolidated in the browsing view to avoid duplicate display.</p>
        </section>
      )}

      {/* Marketplace */}
      <section id="quarry-intelligence" className="mx-auto max-w-7xl scroll-mt-28 px-6 pb-24">
        {!hasProfessional ? (
          <div className="rounded-2xl border border-slate-700 bg-slate-950 p-10 text-center text-white">
            <h2 className="font-heading text-2xl font-bold sm:text-3xl">The Full Quarry Database Is Locked</h2>
            <p className="mx-auto mt-3 max-w-2xl text-sm leading-6 text-slate-300">
              The sample record above shows what each quarry intelligence record contains. To search and browse the full database — every quarry, every county, every state — unlock Full Quarry Intelligence for $69/month.
            </p>
            <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link to="/subscribe" className="inline-flex min-h-12 items-center gap-2 rounded-xl bg-sky-600 px-8 py-3 text-sm font-bold text-white shadow-lg hover:bg-sky-500">
                <TrendingUp className="h-4 w-4" /> Unlock Full Intelligence — $69/month
              </Link>
              <button type="button" onClick={() => document.getElementById("sample-record")?.scrollIntoView({ behavior: "smooth" })} className="inline-flex min-h-12 items-center gap-2 rounded-xl border border-slate-600 bg-slate-900/50 px-6 py-3 text-sm font-bold text-white hover:bg-slate-800">
                View Sample Record
              </button>
            </div>
            <p className="mt-4 text-xs text-slate-400">Cancel anytime. No account required to subscribe on web.</p>
          </div>
        ) : (
          <>
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="font-heading text-2xl font-bold text-foreground">Find Quarry Opportunities</h2>
              <span className="rounded-full border border-slate-300 bg-slate-50 px-3 py-1 text-xs font-bold text-slate-700">{loading ? "Loading results…" : inventoryUnavailable ? "Records temporarily unavailable" : `${ranked.length.toLocaleString()} results`}</span>
              {filtersActive && <button type="button" onClick={clearFilters} className="text-xs font-bold text-sky-800 hover:underline">Clear filters</button>}
            </div>
            <p className="mt-1 text-sm text-muted-foreground">Browse the marketplace like commercial real estate: search by quarry, county, state, rock type or mine ID; filter by operating status; compare mapped property facts; and save the opportunities worth investigating. Verified seller listings are clearly separated from off-market intelligence records.</p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <QuarrySearchAutocomplete sites={quarrySites} query={query} setQuery={setQuery} />
            <div className="flex flex-col gap-2">
              <BottomSheetSelect
                value={stateFilter}
                onChange={setStateFilter}
                options={STATE_OPTIONS}
                label="Filter by state"
              />
              <BottomSheetSelect
                value={sortMode}
                onChange={setSortMode}
                options={["Opportunity Priority", "Most Complete", "Largest Acreage", "Name A–Z"]}
                label="Sort opportunities"
              />
              <div className="flex flex-wrap gap-1.5">
                {STATUS_GROUPS.map((s) => (
                  <button key={s} onClick={() => setStatusFilter(s)} className={`inline-flex min-h-[44px] items-center rounded-full px-3.5 py-1.5 text-xs font-medium transition ${statusFilter === s ? "bg-slate-800 text-white shadow-sm" : "border border-border bg-card text-muted-foreground hover:bg-muted"}`}>{s}</button>
                ))}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {SOURCES.map((s) => (
                  <button
                    key={s}
                    onClick={() => setSource(s)}
                    className={`inline-flex min-h-[44px] items-center rounded-full px-3.5 py-1.5 text-xs font-medium transition ${
                      source === s
                        ? "bg-slate-900 text-slate-50 shadow-sm"
                        : "border border-border bg-card text-muted-foreground hover:bg-muted"
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {[...Array(6)].map((_, i) => (
              <div
                key={i}
                className="h-72 animate-pulse rounded-2xl border border-border bg-muted/40"
              />
            ))}
          </div>
        ) : inventoryUnavailable ? (
          <div className="rounded-2xl border border-dashed border-border p-10 text-center">
            <p className="font-semibold text-foreground">Quarry records could not load.</p>
            <p className="mt-2 text-sm text-muted-foreground">The database is still intact. Check the connection and try again.</p>
            <button type="button" onClick={loadData} className="mt-4 min-h-11 rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-bold text-white">Try again</button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border p-16 text-center text-muted-foreground">
            No mine sites match your search.
          </div>
        ) : (
          <>
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {ranked.slice(0, CARD_RENDER_LIMIT).map((s) => {
                const profile = profileForSite(s);
                const parcel = parcelForSite(s);
                const geologyRecord = geologyForSite(s);
                const sitePermits = permitsForSite(s);
                const siteEnvironmental = environmentalForSite(s);
                const opportunity = opportunityForSite(s);
                const valuation = calculateIndicativeQuarryValue({ site: s, parcel, profile, geology: geologyRecord });
                return <MiningSiteCard key={s.id} site={s} valuation={valuation} geology={geologyRecord} parcel={parcel} permits={sitePermits} environmental={siteEnvironmental} opportunity={opportunity} previewMode={!hasProfessional} />;
              })}
            </div>
            {ranked.length > CARD_RENDER_LIMIT && (
              <div className="mt-8 rounded-2xl border border-border bg-muted/20 p-5 text-center text-sm text-muted-foreground">
                Showing the first {CARD_RENDER_LIMIT} results for speed. Use search or choose a state to query the full quarry database without loading every record onto the phone at once.
              </div>
            )}
          </>
        )}
          </>
        )}
      </section>

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
                <Link to="/subscribe" className="text-muted-foreground hover:text-foreground hover:underline">Full Intelligence — $69/month</Link>
                <Link to="/sell" className="text-muted-foreground hover:text-foreground hover:underline">List a Property</Link>
                <Link to="/get-started?mode=report" className="text-muted-foreground hover:text-foreground hover:underline">Request Due Diligence</Link>
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
          <div className="mt-8 border-t border-border pt-6 text-center text-xs text-muted-foreground">
            &copy; {new Date().getFullYear()} S&amp;S Rock Holdings LLC · Quarry marketplace + industrial intelligence · Source data may require independent verification.
          </div>
        </div>
      </footer>
    </div>
    </PullToRefresh>
  );
}