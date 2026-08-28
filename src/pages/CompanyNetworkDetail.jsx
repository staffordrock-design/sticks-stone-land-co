import React, { useEffect, useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import {
  ArrowLeft, ArrowRight, Bell, BellRing, Building2, Factory, FileText, Handshake,
  Landmark, Layers3, Loader2, MapPin, Mountain, Network, ShieldCheck, Target
} from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";

const STATES = ["TN", "GA", "AL", "KY", "NC", "SC", "MS", "VA"];

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

function activeStatus(value) {
  const v = String(value || "").toLowerCase();
  return v.includes("active") || v.includes("new mine") || v.includes("intermittent") || v.includes("temporarily idled");
}

function isQuarryRelevant(site) {
  return !String(site?.commodity || "").toLowerCase().includes("coal");
}

function Pill({ children }) {
  return <span className="rounded-full bg-muted px-2.5 py-1 text-[10px] font-bold text-muted-foreground">{children}</span>;
}

function Stat({ value, label }) {
  return <div className="rounded-xl border border-border bg-card p-4"><div className="text-2xl font-bold">{value}</div><div className="mt-1 text-xs text-muted-foreground">{label}</div></div>;
}

export default function CompanyNetworkDetail() {
  const { companySlug } = useParams();
  const [params] = useSearchParams();
  const { user } = useAuth();
  const requestedName = params.get("name") || decodeURIComponent(companySlug || "").replace(/-/g, " ");
  const targetKey = companyKey(requestedName);

  const [sites, setSites] = useState([]);
  const [permits, setPermits] = useState([]);
  const [geology, setGeology] = useState([]);
  const [environmental, setEnvironmental] = useState([]);
  const [production, setProduction] = useState([]);
  const [contracts, setContracts] = useState([]);
  const [opportunities, setOpportunities] = useState([]);
  const [watch, setWatch] = useState(null);
  const [loading, setLoading] = useState(true);
  const [watchBusy, setWatchBusy] = useState(false);
  const [notice, setNotice] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const stateRows = await Promise.all(STATES.map((state) => base44.entities.MiningSite.filter({ state }, "mine_name", 500).catch(() => [])));
      const matched = stateRows.flat().filter((site) => isQuarryRelevant(site) && [site.operator_name, site.controller_name, site.parcel_owner, site.permittee_name].some((name) => companyKey(name) === targetKey));
      const ids = matched.map((site) => site.id);
      const mshaIds = matched.map((site) => String(site.msha_mine_id || "")).filter(Boolean);

      const byMsha = mshaIds.length ? { msha_mine_id: { $in: mshaIds } } : { msha_mine_id: "__none__" };
      const bySite = ids.length ? { mining_site_id: { $in: ids } } : { mining_site_id: "__none__" };
      const [permitRows, geologyRows, envRows, productionRows, contractRows, opportunityRows, watchRows] = await Promise.all([
        base44.entities.TDECPermit.filter(byMsha, "-last_source_update", 500).catch(() => []),
        base44.entities.GeologyRecord.filter(bySite, "-last_source_update", 500).catch(() => []),
        base44.entities.EnvironmentalRecord.filter(byMsha, "-last_source_update", 500).catch(() => []),
        base44.entities.ProductionRecord.filter(bySite, "-year", 500).catch(() => []),
        base44.entities.ContractIntelligence.filter(bySite, "-last_source_update", 500).catch(() => []),
        base44.entities.NetworkOpportunity.list("-created_at", 500).catch(() => []),
        user?.id ? base44.entities.CompanyWatch.filter({ user_id: user.id }, "-created_at", 500).catch(() => []) : Promise.resolve([]),
      ]);

      setSites(matched);
      setPermits(permitRows || []);
      setGeology(geologyRows || []);
      setEnvironmental(envRows || []);
      setProduction(productionRows || []);
      setContracts(contractRows || []);
      setOpportunities((opportunityRows || []).filter((row) => row.status !== "Closed" && companyKey(row.author_company) === targetKey));
      setWatch((watchRows || []).find((row) => companyKey(row.company_name) === targetKey) || null);
    } catch (error) {
      console.error("Company network detail load failed", error);
      setNotice("This company network could not load completely. Try again.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [targetKey, user?.id]);

  const company = useMemo(() => {
    const roles = new Set();
    const aliases = new Set();
    const counties = new Set();
    const states = new Set();
    const commodities = new Set();
    let permittedAcres = 0;
    let parcelAcres = 0;
    sites.forEach((site) => {
      [[site.operator_name, "Operator"], [site.controller_name, "Controller"], [site.parcel_owner, "Landowner"], [site.permittee_name, "Permittee"]].forEach(([name, role]) => {
        if (companyKey(name) === targetKey) { roles.add(role); if (name) aliases.add(cleanName(name)); }
      });
      if (site.county) counties.add(site.county);
      if (site.state) states.add(site.state);
      if (site.commodity) commodities.add(site.commodity);
      permittedAcres += Number(site.permitted_acres || 0);
      parcelAcres += Number(site.acreage || 0);
    });
    return {
      name: Array.from(aliases)[0] || requestedName,
      roles,
      counties,
      states,
      commodities,
      siteCount: sites.length,
      activeCount: sites.filter((site) => activeStatus(site.mine_status)).length,
      permittedAcres,
      parcelAcres,
    };
  }, [sites, targetKey, requestedName]);

  const toggleWatch = async () => {
    if (!user?.id) return;
    setWatchBusy(true);
    try {
      if (watch?.id) {
        await base44.entities.CompanyWatch.delete(watch.id);
        setWatch(null);
        setNotice("Company removed from your Network Watchlist.");
      } else {
        const created = await base44.entities.CompanyWatch.create({ user_id: user.id, company_name: company.name, relationship_type: "Any", created_at: new Date().toISOString() });
        setWatch(created);
        setNotice("Company added to your Network Watchlist.");
      }
    } catch (error) {
      console.error("Company watch failed", error);
      setNotice("Company watch did not update. Try again.");
    } finally { setWatchBusy(false); }
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center"><div className="text-center"><Loader2 className="mx-auto h-8 w-8 animate-spin"/><div className="mt-3 text-sm text-muted-foreground">Loading company network…</div></div></div>;

  return <div className="min-h-screen bg-slate-50 pb-28 dark:bg-background">
    <header className="border-b border-slate-800 bg-slate-950 text-white" style={{ paddingTop: "env(safe-area-inset-top, 16px)" }}>
      <div className="mx-auto max-w-7xl px-4 pb-7 pt-4 sm:px-6">
        <Link to="/network" className="inline-flex items-center gap-2 text-sm font-semibold text-slate-300"><ArrowLeft className="h-4 w-4"/>Quarry Network Intel</Link>
        <div className="mt-6 flex flex-wrap items-start justify-between gap-4">
          <div><div className="text-xs font-bold uppercase tracking-[0.18em] text-sky-300"><Network className="mr-2 inline h-4 w-4"/>Company Network Profile</div><h1 className="mt-2 font-heading text-3xl font-bold">{company.name}</h1><div className="mt-3 flex flex-wrap gap-2">{Array.from(company.roles).map((role) => <span key={role} className="rounded-full border border-slate-700 px-3 py-1 text-xs font-bold">{role}</span>)}</div></div>
          <div className="flex flex-wrap gap-2">{user?.id ? <button onClick={toggleWatch} disabled={watchBusy} className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-xs font-bold text-slate-950 disabled:opacity-50">{watch ? <BellRing className="h-4 w-4"/> : <Bell className="h-4 w-4"/>}{watch ? "Watching" : "Watch company"}</button> : <Link to={`/login?returnTo=${encodeURIComponent(window.location.pathname + window.location.search)}`} className="rounded-xl bg-white px-4 py-2.5 text-xs font-bold text-slate-950">Sign in to watch</Link>}<Link to={`/network/community?tab=opportunities&company=${encodeURIComponent(company.name)}`} className="rounded-xl border border-slate-700 px-4 py-2.5 text-xs font-bold">Post opportunity</Link></div>
        </div>
      </div>
    </header>

    <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
      {notice && <div className="mb-5 rounded-xl border border-sky-200 bg-sky-50 p-3 text-sm font-semibold text-sky-950">{notice}</div>}
      {sites.length === 0 ? <div className="rounded-2xl border border-dashed border-border bg-card p-10 text-center"><Building2 className="mx-auto h-9 w-9 text-muted-foreground"/><h2 className="mt-3 font-heading text-xl font-bold">No linked quarry records found</h2><p className="mt-2 text-sm text-muted-foreground">This company name is not currently linked to a quarry record in the loaded Southeast database.</p></div> : <>
        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><Stat value={company.siteCount} label="linked quarry / mine records"/><Stat value={company.activeCount} label="active / operating signals"/><Stat value={company.states.size} label="states represented"/><Stat value={company.permittedAcres ? company.permittedAcres.toLocaleString(undefined,{maximumFractionDigits:1}) : "—"} label="stated permitted acres linked"/></section>

        <section className="mt-6 rounded-2xl border border-border bg-card p-5"><div className="flex items-center gap-2"><Landmark className="h-5 w-5 text-sky-700"/><h2 className="font-heading text-xl font-bold">Network footprint</h2></div><div className="mt-4 grid gap-4 md:grid-cols-3"><div><div className="text-xs font-bold uppercase tracking-wider text-muted-foreground">States</div><div className="mt-2 text-sm">{Array.from(company.states).join(", ") || "—"}</div></div><div><div className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Counties</div><div className="mt-2 text-sm">{Array.from(company.counties).slice(0,25).join(", ") || "—"}</div></div><div><div className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Commodities</div><div className="mt-2 text-sm">{Array.from(company.commodities).slice(0,20).join(", ") || "—"}</div></div></div></section>

        <section className="mt-6"><div className="flex items-end justify-between gap-3"><div><div className="text-xs font-bold uppercase tracking-[0.18em] text-sky-700">Linked assets</div><h2 className="mt-1 font-heading text-2xl font-bold">Quarries in this company network</h2></div></div><div className="mt-4 grid gap-4 lg:grid-cols-2">{sites.map((site) => <article key={site.id} className="rounded-2xl border border-border bg-card p-5 shadow-sm"><div className="flex items-start justify-between gap-3"><div><div className="flex items-center gap-2"><Mountain className="h-5 w-5 text-sky-700"/><h3 className="font-heading text-lg font-bold">{site.mine_name}</h3></div><div className="mt-1 text-xs text-muted-foreground">{[site.county,site.state,site.commodity].filter(Boolean).join(" · ")}</div></div><Pill>{site.mine_status || "Unknown"}</Pill></div><div className="mt-4 space-y-2 text-sm"><div><span className="text-muted-foreground">Operator:</span> <strong>{site.operator_name || "—"}</strong></div><div><span className="text-muted-foreground">Controller:</span> <strong>{site.controller_name || "—"}</strong></div><div><span className="text-muted-foreground">Landowner:</span> <strong>{site.parcel_owner || "—"}</strong></div></div><div className="mt-5 flex flex-wrap gap-2"><Link to={`/mines/${site.id}`} className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-xs font-bold text-white">Open quarry intelligence <ArrowRight className="h-4 w-4"/></Link><Link to={`/network?site=${site.id}`} className="rounded-xl border border-border px-3 py-2.5 text-xs font-bold">View in network</Link></div></article>)}</div></section>

        <section className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <div className="rounded-2xl border border-border bg-card p-5"><ShieldCheck className="h-5 w-5 text-sky-700"/><div className="mt-3 font-heading text-lg font-bold">Permits</div><div className="mt-2 text-3xl font-bold">{permits.length}</div><p className="mt-2 text-sm text-muted-foreground">Linked TDEC / permit records found by MSHA mine ID.</p></div>
          <div className="rounded-2xl border border-border bg-card p-5"><Layers3 className="h-5 w-5 text-sky-700"/><div className="mt-3 font-heading text-lg font-bold">Geology</div><div className="mt-2 text-3xl font-bold">{geology.length}</div><p className="mt-2 text-sm text-muted-foreground">Linked geology records and rock-unit intelligence.</p></div>
          <div className="rounded-2xl border border-border bg-card p-5"><Factory className="h-5 w-5 text-sky-700"/><div className="mt-3 font-heading text-lg font-bold">Production</div><div className="mt-2 text-3xl font-bold">{production.length}</div><p className="mt-2 text-sm text-muted-foreground">Production/activity records tied to linked quarry sites.</p></div>
          <div className="rounded-2xl border border-border bg-card p-5"><MapPin className="h-5 w-5 text-sky-700"/><div className="mt-3 font-heading text-lg font-bold">Environmental</div><div className="mt-2 text-3xl font-bold">{environmental.length}</div><p className="mt-2 text-sm text-muted-foreground">Environmental and regulatory records linked by mine identity.</p></div>
          <div className="rounded-2xl border border-border bg-card p-5"><FileText className="h-5 w-5 text-sky-700"/><div className="mt-3 font-heading text-lg font-bold">Contracts / leases</div><div className="mt-2 text-3xl font-bold">{contracts.length}</div><p className="mt-2 text-sm text-muted-foreground">Lease, royalty, operating and other contract intelligence.</p></div>
          <div className="rounded-2xl border border-border bg-card p-5"><Handshake className="h-5 w-5 text-sky-700"/><div className="mt-3 font-heading text-lg font-bold">Open deals</div><div className="mt-2 text-3xl font-bold">{opportunities.length}</div><p className="mt-2 text-sm text-muted-foreground">Open network opportunities currently posted by this company.</p></div>
        </section>

        {(permits.length || geology.length || production.length || environmental.length || contracts.length || opportunities.length) > 0 && <section className="mt-8 rounded-2xl border border-border bg-card p-5"><div className="flex items-center gap-2"><Target className="h-5 w-5 text-sky-700"/><h2 className="font-heading text-xl font-bold">Network intelligence signals</h2></div><div className="mt-4 grid gap-3 md:grid-cols-2">{permits.slice(0,5).map((row) => <div key={`p-${row.id}`} className="rounded-xl bg-muted/30 p-4 text-sm"><strong>Permit:</strong> {row.permit_number || row.npdes_permit_number || "Record"}<div className="mt-1 text-xs text-muted-foreground">{[row.facility_name,row.status,row.permitted_acres ? `${row.permitted_acres} acres` : null].filter(Boolean).join(" · ")}</div></div>)}{geology.slice(0,5).map((row) => <div key={`g-${row.id}`} className="rounded-xl bg-muted/30 p-4 text-sm"><strong>Geology:</strong> {row.primary_rock || row.lithology || row.geologic_unit || "Mapped geology"}<div className="mt-1 text-xs text-muted-foreground">{[row.mine_name,row.confidence].filter(Boolean).join(" · ")}</div></div>)}{contracts.slice(0,5).map((row) => <div key={`c-${row.id}`} className="rounded-xl bg-muted/30 p-4 text-sm"><strong>{row.agreement_type || "Contract"}</strong><div className="mt-1 text-xs text-muted-foreground">{[row.mine_name,row.verification_status,row.deal_signal].filter(Boolean).join(" · ")}</div></div>)}</div></section>}
      </>}
    </main>
  </div>;
}
