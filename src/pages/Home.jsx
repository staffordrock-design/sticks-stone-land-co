import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/lib/AuthContext";
import { base44 } from "@/api/base44Client";
import MiningSiteCard from "@/components/MiningSiteCard";
import ParcelMap from "@/components/ParcelMap";
import TennesseeMineMap from "@/components/TennesseeMineMap";
import { Search, Mountain, Layers, ShieldCheck, TrendingUp } from "lucide-react";
import { calculateIndicativeQuarryValue } from "@/utils/quarryValuation";
import { downloadGeologyCsv } from "@/utils/downloadGeologyCsv";
import { Capacitor } from "@capacitor/core";

const SOURCES = ["All", "MSHA", "TDEC", "County GIS", "Register of Deeds", "Other"];
const STATUS_GROUPS = ["All", "Active", "Inactive / Idled", "Historical / Abandoned", "New / Potential"];

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
  const [query, setQuery] = useState("");
  const [source, setSource] = useState("All");
  const [statusFilter, setStatusFilter] = useState("All");
  const [sortMode, setSortMode] = useState("Best Opportunity");
  const isNative = Capacitor.isNativePlatform();

  useEffect(() => {
    (async () => {
      try {
        const [data, profileData, parcelData, geologyData] = await Promise.all([
          base44.entities.MiningSite.list("-created_date", 500),
          base44.entities.QuarryPotentialProfile.list("-updated_date", 500),
          base44.entities.ParcelRecord.list("-updated_date", 500),
          base44.entities.GeologyRecord.list("-updated_date", 500),
        ]);
        setSites(data || []);
        setProfiles(profileData || []);
        setParcels(parcelData || []);
        setGeology(geologyData || []);
      } catch {
        /* ignore */
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const filtered = sites.filter((s) => {
    const matchesSource = source === "All" || s.source === source;
    const q = query.toLowerCase();
    const matchesQuery =
      !q ||
      s.mine_name?.toLowerCase().includes(q) ||
      s.state?.toLowerCase().includes(q) ||
      s.county?.toLowerCase().includes(q) ||
      s.commodity?.toLowerCase().includes(q);
    const matchesStatus = statusFilter === "All" || statusGroup(s.mine_status) === statusFilter;
    return matchesSource && matchesQuery && matchesStatus;
  });

  const ranked = [...filtered].sort((a, b) => {
    if (sortMode === "Best Opportunity") return Number(b.opportunity_score || 0) - Number(a.opportunity_score || 0);
    if (sortMode === "Largest Acreage") return Number(b.acreage || 0) - Number(a.acreage || 0);
    return String(a.mine_name || "").localeCompare(String(b.mine_name || ""));
  });

  const featured = sites.filter((s) => s.latitude && s.longitude).slice(0, 1)[0];

  return (
    <div className="min-h-screen bg-background">
      {/* Top bar */}
      <header className="sticky top-0 z-40 border-b border-slate-300/80 bg-slate-50/95 shadow-sm backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-900 text-slate-50 shadow-sm">
              <Mountain className="h-5 w-5" />
            </div>
            <div className="leading-none">
              <p className="font-heading text-base font-bold tracking-tight text-foreground">
                S&amp;S Rock Holdings
              </p>
              <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                Quarry Marketplace
              </p>
            </div>
          </div>
          <nav className="hidden items-center gap-6 text-sm text-muted-foreground lg:flex">
            <span className="font-medium text-foreground">Marketplace</span>
            <Link to="/sell" className="hover:text-foreground">Sell / List</Link>
            <Link to="/buyer-profile" className="hover:text-foreground">Buyer Profile</Link>
            <Link to="/saved" className="hover:text-foreground">Saved</Link>
            {!isNative && <Link to="/subscribe" className="hover:text-foreground">Professional</Link>}
            {user?.role === "admin" && <Link to="/admin/deals" className="font-semibold text-sky-700 hover:text-sky-800">Deal Desk</Link>}
            {user?.role === "admin" && <Link to="/admin/reports" className="font-semibold text-sky-700 hover:text-sky-800">Reports</Link>}
            {user?.role === "admin" && <button onClick={() => downloadGeologyCsv(geology, `SS-Geology-Data-${new Date().toISOString().slice(0,10)}.csv`)} className="font-semibold text-sky-700 hover:text-sky-800">Download Geology CSV</button>}
          </nav>
          <div className="text-sm font-medium text-foreground">{user?.name || user?.email || "Account"}</div>
        </div>
      </header>

      {/* Hero */}
      <section className="quarry-hero relative overflow-hidden border-b border-slate-700 text-slate-50">
        <div className="mx-auto max-w-7xl px-6 py-20 sm:py-28">
          <div className="max-w-2xl">
            <span className="inline-flex items-center gap-2 rounded-full border border-slate-300/25 bg-white/5 px-3 py-1 text-xs font-medium uppercase tracking-wider text-slate-200">
              <Layers className="h-3.5 w-3.5" />
              Industrial Land &amp; Mineral Marketplace
            </span>
            <h1 className="mt-6 font-heading text-4xl font-bold leading-tight tracking-tight sm:text-6xl">
              Where quarry, aggregate &amp; mineral land changes hands.
            </h1>
            <p className="mt-5 max-w-xl text-base text-slate-300 sm:text-lg">
              A GIS-mapped marketplace and quarry-intelligence platform built for the extraction industry —
              source-backed S&S Quarry Intelligence Reports, mapped parcels, and seller-provided confidential
              due diligence, all in one place.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link to="/sell" className="rounded-xl bg-slate-100 px-5 py-3 text-sm font-bold text-slate-950 shadow-sm transition hover:bg-white">Sell / Market a Property</Link>
              <Link to="/buyer-profile" className="rounded-xl border border-slate-500 bg-slate-900/30 px-5 py-3 text-sm font-bold text-white hover:bg-slate-800">Join Buyer Network</Link>
            </div>
            <div className="mt-8 flex flex-wrap items-center gap-6 text-sm text-slate-300">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-slate-200" />
                Seller confidential data rooms
              </div>
              <div className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-slate-200" />
                Royalty &amp; mineral rights
              </div>
              <div className="flex items-center gap-2">
                <Layers className="h-4 w-4 text-slate-200" />
                GIS boundary tracking
              </div>
            </div>
          </div>
        </div>
      </section>

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
            <ParcelMap
              lat={featured.latitude}
              lng={featured.longitude}
              height={420}
            />
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

      {/* Tennessee intelligence map */}
      <section className="mx-auto max-w-7xl px-6 pb-14">
        <TennesseeMineMap
          sites={filtered.filter((s) => s.state?.toUpperCase() === "TN")}
          height={560}
        />
        <p className="mt-2 text-xs text-muted-foreground">Marketplace aerial previews use Esri World Imagery tiles tied to each site's coordinates; they are location previews, not current-condition surveys or exact parcel-boundary depictions.</p>
      </section>

      {/* Marketplace */}
      <section className="mx-auto max-w-7xl px-6 pb-24">
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-heading text-2xl font-bold text-foreground">Quarry & Mineral Opportunities</h2>
            <p className="mt-1 text-sm text-muted-foreground">Active operations, inactive/idled sites, historical/abandoned records, and new/potential opportunities. Unverified sites are not represented as being for sale.</p>
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
              <select value={sortMode} onChange={(e) => setSortMode(e.target.value)} className="rounded-lg border border-input bg-card px-3 py-2 text-xs font-semibold text-foreground outline-none focus:ring-2 focus:ring-ring">
                <option>Best Opportunity</option>
                <option>Largest Acreage</option>
                <option>Name A–Z</option>
              </select>
              <div className="flex flex-wrap gap-1.5">
                {STATUS_GROUPS.map((s) => (
                  <button key={s} onClick={() => setStatusFilter(s)} className={`rounded-full px-3.5 py-1.5 text-xs font-medium transition ${statusFilter === s ? "bg-slate-800 text-white shadow-sm" : "border border-border bg-card text-muted-foreground hover:bg-muted"}`}>{s}</button>
                ))}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {SOURCES.map((s) => (
                  <button
                    key={s}
                    onClick={() => setSource(s)}
                    className={`rounded-full px-3.5 py-1.5 text-xs font-medium transition ${
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
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {ranked.map((s) => {
              const profile = profiles.find((p) => p.mining_site_id === s.id || (s.msha_mine_id && p.msha_mine_id === s.msha_mine_id));
              const parcel = parcels.find((p) => (s.parcel_id && p.parcel_id === s.parcel_id) || (s.msha_mine_id && p.msha_mine_id === s.msha_mine_id));
              const geologyRecord = geology.find((g) => g.mining_site_id === s.id || (s.msha_mine_id && g.msha_mine_id === s.msha_mine_id) || (s.parcel_id && g.parcel_id === s.parcel_id));
              const valuation = calculateIndicativeQuarryValue({ site: s, parcel, profile, geology: geologyRecord });
              return <MiningSiteCard key={s.id} site={s} valuation={valuation} geology={geologyRecord} />;
            })}
          </div>
        )}
      </section>

      <footer className="border-t border-slate-300 bg-slate-100">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 px-6 py-8 text-sm text-muted-foreground sm:flex-row">
          <div>S&amp;S Rock Holdings Quarry Marketplace — Industrial land &amp; mineral marketplace</div>
          <div className="flex flex-wrap items-center justify-center gap-4">
            <a href="/support" className="hover:text-foreground hover:underline">Support</a>
            <a href="/privacy" className="hover:text-foreground hover:underline">Privacy</a>
            <a href="/terms" className="hover:text-foreground hover:underline">Terms</a>
            <a href="/account/delete" className="hover:text-foreground hover:underline">Delete account</a>
          </div>
        </div>
      </footer>
    </div>
  );
}