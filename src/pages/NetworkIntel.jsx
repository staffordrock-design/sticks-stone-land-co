import React, { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  ArrowRight, Bell, BellRing, Building2, Handshake, Landmark, Layers3,
  Loader2, MapPin, Mountain, Network, Search,
  Target, Users, X
} from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import WatchQuarryButton from "@/components/WatchQuarryButton";

const STATES = ["TN", "GA", "AL", "KY", "NC", "SC", "MS", "VA"];
const ROLE_OPTIONS = ["All", "Operator", "Controller", "Landowner"];

function activeStatus(value) {
  const v = String(value || "").toLowerCase();
  return v.includes("active") || v.includes("new mine") || v.includes("intermittent") || v.includes("temporarily idled");
}

function isQuarryRelevant(site) {
  const commodity = String(site?.commodity || "").toLowerCase();
  if (commodity.includes("coal")) return false;
  return true;
}

function cleanName(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function companyKey(value) {
  return cleanName(value)
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\b(incorporated|inc|llc|l p|lp|ltd|corp|corporation|company|co)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function displayNumber(value, digits = 0) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return "—";
  return n.toLocaleString(undefined, { maximumFractionDigits: digits });
}

function companySlug(value) {
  return cleanName(value).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "company";
}

function indexedCompanyRows(rows) {
  return (rows || []).map((row) => ({
    key: row.company_key,
    name: row.company_name,
    aliases: new Set(row.aliases || [row.company_name]),
    roles: new Set(row.roles || []),
    siteIds: new Set(),
    sites: [],
    activeSiteIds: new Set(),
    states: new Set(row.states || []),
    counties: new Set(row.counties || []),
    commodities: new Set(row.commodities || []),
    permittedAcres: Number(row.permitted_acres || 0),
    parcelAcres: Number(row.parcel_acres || 0),
    siteCount: Number(row.site_count || 0),
    activeCount: Number(row.active_site_count || 0),
  }));
}

async function loadAllIndexedCompanies() {
  const rows = [];
  for (let offset = 0; offset < 5000; offset += 500) {
    const page = await base44.entities.QuarryNetworkCompany.list("-active_site_count", 500, offset).catch(() => []);
    rows.push(...(page || []));
    if (!page || page.length < 500) break;
  }
  return rows;
}

async function loadAllIndexedLinks() {
  const rows = [];
  for (let offset = 0; offset < 10000; offset += 500) {
    const page = await base44.entities.QuarryNetworkLink.list("-active_signal", 500, offset).catch(() => []);
    rows.push(...(page || []));
    if (!page || page.length < 500) break;
  }
  return rows;
}

function sitesFromIndexedLinks(rows) {
  const bySite = new Map();
  for (const link of rows || []) {
    if (!link?.mining_site_id || !isQuarryRelevant(link)) continue;
    const existing = bySite.get(link.mining_site_id) || {
      id: link.mining_site_id,
      msha_mine_id: link.msha_mine_id,
      mine_name: link.mine_name,
      mine_status: link.mine_status,
      commodity: link.commodity,
      state: link.state,
      county: link.county,
      operator_name: link.operator_name,
      controller_name: link.controller_name,
      parcel_owner: link.landowner_name,
      permittee_name: link.permittee_name,
      permitted_acres: link.permitted_acres,
      acreage: link.parcel_acres,
    };
    if (!existing.operator_name && link.relationship_type === "Operator") existing.operator_name = link.company_name;
    if (!existing.controller_name && link.relationship_type === "Controller") existing.controller_name = link.company_name;
    if (!existing.parcel_owner && link.relationship_type === "Landowner") existing.parcel_owner = link.company_name;
    if (!existing.permittee_name && link.relationship_type === "Permittee") existing.permittee_name = link.company_name;
    bySite.set(link.mining_site_id, existing);
  }
  return Array.from(bySite.values());
}

function buildCompanyNetwork(sites) {
  const map = new Map();
  const add = (rawName, role, site) => {
    const name = cleanName(rawName);
    if (!name) return;
    const key = companyKey(name) || name.toLowerCase();
    if (!map.has(key)) {
      map.set(key, {
        key,
        name,
        aliases: new Set(),
        roles: new Set(),
        siteIds: new Set(),
        sites: [],
        activeSiteIds: new Set(),
        states: new Set(),
        counties: new Set(),
        commodities: new Set(),
        permittedAcres: 0,
        parcelAcres: 0,
      });
    }
    const row = map.get(key);
    row.aliases.add(name);
    row.roles.add(role);
    if (!row.siteIds.has(site.id)) {
      row.siteIds.add(site.id);
      row.sites.push(site);
      if (activeStatus(site.mine_status)) row.activeSiteIds.add(site.id);
      if (site.state) row.states.add(site.state);
      if (site.county) row.counties.add(site.county);
      if (site.commodity) row.commodities.add(site.commodity);
      row.permittedAcres += Number(site.permitted_acres || 0);
      row.parcelAcres += Number(site.acreage || 0);
    }
  };

  for (const site of sites) {
    add(site.operator_name, "Operator", site);
    add(site.controller_name, "Controller", site);
    add(site.parcel_owner, "Landowner", site);
  }

  return Array.from(map.values()).map((row) => ({
    ...row,
    siteCount: row.siteIds.size,
    activeCount: row.activeSiteIds.size,
  })).sort((a, b) => b.activeCount - a.activeCount || b.siteCount - a.siteCount || a.name.localeCompare(b.name));
}

function Stat({ icon: Icon, value, label }) {
  return <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4"><Icon className="h-5 w-5 text-sky-300"/><div className="mt-3 text-2xl font-bold text-white">{value}</div><div className="mt-1 text-xs text-slate-400">{label}</div></div>;
}

function Pill({ children }) {
  return <span className="rounded-full bg-muted px-2.5 py-1 text-[10px] font-bold text-muted-foreground">{children}</span>;
}

export default function NetworkIntel() {
  const { user } = useAuth();
  const [params] = useSearchParams();
  const [sites, setSites] = useState([]);
  const [companyIndex, setCompanyIndex] = useState([]);
  const [opportunities, setOpportunities] = useState([]);
  const [members, setMembers] = useState([]);
  const [watches, setWatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState("");
  const [search, setSearch] = useState("");
  const [stateFilter, setStateFilter] = useState("All");
  const [roleFilter, setRoleFilter] = useState("All");
  const [tab, setTab] = useState("companies");
  const [selectedCompanyKey, setSelectedCompanyKey] = useState("");
  const [watchBusy, setWatchBusy] = useState("");
  const [relationshipCount, setRelationshipCount] = useState(0);

  const load = async () => {
    setLoading(true);
    setNotice("");
    try {
      const [initialCompanies, firstLinks, secondLinks, dealRows, memberRows, watchRows] = await Promise.all([
        base44.entities.QuarryNetworkCompany.list("-active_site_count", 500, 0).catch(() => []),
        base44.entities.QuarryNetworkLink.list("-active_signal", 500, 0).catch(() => []),
        base44.entities.QuarryNetworkLink.list("-active_signal", 500, 500).catch(() => []),
        base44.entities.NetworkOpportunity.list("-created_at", 300).catch(() => []),
        user?.id ? base44.entities.NetworkMemberProfile.list("-updated_at", 300).catch(() => []) : Promise.resolve([]),
        user?.id ? base44.entities.CompanyWatch.filter({ user_id: user.id }, "-created_at", 500).catch(() => []) : Promise.resolve([]),
      ]);
      const initialLinks = [...(firstLinks || []), ...(secondLinks || [])];
      setSites(sitesFromIndexedLinks(initialLinks));
      setRelationshipCount(initialLinks.length);
      setCompanyIndex(initialCompanies || []);
      setOpportunities((dealRows || []).filter((row) => row.status !== "Closed"));
      setMembers((memberRows || []).filter((row) => row.profile_visibility !== "Private"));
      setWatches(watchRows || []);
      setLoading(false);

      // Fill out the complete graph after the first useful screen is already visible.
      Promise.all([loadAllIndexedCompanies(), loadAllIndexedLinks()])
        .then(([allCompanies, allLinks]) => {
          if (allCompanies?.length) setCompanyIndex(allCompanies);
          if (allLinks?.length) {
            setSites(sitesFromIndexedLinks(allLinks));
            setRelationshipCount(allLinks.length);
          }
        })
        .catch((error) => console.warn("Full Network graph background load failed", error));
    } catch (error) {
      console.error("Network intelligence load failed", error);
      setNotice("Network intelligence could not load. Pull to refresh or try again.");
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [user?.id]);

  useEffect(() => {
    const company = params.get("company");
    const siteId = params.get("site");
    if (company) {
      setSearch(company);
      setTab("companies");
    }
    if (siteId) {
      setSearch(siteId);
      setTab("sites");
      base44.entities.MiningSite.get(siteId).then((site) => {
        if (!site || !isQuarryRelevant(site)) return;
        setSites((current) => current.some((row) => row.id === site.id) ? current : [...current, site]);
      }).catch(() => {});
    }
  }, [params]);

  const companies = useMemo(() => companyIndex.length ? indexedCompanyRows(companyIndex) : buildCompanyNetwork(sites), [companyIndex, sites]);
  const selectedCompany = useMemo(() => companies.find((c) => c.key === selectedCompanyKey) || null, [companies, selectedCompanyKey]);

  const filteredCompanies = useMemo(() => {
    const q = search.trim().toLowerCase();
    return companies.filter((company) => {
      if (roleFilter !== "All" && !company.roles.has(roleFilter)) return false;
      if (stateFilter !== "All" && !company.states.has(stateFilter)) return false;
      if (!q) return true;
      return [company.name, ...company.aliases, ...company.counties, ...company.states, ...company.commodities]
        .some((value) => String(value || "").toLowerCase().includes(q));
    });
  }, [companies, search, roleFilter, stateFilter]);

  const filteredSites = useMemo(() => {
    const q = search.trim().toLowerCase();
    return sites.filter((site) => {
      if (stateFilter !== "All" && site.state !== stateFilter) return false;
      if (!q) return true;
      return [site.id, site.msha_mine_id, site.mine_name, site.operator_name, site.controller_name, site.parcel_owner, site.county, site.state, site.commodity]
        .some((value) => String(value || "").toLowerCase().includes(q));
    }).sort((a, b) => Number(activeStatus(b.mine_status)) - Number(activeStatus(a.mine_status)) || String(a.mine_name || "").localeCompare(String(b.mine_name || "")));
  }, [sites, search, stateFilter]);

  const filteredDeals = useMemo(() => {
    const q = search.trim().toLowerCase();
    return opportunities.filter((item) => {
      if (stateFilter !== "All" && !String(item.states || "").toUpperCase().includes(stateFilter)) return false;
      if (!q) return true;
      return [item.title, item.description, item.author_company, item.author_name, item.states, item.counties, item.commodities, item.asset_types]
        .some((value) => String(value || "").toLowerCase().includes(q));
    });
  }, [opportunities, search, stateFilter]);

  const watchFor = (company) => watches.find((watch) => companyKey(watch.company_name) === company.key) || null;

  const toggleCompanyWatch = async (company) => {
    if (!user?.id || watchBusy) return;
    setWatchBusy(company.key);
    try {
      const existing = watchFor(company);
      if (existing) {
        await base44.entities.CompanyWatch.delete(existing.id);
        setNotice(`${company.name} removed from your company watchlist.`);
      } else {
        await base44.entities.CompanyWatch.create({
          user_id: user.id,
          company_name: company.name,
          relationship_type: "Any",
          created_at: new Date().toISOString(),
        });
        setNotice(`${company.name} added to your company watchlist.`);
      }
      const rows = await base44.entities.CompanyWatch.filter({ user_id: user.id }, "-created_at", 500);
      setWatches(rows || []);
    } catch (error) {
      console.error("Company watch failed", error);
      setNotice("The company watchlist did not update. Please try again.");
    } finally {
      setWatchBusy("");
    }
  };

  const stats = useMemo(() => ({
    sites: sites.length,
    active: sites.filter((site) => activeStatus(site.mine_status)).length,
    companies: companies.length,
    deals: opportunities.length,
    relationships: relationshipCount,
  }), [sites, companies, opportunities, relationshipCount]);

  if (loading) return <div className="min-h-screen bg-background flex items-center justify-center"><div className="text-center"><Loader2 className="mx-auto h-8 w-8 animate-spin text-slate-700"/><div className="mt-3 text-sm font-semibold text-muted-foreground">Building live Quarry Network Intelligence…</div></div></div>;

  return (
    <div className="min-h-screen bg-slate-50 pb-28 dark:bg-background">
      <header className="border-b border-slate-800 bg-slate-950 text-white" style={{ paddingTop: "env(safe-area-inset-top, 16px)" }}>
        <div className="mx-auto max-w-7xl px-4 pb-6 pt-4 sm:px-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="max-w-3xl">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-sky-300"><Network className="h-4 w-4"/>S&amp;S Quarry Network Intelligence</div>
              <h1 className="mt-2 font-heading text-3xl font-bold sm:text-4xl">See who controls what — and where the deals are.</h1>
              <p className="mt-3 text-sm leading-6 text-slate-300">Live quarry-company graph linking operators, controllers, landowners, permittees and quarry sites. The network loads from the persistent relationship index first, so it works even when there are no member posts or deal listings yet.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link to="/network/deals" className="rounded-xl bg-white px-4 py-2.5 text-xs font-bold text-slate-950">Deal Network</Link>
              <Link to="/network/deals/new" className="rounded-xl border border-slate-700 px-4 py-2.5 text-xs font-bold text-white">Post Deal</Link>
              <Link to="/network/deals/activity" className="rounded-xl border border-slate-700 px-4 py-2.5 text-xs font-bold text-white">Deal Activity</Link>
              <Link to="/network/watchlist" className="rounded-xl border border-slate-700 px-4 py-2.5 text-xs font-bold text-white">Network Watchlist</Link>
            </div>
          </div>
          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat icon={Mountain} value={stats.sites.toLocaleString()} label="quarry / non-coal sites in graph" />
            <Stat icon={Network} value={stats.relationships.toLocaleString()} label="company-to-quarry relationships" />
            <Stat icon={Building2} value={stats.companies.toLocaleString()} label="linked companies / owners / controllers" />
            <Stat icon={Handshake} value={stats.deals.toLocaleString()} label="open network opportunities" />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-5 sm:px-6">
        {notice && <div className="mb-4 rounded-xl border border-sky-200 bg-sky-50 p-3 text-sm font-semibold text-sky-950">{notice}</div>}

        <section className="rounded-2xl border border-border bg-card p-4 shadow-sm">
          <div className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"/><input className="input pl-10" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search company, owner, operator, quarry, county, state, commodity or MSHA ID…"/></div>
          <div className="mt-3 flex flex-wrap gap-2">
            <select value={stateFilter} onChange={(e) => setStateFilter(e.target.value)} className="rounded-xl border border-border bg-background px-3 py-2 text-xs font-bold"><option>All</option>{STATES.map((state) => <option key={state}>{state}</option>)}</select>
            {tab === "companies" && <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)} className="rounded-xl border border-border bg-background px-3 py-2 text-xs font-bold">{ROLE_OPTIONS.map((role) => <option key={role}>{role}</option>)}</select>}
            {search && <button type="button" onClick={() => setSearch("")} className="inline-flex items-center gap-1 rounded-xl border border-border px-3 py-2 text-xs font-bold"><X className="h-3.5 w-3.5"/>Clear</button>}
          </div>
        </section>

        <div className="mt-4 grid grid-cols-3 rounded-xl bg-muted p-1">
          <button onClick={() => setTab("companies")} className={`rounded-lg px-2 py-2.5 text-xs font-bold sm:text-sm ${tab === "companies" ? "bg-card shadow-sm" : "text-muted-foreground"}`}>Companies</button>
          <button onClick={() => setTab("sites")} className={`rounded-lg px-2 py-2.5 text-xs font-bold sm:text-sm ${tab === "sites" ? "bg-card shadow-sm" : "text-muted-foreground"}`}>Quarries</button>
          <button onClick={() => setTab("deals")} className={`rounded-lg px-2 py-2.5 text-xs font-bold sm:text-sm ${tab === "deals" ? "bg-card shadow-sm" : "text-muted-foreground"}`}>Deal Network</button>
        </div>

        {selectedCompany && <section className="mt-5 rounded-3xl border border-sky-200 bg-card p-5 shadow-lg sm:p-6">
          <div className="flex items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[0.18em] text-sky-700">Company network</p><h2 className="mt-1 font-heading text-2xl font-bold">{selectedCompany.name}</h2><div className="mt-2 flex flex-wrap gap-2">{Array.from(selectedCompany.roles).map((role) => <Pill key={role}>{role}</Pill>)}</div></div><button onClick={() => setSelectedCompanyKey("")} className="rounded-xl border border-border p-2"><X className="h-4 w-4"/></button></div>
          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-xl bg-muted/40 p-4"><div className="text-2xl font-bold">{selectedCompany.siteCount}</div><div className="text-xs text-muted-foreground">linked sites</div></div>
            <div className="rounded-xl bg-muted/40 p-4"><div className="text-2xl font-bold">{selectedCompany.activeCount}</div><div className="text-xs text-muted-foreground">active signals</div></div>
            <div className="rounded-xl bg-muted/40 p-4"><div className="text-2xl font-bold">{displayNumber(selectedCompany.permittedAcres, 1)}</div><div className="text-xs text-muted-foreground">stated permitted acres linked</div></div>
            <div className="rounded-xl bg-muted/40 p-4"><div className="text-2xl font-bold">{selectedCompany.states.size}</div><div className="text-xs text-muted-foreground">states represented</div></div>
          </div>
          <div className="mt-4 text-sm text-muted-foreground"><strong className="text-foreground">Counties:</strong> {Array.from(selectedCompany.counties).slice(0, 12).join(", ") || "—"}</div>
          <div className="mt-2 text-sm text-muted-foreground"><strong className="text-foreground">Commodities:</strong> {Array.from(selectedCompany.commodities).slice(0, 8).join(", ") || "—"}</div>
          <div className="mt-5 flex flex-wrap gap-2">
            {user?.id ? <button disabled={watchBusy === selectedCompany.key} onClick={() => toggleCompanyWatch(selectedCompany)} className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-xs font-bold text-white disabled:opacity-50">{watchFor(selectedCompany) ? <BellRing className="h-4 w-4"/> : <Bell className="h-4 w-4"/>}{watchFor(selectedCompany) ? "Watching company" : "Watch company"}</button> : <Link to={`/login?returnTo=${encodeURIComponent(`/network?company=${selectedCompany.name}`)}`} className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-xs font-bold text-white"><Bell className="h-4 w-4"/>Sign in to watch</Link>}
            <Link to={`/network/deals/new?company=${encodeURIComponent(selectedCompany.name)}`} className="inline-flex items-center gap-2 rounded-xl border border-border px-4 py-2.5 text-xs font-bold"><Target className="h-4 w-4"/>Post opportunity</Link>
            {members.some((member) => companyKey(member.company) === selectedCompany.key) && <Link to="/network/community?tab=people" className="inline-flex items-center gap-2 rounded-xl border border-border px-4 py-2.5 text-xs font-bold"><Users className="h-4 w-4"/>Network members at company</Link>}
          </div>
          <div className="mt-6 grid gap-3 lg:grid-cols-2">{selectedCompany.sites.slice(0, 20).map((site) => <Link key={site.id} to={`/mines/${site.id}`} className="rounded-2xl border border-border p-4 transition hover:bg-muted/30"><div className="flex items-start justify-between gap-3"><div><div className="font-heading font-bold">{site.mine_name}</div><div className="mt-1 text-xs text-muted-foreground">{[site.county, site.state, site.commodity].filter(Boolean).join(" · ")}</div></div><ArrowRight className="h-4 w-4 text-sky-700"/></div><div className="mt-3 flex flex-wrap gap-2"><Pill>{site.mine_status || "Status unknown"}</Pill>{site.msha_mine_id && <Pill>MSHA {site.msha_mine_id}</Pill>}</div></Link>)}</div>
        </section>}

        {tab === "companies" && <section className="mt-6">
          <div className="flex items-end justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[0.18em] text-sky-700">Ownership + control graph</p><h2 className="mt-1 font-heading text-2xl font-bold">Companies, operators, controllers &amp; landowners</h2></div><Link to="/ownership-intelligence" className="hidden text-sm font-bold text-sky-800 sm:inline">Full ownership tables</Link></div>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{filteredCompanies.slice(0, 120).map((company) => <article key={company.key} className="rounded-2xl border border-border bg-card p-5 shadow-sm">
            <div className="flex items-start justify-between gap-3"><div className="flex h-11 w-11 items-center justify-center rounded-xl bg-slate-900 text-white"><Building2 className="h-5 w-5"/></div>{watchFor(company) && <BellRing className="h-4 w-4 text-sky-700"/>}</div>
            <h3 className="mt-4 font-heading text-lg font-bold">{company.name}</h3>
            <div className="mt-2 flex flex-wrap gap-1.5">{Array.from(company.roles).map((role) => <Pill key={role}>{role}</Pill>)}</div>
            <div className="mt-4 grid grid-cols-3 gap-2 text-center"><div className="rounded-xl bg-muted/40 p-2"><div className="font-bold">{company.siteCount}</div><div className="text-[10px] text-muted-foreground">sites</div></div><div className="rounded-xl bg-muted/40 p-2"><div className="font-bold">{company.activeCount}</div><div className="text-[10px] text-muted-foreground">active</div></div><div className="rounded-xl bg-muted/40 p-2"><div className="font-bold">{company.states.size}</div><div className="text-[10px] text-muted-foreground">states</div></div></div>
            <div className="mt-3 text-xs leading-5 text-muted-foreground">{Array.from(company.counties).slice(0, 5).join(", ") || "County data unavailable"}</div>
            <Link to={`/network/company/${companySlug(company.name)}?name=${encodeURIComponent(company.name)}`} className="mt-4 inline-flex w-full items-center justify-between rounded-xl border border-border px-4 py-2.5 text-xs font-bold">Open company network <ArrowRight className="h-4 w-4 text-sky-700"/></Link>
          </article>)}</div>
          {filteredCompanies.length === 0 && <div className="mt-4 rounded-2xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">No company network records match those filters.</div>}
        </section>}

        {tab === "sites" && <section className="mt-6">
          <div><p className="text-xs font-bold uppercase tracking-[0.18em] text-sky-700">Linked quarry records</p><h2 className="mt-1 font-heading text-2xl font-bold">Quarries inside the network</h2></div>
          <div className="mt-4 grid gap-4 lg:grid-cols-2">{filteredSites.slice(0, 150).map((site) => <article key={site.id} className="rounded-2xl border border-border bg-card p-5 shadow-sm">
            <div className="flex items-start justify-between gap-3"><div><div className="flex items-center gap-2"><Mountain className="h-5 w-5 text-sky-700"/><h3 className="font-heading text-lg font-bold">{site.mine_name}</h3></div><div className="mt-1 text-xs text-muted-foreground">{[site.county, site.state, site.commodity].filter(Boolean).join(" · ")}</div></div><Pill>{site.mine_status || "Unknown"}</Pill></div>
            <div className="mt-4 space-y-2 text-sm"><div><span className="text-muted-foreground">Operator:</span> <strong>{site.operator_name || "—"}</strong></div><div><span className="text-muted-foreground">Controller:</span> <strong>{site.controller_name || "—"}</strong></div><div><span className="text-muted-foreground">Landowner:</span> <strong>{site.parcel_owner || "—"}</strong></div></div>
            <div className="mt-4 flex flex-wrap gap-2">{site.msha_mine_id && <Pill>MSHA {site.msha_mine_id}</Pill>}{site.permitted_acres ? <Pill>{displayNumber(site.permitted_acres,1)} permitted ac</Pill> : null}{site.acreage ? <Pill>{displayNumber(site.acreage,1)} parcel ac</Pill> : null}</div>
            <div className="mt-5 flex flex-wrap gap-2 border-t border-border pt-4"><Link to={`/mines/${site.id}`} className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-xs font-bold text-white">Open full intelligence <ArrowRight className="h-4 w-4"/></Link><WatchQuarryButton site={site}/><Link to={`/network/deals/new?site=${encodeURIComponent(site.id)}`} className="inline-flex items-center gap-2 rounded-xl border border-border px-3 py-2.5 text-xs font-bold"><Handshake className="h-4 w-4"/>Post deal</Link></div>
          </article>)}</div>
          {filteredSites.length === 0 && <div className="mt-4 rounded-2xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">No quarry records match those filters.</div>}
        </section>}

        {tab === "deals" && <section className="mt-6">
          <div className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[0.18em] text-sky-700">Transaction network</p><h2 className="mt-1 font-heading text-2xl font-bold">Open buyer &amp; seller opportunities</h2></div><Link to="/network/deals/new" className="rounded-xl bg-slate-900 px-4 py-2.5 text-xs font-bold text-white">Post an opportunity</Link></div>
          <div className="mt-4 grid gap-4 lg:grid-cols-2">{filteredDeals.map((item) => <article key={item.id} className="rounded-2xl border border-border bg-card p-5 shadow-sm">
            <div className="flex items-start justify-between gap-3"><div><Pill>{item.opportunity_type}</Pill><h3 className="mt-3 font-heading text-xl font-bold">{item.title}</h3><div className="mt-1 text-xs text-muted-foreground">{[item.author_name, item.author_company].filter(Boolean).join(" · ")}</div></div>{item.confidentiality === "NDA / Confidential" && <Pill>NDA</Pill>}</div>
            <p className="mt-4 text-sm leading-6 text-muted-foreground">{item.description}</p>
            <div className="mt-4 flex flex-wrap gap-2">{item.states && <Pill>{item.states}</Pill>}{item.commodities && <Pill>{item.commodities}</Pill>}{item.asset_types && <Pill>{item.asset_types}</Pill>}</div>
            <div className="mt-5 flex flex-wrap gap-2 border-t border-border pt-4">{item.linked_mining_site_id && <Link to={`/mines/${item.linked_mining_site_id}`} className="rounded-xl border border-border px-3 py-2 text-xs font-bold">Linked quarry intelligence</Link>}<Link to={`/network/deals/${item.id}`} className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-3 py-2 text-xs font-bold text-white"><Handshake className="h-4 w-4"/>Open deal workspace</Link></div>
          </article>)}</div>
          {filteredDeals.length === 0 && <div className="mt-4 rounded-2xl border border-dashed border-border p-10 text-center"><Target className="mx-auto h-8 w-8 text-muted-foreground"/><div className="mt-3 font-bold">No matching deal posts yet</div><p className="mt-1 text-sm text-muted-foreground">The intelligence network still works from live quarry data. Post what you need or what you have to create the transaction side of the network.</p><Link to="/network/deals/new" className="mt-4 inline-flex rounded-xl bg-slate-900 px-4 py-2.5 text-xs font-bold text-white">Create first deal post</Link></div>}
        </section>}

        <section className="mt-8 grid gap-4 sm:grid-cols-3">
          <Link to="/ownership-intelligence" className="rounded-2xl border border-border bg-card p-5"><Landmark className="h-5 w-5 text-sky-700"/><div className="mt-3 font-heading text-lg font-bold">Ownership &amp; Control</div><p className="mt-2 text-sm text-muted-foreground">Rank operators, landowners and controllers across linked sites.</p></Link>
          <Link to="/network/community?tab=people" className="rounded-2xl border border-border bg-card p-5"><Users className="h-5 w-5 text-sky-700"/><div className="mt-3 font-heading text-lg font-bold">Industry Directory</div><p className="mt-2 text-sm text-muted-foreground">Connect and message members who choose to join the S&amp;S industry network.</p></Link>
          <Link to="/network/community?tab=feed" className="rounded-2xl border border-border bg-card p-5"><Layers3 className="h-5 w-5 text-sky-700"/><div className="mt-3 font-heading text-lg font-bold">Industry Feed</div><p className="mt-2 text-sm text-muted-foreground">Share updates, equipment needs, hiring, projects and quarry-industry questions.</p></Link>
        </section>

        <div className="mt-6 rounded-2xl border border-border bg-card p-4 text-xs leading-5 text-muted-foreground"><MapPin className="mr-1 inline h-3.5 w-3.5"/>Network relationships are screening intelligence from linked public/regulatory records. Operator, controller, permittee and landowner are kept separate because they may be different parties. Acreage is only labeled permitted when a permit source supplies it.</div>
      </main>
    </div>
  );
}