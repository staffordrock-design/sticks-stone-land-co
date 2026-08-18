import React, { useState, useEffect, lazy, Suspense } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/lib/AuthContext";
import { base44 } from "@/api/base44Client";
import MiningSiteCard from "@/components/MiningSiteCard";
const ParcelMap = lazy(() => import("@/components/ParcelMap"));
const TennesseeMineMap = lazy(() => import("@/components/TennesseeMineMap"));
import { Search, Mountain, Layers, ShieldCheck, TrendingUp } from "lucide-react";
import { Image } from "@/components/ui/image";
import BottomSheetSelect from "@/components/BottomSheetSelect";
import PullToRefresh from "@/components/PullToRefresh";
import { calculateIndicativeQuarryValue } from "@/utils/quarryValuation";
import { calculateOpportunityScore } from "@/utils/opportunityScore";
import { downloadGeologyCsv } from "@/utils/downloadGeologyCsv";

const SOURCES = ["All", "MSHA", "TDEC", "County GIS", "Register of Deeds", "Other"];
const STATUS_GROUPS = ["All", "Active", "Inactive / Idled", "Historical / Abandoned", "New / Potential"];
const SOUTHEAST_STATES = ["TN", "GA", "AL", "KY", "NC", "SC", "FL", "MS"];
const STATE_OPTIONS = ["All Southeast", ...SOUTHEAST_STATES];

