import React, { useState, useEffect, lazy, Suspense } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/lib/AuthContext";
import { base44 } from "@/api/base44Client";
import MiningSiteCard from "@/components/MiningSiteCard";
const ParcelMap = lazy(() => import("@/components/ParcelMap"));
const TennesseeMineMap = lazy(() => import("@/components/TennesseeMineMap"));
import { Layers, ShieldCheck, TrendingUp } from "lucide-react";
import { Image } from "@/components/ui/image";
import BottomSheetSelect from "@/components/BottomSheetSelect";
import QuarrySearchAutocomplete from "@/components/QuarrySearchAutocomplete";
import PullToRefresh from "@/components/PullToRefresh";
import BrandLogo from "@/components/BrandLogo";
import ProfitabilityUpgradeBanner from "@/components/ProfitabilityUpgradeBanner";
import { calculateIndicativeQuarryValue } from "@/utils/quarryValuation";
import { calculateOpportunityScore } from "@/utils/opportunityScore";
import { downloadGeologyCsv } from "@/utils/downloadGeologyCsv";
import { isPlausibleSoutheastCoordinate } from "@/utils/coordinates";

const SOURCES = ["All", "MSHA", "TDEC", "County GIS", "Register of Deeds", "Other"];
const STATUS_GROUPS = ["All", "Active", "Inactive / Idled", "Historical / Abandoned", "New / Potential"];
const SOUTHEAST_STATES = ["TN", "GA", "AL", "KY", "NC", "SC", "FL", "MS"];
const STATE_OPTIONS = ["All Southeast", ...SOUTHEAST_STATES];
const QUARRY_COMMODITY_REGEX = "stone|limestone|sand|gravel|aggregate|marble|granite|slate|shale|quartz|clay|dolomite|rock|lime";
const INITIAL_PER_STATE = 45;
const SELECTED_STATE_LIMIT = 300;
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
  const [sites, setSites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [profiles, setProfiles] = useState([]);
  const [parcels, setParcels] = useState([]);
  const [geology, setGeology] = useState([]);
  const [permits, setPermits] = useState([]);
  const [environmental, setEnvironmental] = useState([]);
  const [query, setQuery] = useState("");
  const [remoteSearchSites, setRemoteSearchSites] = useState([]);
  const [source, setSource] = useState("All");
  const [statusFilter, setStatusFilter] = useState("All");
  const [stateFilter, setStateFilter] = useState("All Southeast");
  const [sortMode, setSortMode] = useState("Opportunity Priority");

  const loadData = async () => {
    setLoading(true);
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

      const loadMiningSiteInventory = async () => {
        const statesToLoad = stateFilter === "All Southeast" ? SOUTHEAST_STATES : [stateFilter];
        const perStateLimit = stateFilter === "All Southeast" ? INITIAL_PER_STATE : SELECTED_STATE_LIMIT;

        const stateRows = await Promise.all(statesToLoad.map(async (state) => {
          const quarryRows = await safeLoad(
            `MiningSite quarry inventory ${state}`,
            base44.entities.MiningSite.filter({
              state,
              commodity: { $regex: QUARRY_COMMODITY_REGEX, $options: "i" },
            }, "-updated_date", perStateLimit)
          );

          // Avoid 16 extra requests on the Southeast overview. Blank-commodity
          // records remain searchable and are included when a single state is selected.
          if (stateFilter === "All Southeast") return quarryRows || [];

          const [blankCommodity, missingCommodity] = await Promise.all([
            safeLoad(
              `MiningSite blank commodity ${state}`,
              base44.entities.MiningSite.filter({ state, commodity: "" }, "-updated_date", 20)
            ),
            safeLoad(
              `MiningSite missing commodity ${state}`,
              base44.entities.MiningSite.filter({ state, commodity: null }, "-updated_date", 20)
            ),
          ]);
          return [...(quarryRows || []), ...(blankCommodity || []), ...(missingCommodity || [])];
        }));

        const seen = new Set();
        const rows = [];
        for (const site of stateRows.flat()) {
          if (!isQuarryRelevant(site) || seen.has(site.id)) continue;
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
        safeLoad("QuarryPotentialProfile", base44.entities.QuarryPotentialProfile.list("-updated_date", limit)),
        safeLoad("ParcelRecord", base44.entities.ParcelRecord.list("-updated_date", limit)),
        safeLoad("GeologyRecord", base44.entities.GeologyRecord.list("-updated_date", limit)),
        safeLoad("TDECPermit", base44.entities.TDECPermit.list("-last_source_update", limit)),
        safeLoad("EnvironmentalRecord", base44.entities.EnvironmentalRecord.list("-last_source_update", limit)),
      ]);

      const siteList = Array.from(new Map((data || []).map((site) => [site.id, site])).values());
      const geoRecords = geologyData || [];

      setSites(siteList);
      setProfiles(profileData || []);
      setParcels(parcelData || []);
      setGeology(geoRecords);
      setPermits(permitData || []);
      setEnvironmental(environmentalData || []);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { loadData(); }, [stateFilter]);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setRemoteSearchSites([]);
      return undefined;
    }

    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const safe = escapeRegex(q).slice(0, 80);
        const rows = await base44.entities.MiningSite.filter({
          $or: [
            { mine_name: { $regex: safe, $options: "i" } },
            { operator_name: { $regex: safe, $options: "i" } },
            { county: { $regex: safe, $options: "i" } },
            { commodity: { $regex: safe, $options: "i" } },
            { msha_mine_id: { $regex: safe, $options: "i" } },
            { tdec_permit_number: { $regex: safe, $options: "i" } },
            { parcel_id: { $regex: safe, $options: "i" } },
          ],
        }, "-updated_date", 100);
        if (!cancelled) setRemoteSearchSites(rows || []);
      } catch {
        if (!cancelled) setRemoteSearchSites([]);
      }
    }, 300);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query]);

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
    const matchesStatus = statusFilter === "All" || statusGroup(s.mine_status) === statusFilter;
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
  const activeCount = quarrySites.filter((s) => statusGroup(s.mine_status) === "Active").length;
  const opportunityCount = quarrySites.filter((s) => ["New / Potential", "Inactive / Idled"].includes(statusGroup(s.mine_status))).length;
  const statesCovered = new Set(quarrySites.map((s) => String(s.state || "").trim().toUpperCase()).filter(Boolean)).size;
  const geologyLinked = new Set(geology.map((g) => g.mining_site_id || g.msha_mine_id).filter(Boolean)).size;

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

  return (
    <PullToRefresh onRefresh={loadData}>
    <div className="min-h-screen bg-background">
      {/* Top bar */}
      <header className="sticky top-0 z-40 border-b border-border bg-background/95 shadow-sm backdrop-blur" style={{ paddingTop: "env(safe-area-inset-top, 16px)" }}>
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 pb-4">
          <BrandLogo />
          <nav className="hidden items-center gap-6 text-sm text-muted-foreground lg:flex">
            <span className="font-medium text-foreground">Quarry Intelligence</span>
            <Link to="/mineral-value-guide" className="hover:text-foreground">Mineral Guide</Link>
            <Link to="/mineral-intelligence" className="hover:text-foreground">Mineral Map</Link>
            <Link to="/compare" className="hover:text-foreground">Compare</Link>
            <Link to="/watchlist" className="hover:text-foreground">Watchlist</Link>
            <Link to="/subscribe" className="hover:text-foreground">Access</Link>
            <Link to="/support" className="hover:text-foreground">Support</Link>
            {user?.role === "admin" && <Link to="/admin/reports" className="font-semibold text-sky-700 hover:text-sky-800">Reports</Link>}
            {user?.role === "admin" && <button onClick={() => downloadGeologyCsv(geology, `SS-Geology-Data-${new Date().toISOString().slice(0,10)}.csv`)} className="font-semibold text-sky-700 hover:text-sky-800">Download Geology CSV</button>}
          </nav>
          <div className="text-sm font-medium text-foreground">{user?.name || user?.email || "Preview"}</div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden border-b border-slate-700 text-slate-50">
        <div className="absolute inset-0">
          <Image
            src="https://media.base44.com/images/public/6a78376a454093ba2f431acd/4d73516b6_generated_image.png"
            alt="Aerial view of an active industrial quarry at golden hour"
            fittingType="fill"
            className="h-full w-full"
          />
        </div>
        <div className="absolute inset-0 bg-gradient-to-r from-slate-950/92 via-slate-950/72 to-slate-900/40" />
        <div className="relative mx-auto max-w-7xl px-6 py-20 sm:py-28">
          <div className="max-w-2xl">
            <span className="inline-flex items-center gap-2 rounded-full border border-slate-300/25 bg-white/5 px-3 py-1 text-xs font-medium uppercase tracking-wider text-slate-200">
              <Layers className="h-3.5 w-3.5" />
              Industrial Quarry Intelligence
            </span>
            <h1 className="mt-6 font-heading text-4xl font-bold leading-tight tracking-tight sm:text-6xl">
              Find the asset. Know the ground.
            </h1>
            <p className="mt-5 max-w-xl text-base text-slate-300 sm:text-lg">
              Source-backed quarry intelligence across Tennessee and the Southeast — mine records, mapped locations,
              geology, permits, production context, ownership signals and downloadable S&S intelligence reports.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <a href="#quarry-intelligence" className="rounded-xl bg-slate-100 px-5 py-3 text-sm font-bold text-slate-950 shadow-sm transition hover:bg-white">Explore the Quarry Map</a>
              <Link to="/subscribe" className="rounded-xl border border-slate-500 bg-slate-900/30 px-5 py-3 text-sm font-bold text-white hover:bg-slate-800">View Membership</Link>
            </div>
            <p className="mt-4 max-w-xl text-sm text-slate-300">Browse the quarry marketplace preview with no countdown. Full owner/operator intelligence, permitted acreage, detailed geology, production context, compliance history and opportunity analysis unlock with the $199/month membership. Eligible new Apple subscribers receive a 3-day free trial through the App Store subscription.</p>
            <div className="mt-8 flex flex-wrap items-center gap-6 text-sm text-slate-300">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-slate-200" />
                Source-backed records
              </div>
              <div className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-slate-200" />
                Geology &amp; mineral context
              </div>
              <div className="flex items-center gap-2">
                <Layers className="h-4 w-4 text-slate-200" />
                Maps &amp; parcel intelligence
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Fast market snapshot */}
      <section className="border-b border-border bg-slate-50/80">
        <div className="mx-auto grid max-w-7xl grid-cols-2 gap-px bg-border sm:grid-cols-4">
          {[
            [quarrySites.length.toLocaleString(), "Quarry records loaded"],
            [opportunityCount.toLocaleString(), "Potential / idled opportunities"],
            [activeCount.toLocaleString(), "Active mine records"],
            [Math.max(statesCovered, SOUTHEAST_STATES.length).toLocaleString(), "Southeast states in scope"],
          ].map(([value, label]) => (
            <div key={label} className="bg-background px-5 py-5 sm:px-6">
              <div className="font-heading text-2xl font-bold text-slate-950">{value}</div>
              <div className="mt-1 text-xs font-medium uppercase tracking-[0.12em] text-slate-500">{label}</div>
            </div>
          ))}
        </div>
        {geologyLinked > 0 && <div className="mx-auto max-w-7xl px-6 py-3 text-xs text-slate-500">{geologyLinked.toLocaleString()} geology-linked records currently loaded for screening. Coverage continues to expand as public-source records are connected and verified.</div>}
      </section>

      <ProfitabilityUpgradeBanner />

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
              return <MiningSiteCard key={`priority-${s.id}`} site={s} valuation={valuation} geology={geologyRecord} parcel={parcel} permits={sitePermits} environmental={siteEnvironmental} opportunity={opportunity} emphasizeOpportunity previewMode />;
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
                previewMode
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
                This preview shows the site and public mine identity. Open the full intelligence record to see owner/operator, permitted footprint, geology, regulatory and production context.
              </p>
              <div className="mt-6 grid grid-cols-3 gap-4 border-t border-border pt-6">
                <div>
                  <p className="text-xs uppercase tracking-wider text-muted-foreground">Detail level</p>
                  <p className="mt-1 font-display text-sm font-bold text-foreground">Preview</p>
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

      {/* Southeast intelligence map */}
      <section className="mx-auto max-w-7xl px-6 pb-14">
        <Suspense fallback={<div className="h-[560px] rounded-xl border border-border bg-muted/30 animate-pulse" />}>
          <TennesseeMineMap
            sites={ranked.slice(0, MAP_RENDER_LIMIT)}
            geologyMap={geologyLookup}
            height={560}
            previewMode
          />
        </Suspense>
        <p className="mt-2 text-xs text-muted-foreground">Aerial previews use Esri World Imagery tiles tied to each site's coordinates; they are location previews, not current-condition surveys or exact parcel-boundary depictions. Records with the same MSHA Mine ID are consolidated in the browsing view to avoid duplicate display.</p>
      </section>

      {/* Marketplace */}
      <section id="quarry-intelligence" className="mx-auto max-w-7xl px-6 pb-24">
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="font-heading text-2xl font-bold text-foreground">Southeast Quarry Intelligence</h2>
              <span className="rounded-full border border-slate-300 bg-slate-50 px-3 py-1 text-xs font-bold text-slate-700">{ranked.length.toLocaleString()} results</span>
              {filtersActive && <button type="button" onClick={clearFilters} className="text-xs font-bold text-sky-800 hover:underline">Clear filters</button>}
            </div>
            <p className="mt-1 text-sm text-muted-foreground">The app loads a fast working set instead of thousands of records at once. Search by mine name, MSHA Mine ID, state, county or commodity to query the larger quarry database. Open a record for owner/operator, permitted acreage, geology, permits, compliance, production context and opportunity analysis.</p>
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
                return <MiningSiteCard key={s.id} site={s} valuation={valuation} geology={geologyRecord} parcel={parcel} permits={sitePermits} environmental={siteEnvironmental} opportunity={opportunity} previewMode />;
              })}
            </div>
            {ranked.length > CARD_RENDER_LIMIT && (
              <div className="mt-8 rounded-2xl border border-border bg-muted/20 p-5 text-center text-sm text-muted-foreground">
                Showing the first {CARD_RENDER_LIMIT} results for speed. Use search or choose a state to query the full quarry database without loading every record onto the phone at once.
              </div>
            )}
          </>
        )}
      </section>

      <footer className="border-t border-border bg-muted">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 px-6 py-8 text-sm text-muted-foreground sm:flex-row">
          <div>S&amp;S Rock Holdings — Industrial quarry intelligence · Hold the line on the data.</div>
          <div className="flex flex-wrap items-center justify-center gap-4">
            <a href="/support" className="hover:text-foreground hover:underline">Support</a>
            <a href="/privacy" className="hover:text-foreground hover:underline">Privacy</a>
            <a href="/terms" className="hover:text-foreground hover:underline">Terms</a>
            <a href="/account/delete" className="hover:text-foreground hover:underline">Delete account</a>
          </div>
        </div>
      </footer>
    </div>
    </PullToRefresh>
  );
}