function statusGroup(status = "") {
  const s = String(status).toLowerCase();
  if (s.includes("active")) return "Active";
  if (s.includes("intermittent") || s.includes("temporarily idled") || s.includes("nonproducing") || s.includes("non-producing") || s.includes("inactive")) return "Inactive / Idled";
  if (s.includes("historical") || s.includes("abandon")) return "Historical / Abandoned";
  if (s.includes("new mine") || !s.trim()) return "New / Potential";
  return "New / Potential";
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
  const [source, setSource] = useState("All");
  const [statusFilter, setStatusFilter] = useState("All");
  const [stateFilter, setStateFilter] = useState("All Southeast");
  const [sortMode, setSortMode] = useState("Opportunity Priority");
  const [showAll, setShowAll] = useState(false);

  const loadData = async () => {
    try {
      const limit = showAll ? 500 : 200;
      const [data, potentialData, profileData, parcelData, geologyData, permitData, environmentalData] = await Promise.all([
        base44.entities.MiningSite.list("-created_date", limit),
        base44.entities.MiningSite.filter({ mine_status: "New Mine" }, "-created_date", 100),
        base44.entities.QuarryPotentialProfile.list("-updated_date", limit),
        base44.entities.ParcelRecord.list("-updated_date", limit),
        base44.entities.GeologyRecord.list("-updated_date", limit),
        base44.entities.TDECPermit.list("-last_source_update", limit),
        base44.entities.EnvironmentalRecord.list("-last_source_update", limit),
      ]);

      const siteList = Array.from(new Map([...(potentialData || []), ...(data || [])].map((site) => [site.id, site])).values());
      const geoRecords = geologyData || [];

      // Pull in sites that have connected geology data but sit beyond the 500-record
      // display limit, so data-rich quarries appear on the Home page.
      const loadedSiteIds = new Set(siteList.map((s) => s.id));
      const geoSiteIds = [...new Set(geoRecords.map((g) => g.mining_site_id).filter(Boolean))];
      const missingIds = geoSiteIds.filter((sid) => !loadedSiteIds.has(sid));
      const missingSites = (
        await Promise.all(missingIds.map((sid) => base44.entities.MiningSite.get(sid).catch(() => null)))
      ).filter(Boolean);

      setSites([...siteList, ...missingSites]);
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
  useEffect(() => { loadData(); }, [showAll]);

  const visibleSites = Array.from(
    sites.reduce((map, site) => {
      const mineId = String(site.msha_mine_id || "").trim();
      const key = mineId ? `msha:${mineId}` : `record:${site.id}`;
      const completeness = (row) => [row.mine_name,row.mine_status,row.commodity,row.operator_name,row.county,row.latitude,row.longitude,row.tdec_permit_number,row.npdes_permit_number,row.parcel_id,row.acreage].filter((v) => v !== null && v !== undefined && String(v).trim() !== "").length;
      const existing = map.get(key);
      if (!existing || completeness(site) > completeness(existing)) map.set(key, site);
      return map;
    }, new Map()).values()
  );

  const filtered = visibleSites.filter((s) => {
    const matchesSource = source === "All" || s.source === source;
    const q = query.toLowerCase();
    const matchesQuery =
      !q ||
      s.mine_name?.toLowerCase().includes(q) ||
      s.state?.toLowerCase().includes(q) ||
      s.county?.toLowerCase().includes(q) ||
      s.commodity?.toLowerCase().includes(q);
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
  const featured = ranked.find((s) => s.latitude && s.longitude) || sites.find((s) => s.latitude && s.longitude);

  return (
    <PullToRefresh onRefresh={loadData}>
    <div className="min-h-screen bg-background">
      {/* Top bar */}
      <header className="sticky top-0 z-40 border-b border-border bg-background/95 shadow-sm backdrop-blur" style={{ paddingTop: "env(safe-area-inset-top, 16px)" }}>
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 pb-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-900 text-slate-50 shadow-sm">
              <Mountain className="h-5 w-5" />
            </div>
            <div className="leading-none">
              <p className="font-heading text-base font-bold tracking-tight text-foreground">
                S&amp;S Rock Holdings
              </p>
              <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                Industrial Quarry Intelligence
              </p>
            </div>
          </div>
          <nav className="hidden items-center gap-6 text-sm text-muted-foreground lg:flex">
            <span className="font-medium text-foreground">Quarry Intelligence</span>
            <Link to="/mineral-value-guide" className="hover:text-foreground">Mineral Guide</Link>
            <Link to="/subscribe" className="hover:text-foreground">Access</Link>
            <Link to="/support" className="hover:text-foreground">Support</Link>
            {user?.role === "admin" && <Link to="/admin/reports" className="font-semibold text-sky-700 hover:text-sky-800">Reports</Link>}
            {user?.role === "admin" && <button onClick={() => downloadGeologyCsv(geology, `SS-Geology-Data-${new Date().toISOString().slice(0,10)}.csv`)} className="font-semibold text-sky-700 hover:text-sky-800">Download Geology CSV</button>}
          </nav>
          <div className="text-sm font-medium text-foreground">{user?.name || user?.email || "Account"}</div>
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
              <a href="#quarry-intelligence" className="rounded-xl bg-slate-100 px-5 py-3 text-sm font-bold text-slate-950 shadow-sm transition hover:bg-white">Browse Free Preview</a>
              <Link to="/subscribe" className="rounded-xl border border-slate-500 bg-slate-900/30 px-5 py-3 text-sm font-bold text-white hover:bg-slate-800">View Membership Plans</Link>
            </div>
            <p className="mt-4 max-w-xl text-sm text-slate-300">Browse the quarry marketplace and public-source records before subscribing. Detailed mine pages, deeper geology, parcel intelligence and premium analysis unlock with membership.</p>
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
              return <MiningSiteCard key={`priority-${s.id}`} site={s} valuation={valuation} geology={geologyRecord} parcel={parcel} permits={sitePermits} environmental={siteEnvironmental} opportunity={opportunity} emphasizeOpportunity />;
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
                height={420}
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
                {featured.operator_name ? `Operator: ${featured.operator_name}.` : ""}
              </p>
              <div className="mt-6 grid grid-cols-3 gap-4 border-t border-border pt-6">
                <div>
                  <p className="text-xs uppercase tracking-wider text-muted-foreground">Acreage</p>
                  <p className="mt-1 font-display text-lg font-bold text-foreground">
                    {featured.acreage ? Number(featured.acreage).toLocaleString() : "—"}
                  </p>
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
            sites={filtered}
            height={560}
          />
        </Suspense>
        <p className="mt-2 text-xs text-muted-foreground">Aerial previews use Esri World Imagery tiles tied to each site's coordinates; they are location previews, not current-condition surveys or exact parcel-boundary depictions. Records with the same MSHA Mine ID are consolidated in the browsing view to avoid duplicate display.</p>
      </section>

      {/* Marketplace */}
      <section id="quarry-intelligence" className="mx-auto max-w-7xl px-6 pb-24">
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-heading text-2xl font-bold text-foreground">Southeast Quarry Intelligence</h2>
            <p className="mt-1 text-sm text-muted-foreground">Preview the marketplace before you subscribe. Tennessee is the verified core, with phased expansion across the Southeast. Search source-labeled active, inactive/idled, historical and new mine records. Open a mine record to see the membership options for detailed intelligence.</p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by mine, state, county, or commodity…"
                className="w-full rounded-lg border border-input bg-card py-2 pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-ring sm:w-64"
              />
            </div>
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
              {ranked.map((s) => {
                const profile = profileForSite(s);
                const parcel = parcelForSite(s);
                const geologyRecord = geologyForSite(s);
                const sitePermits = permitsForSite(s);
                const siteEnvironmental = environmentalForSite(s);
                const opportunity = opportunityForSite(s);
                const valuation = calculateIndicativeQuarryValue({ site: s, parcel, profile, geology: geologyRecord });
                return <MiningSiteCard key={s.id} site={s} valuation={valuation} geology={geologyRecord} parcel={parcel} permits={sitePermits} environmental={siteEnvironmental} opportunity={opportunity} />;
              })}
            </div>
            {!showAll && sites.length >= 190 && (
              <div className="mt-8 text-center">
                <button onClick={() => setShowAll(true)} className="rounded-xl border border-border bg-card px-6 py-3 text-sm font-semibold text-foreground hover:bg-muted">Show all records (load full dataset)</button>
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