import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, ArrowRight, Database, Gem, Gauge, Landmark, Layers3, MapPin, Mountain, Search, ShieldCheck, TrendingUp } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { calculateOpportunityScore } from "@/utils/opportunityScore";

const STATES = ["All Southeast", "TN", "GA", "AL", "KY", "NC", "SC", "FL", "MS"];
const MATERIALS = ["All materials", "Limestone", "Crushed Stone", "Sand & Gravel", "Granite", "Dolomite", "Marble", "Quartz", "Clay", "Shale", "Slate"];

function isQuarryRelevant(site) {
  const text = `${site?.commodity || ""} ${site?.mine_name || ""}`.toLowerCase();
  if (text.includes("coal")) return false;
  return /stone|limestone|sand|gravel|aggregate|granite|marble|dolomite|quartz|clay|shale|slate|rock|lime/.test(text);
}

function materialMatch(site, material) {
  if (material === "All materials") return true;
  const text = `${site?.commodity || ""} ${site?.mine_name || ""}`.toLowerCase();
  if (material === "Crushed Stone") return /crushed|broken|aggregate/.test(text);
  if (material === "Sand & Gravel") return /sand|gravel/.test(text);
  return text.includes(material.toLowerCase());
}

function statusBucket(status = "") {
  const s = String(status).toLowerCase();
  if (s.includes("active") && !s.includes("inactive")) return "Active";
  if (/intermittent|idled|inactive|nonproducing|non-producing/.test(s)) return "Idled / Inactive";
  if (/abandon|historical/.test(s)) return "Historical";
  return "Potential / Other";
}

function compact(value) {
  const n = Number(value);
  return Number.isFinite(n) ? new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(n) : "—";
}

function Stat({ icon: Icon, label, value, note }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground"><Icon className="h-4 w-4 text-sky-700" />{label}</div>
      <div className="mt-2 font-heading text-3xl font-bold text-foreground">{value}</div>
      {note && <div className="mt-1 text-xs leading-5 text-muted-foreground">{note}</div>}
    </div>
  );
}

export default function MineralValueGuide() {
  const [state, setState] = useState("TN");
  const [material, setMaterial] = useState("All materials");
  const [query, setQuery] = useState("");
  const [sites, setSites] = useState([]);
  const [geology, setGeology] = useState([]);
  const [permits, setPermits] = useState([]);
  const [environmental, setEnvironmental] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const states = state === "All Southeast" ? STATES.slice(1) : [state];
        const siteRows = (await Promise.all(states.map((code) =>
          base44.entities.MiningSite.filter({ state: code }, "-updated_date", state === "All Southeast" ? 120 : 400).catch(() => [])
        ))).flat().filter(isQuarryRelevant);

        const mineIds = new Set(siteRows.map((s) => s.msha_mine_id).filter(Boolean));
        const siteIds = new Set(siteRows.map((s) => s.id));
        const parcelIds = new Set(siteRows.map((s) => s.parcel_id).filter(Boolean));
        const permitNumbers = new Set(siteRows.map((s) => s.tdec_permit_number).filter(Boolean));

        const [geoRows, permitRows, envRows, profileRows] = await Promise.all([
          base44.entities.GeologyRecord.list("-updated_date", 500).catch(() => []),
          base44.entities.TDECPermit.list("-last_source_update", 500).catch(() => []),
          base44.entities.EnvironmentalRecord.list("-last_source_update", 500).catch(() => []),
          base44.entities.QuarryPotentialProfile.list("-updated_date", 500).catch(() => []),
        ]);

        if (cancelled) return;
        setSites(siteRows);
        setGeology((geoRows || []).filter((g) => siteIds.has(g.mining_site_id) || mineIds.has(g.msha_mine_id) || parcelIds.has(g.parcel_id)));
        setPermits((permitRows || []).filter((p) => mineIds.has(p.msha_mine_id) || permitNumbers.has(p.permit_number)));
        setEnvironmental((envRows || []).filter((e) => mineIds.has(e.msha_mine_id)));
        setProfiles((profileRows || []).filter((p) => siteIds.has(p.mining_site_id) || mineIds.has(p.msha_mine_id)));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [state]);

  const geologyFor = (s) => geology.find((g) => g.mining_site_id === s.id || (s.msha_mine_id && g.msha_mine_id === s.msha_mine_id) || (s.parcel_id && g.parcel_id === s.parcel_id));
  const permitsFor = (s) => permits.filter((p) => (s.msha_mine_id && p.msha_mine_id === s.msha_mine_id) || (s.tdec_permit_number && p.permit_number === s.tdec_permit_number));
  const environmentalFor = (s) => environmental.filter((e) => s.msha_mine_id && e.msha_mine_id === s.msha_mine_id);
  const profileFor = (s) => profiles.find((p) => p.mining_site_id === s.id || (s.msha_mine_id && p.msha_mine_id === s.msha_mine_id));

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return sites.filter((s) => materialMatch(s, material) && (!q || [s.mine_name, s.operator_name, s.county, s.commodity, s.msha_mine_id, s.tdec_permit_number].some((v) => String(v || "").toLowerCase().includes(q))));
  }, [sites, material, query]);

  const enriched = useMemo(() => filtered.map((site) => {
    const geo = geologyFor(site);
    const sitePermits = permitsFor(site);
    const env = environmentalFor(site);
    const profile = profileFor(site);
    const opportunity = calculateOpportunityScore({ site, geology: geo, permits: sitePermits, environmental: env, profile });
    const permittedAcres = sitePermits.find((p) => Number(p.permitted_acres) > 0)?.permitted_acres ?? site.permitted_acres;
    return { site, geo, permits: sitePermits, env, profile, opportunity, permittedAcres };
  }).sort((a, b) => Number(b.opportunity?.score || 0) - Number(a.opportunity?.score || 0)), [filtered, geology, permits, environmental, profiles]);

  const summary = useMemo(() => {
    const active = enriched.filter((r) => statusBucket(r.site.mine_status) === "Active").length;
    const idled = enriched.filter((r) => statusBucket(r.site.mine_status) === "Idled / Inactive").length;
    const geologyLinked = enriched.filter((r) => r.geo).length;
    const permittedKnown = enriched.filter((r) => Number(r.permittedAcres) > 0).length;
    const totalPermittedAcres = enriched.reduce((sum, r) => sum + (Number(r.permittedAcres) || 0), 0);
    const operators = new Set(enriched.map((r) => r.site.operator_name).filter(Boolean)).size;
    return { active, idled, geologyLinked, permittedKnown, totalPermittedAcres, operators };
  }, [enriched]);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-slate-950 text-white" style={{ paddingTop: "env(safe-area-inset-top, 16px)" }}>
        <div className="mx-auto max-w-7xl px-6 pb-8 pt-5">
          <Link to="/intelligence" className="inline-flex items-center gap-2 text-sm font-semibold text-slate-300 hover:text-white"><ArrowLeft className="h-4 w-4" /> Intelligence Center</Link>
          <div className="mt-7 max-w-3xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-sky-400/30 bg-sky-400/10 px-3 py-1 text-xs font-bold uppercase tracking-[0.18em] text-sky-200"><Gem className="h-3.5 w-3.5" /> Material opportunity intelligence</div>
            <h1 className="mt-4 font-heading text-4xl font-bold tracking-tight sm:text-5xl">Find where the valuable quarry material actually is.</h1>
            <p className="mt-4 max-w-2xl text-sm leading-6 text-slate-300 sm:text-base">Screen the live S&amp;S quarry database by state and material, then see operating activity, permitted acreage coverage, geology confidence and the strongest targets instead of reading a generic mineral glossary.</p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-10 pb-28">
        <section className="rounded-3xl border border-border bg-card p-5 sm:p-6">
          <div className="grid gap-4 lg:grid-cols-[180px_220px_1fr]">
            <label className="block"><span className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-muted-foreground">State</span><select value={state} onChange={(e) => setState(e.target.value)} className="w-full rounded-xl border border-input bg-background px-4 py-3 text-sm">{STATES.map((s) => <option key={s}>{s}</option>)}</select></label>
            <label className="block"><span className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-muted-foreground">Material</span><select value={material} onChange={(e) => setMaterial(e.target.value)} className="w-full rounded-xl border border-input bg-background px-4 py-3 text-sm">{MATERIALS.map((m) => <option key={m}>{m}</option>)}</select></label>
            <label className="block"><span className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-muted-foreground">Search targets</span><div className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Mine, operator, county, MSHA ID, permit…" className="w-full rounded-xl border border-input bg-background py-3 pl-10 pr-4 text-sm" /></div></label>
          </div>
        </section>

        <section className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Stat icon={Database} label="Matching quarry records" value={loading ? "—" : enriched.length.toLocaleString()} note={`${state} · ${material}`} />
          <Stat icon={Mountain} label="Active operations" value={loading ? "—" : summary.active.toLocaleString()} note={`${summary.idled.toLocaleString()} idled / inactive records`} />
          <Stat icon={Layers3} label="Geology linked" value={loading ? "—" : `${summary.geologyLinked.toLocaleString()}/${enriched.length.toLocaleString()}`} note="Source-linked rock/geology records" />
          <Stat icon={ShieldCheck} label="Known permitted acres" value={loading ? "—" : compact(summary.totalPermittedAcres)} note={`${summary.permittedKnown.toLocaleString()} records with permit acreage`} />
        </section>

        <section className="mt-8 grid gap-6 lg:grid-cols-[1fr_320px]">
          <div>
            <div className="flex items-end justify-between gap-4">
              <div><p className="text-xs font-bold uppercase tracking-[0.18em] text-sky-700">Target ranking</p><h2 className="mt-1 font-heading text-2xl font-bold">Highest-priority quarry records</h2></div>
              <Link to="/compare" className="hidden text-sm font-bold text-sky-800 hover:underline sm:inline">Compare targets</Link>
            </div>

            <div className="mt-5 space-y-3">
              {loading ? <div className="rounded-2xl border border-border p-8 text-sm text-muted-foreground">Loading material intelligence…</div> : enriched.length === 0 ? <div className="rounded-2xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">No quarry records match this material/state combination.</div> : enriched.slice(0, 20).map(({ site, geo, permittedAcres, opportunity }) => (
                <Link key={site.id} to={`/mines/${site.id}`} className="group block rounded-2xl border border-border bg-card p-5 transition hover:-translate-y-0.5 hover:shadow-lg">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="font-heading text-lg font-bold text-foreground">{site.mine_name}</h3><span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-700">{statusBucket(site.mine_status)}</span></div><div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground"><span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{[site.county, site.state].filter(Boolean).join(", ")}</span>{site.msha_mine_id && <span>MSHA {site.msha_mine_id}</span>}</div></div>
                    <div className="shrink-0 text-right"><div className="inline-flex items-center gap-1 text-xs font-bold uppercase tracking-wider text-sky-700"><Gauge className="h-3.5 w-3.5" />Score</div><div className="font-heading text-2xl font-bold">{Math.round(opportunity?.score || 0)}<span className="text-xs text-muted-foreground">/100</span></div></div>
                  </div>
                  <div className="mt-4 grid gap-3 sm:grid-cols-3">
                    <div className="rounded-xl bg-muted/30 p-3"><div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Material / geology</div><div className="mt-1 text-sm font-semibold">{geo?.primary_rock || geo?.lithology || site.commodity || "Pending"}</div></div>
                    <div className="rounded-xl bg-muted/30 p-3"><div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Operator</div><div className="mt-1 text-sm font-semibold">{site.operator_name || "Pending"}</div></div>
                    <div className="rounded-xl bg-muted/30 p-3"><div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Permitted acres</div><div className="mt-1 text-sm font-semibold">{Number(permittedAcres) > 0 ? Number(permittedAcres).toLocaleString() : "Pending"}</div></div>
                  </div>
                  <div className="mt-4 flex items-center justify-end gap-1 text-xs font-bold text-sky-800">Open full quarry intelligence <ArrowRight className="h-3.5 w-3.5 transition group-hover:translate-x-1" /></div>
                </Link>
              ))}
            </div>
          </div>

          <aside className="space-y-5">
            <div className="rounded-2xl border border-border bg-card p-5"><div className="flex items-center gap-2 text-sky-700"><Landmark className="h-5 w-5" /><span className="text-xs font-bold uppercase tracking-[0.16em]">Market structure</span></div><div className="mt-3 font-heading text-3xl font-bold">{summary.operators.toLocaleString()}</div><div className="text-sm text-muted-foreground">distinct operators in the current result set</div></div>
            <div className="rounded-2xl border border-slate-700 bg-slate-950 p-5 text-white"><div className="flex items-center gap-2 text-sky-300"><TrendingUp className="h-5 w-5" /><span className="text-xs font-bold uppercase tracking-[0.16em]">How to use this</span></div><div className="mt-4 space-y-3 text-sm leading-6 text-slate-300"><p><strong className="text-white">1.</strong> Pick the material and state you care about.</p><p><strong className="text-white">2.</strong> Use the ranking to find the best-connected quarry records.</p><p><strong className="text-white">3.</strong> Open a target for ownership, permits, geology, production, compliance and valuation context.</p><p><strong className="text-white">4.</strong> Compare the strongest targets before ordering deeper diligence.</p></div></div>
            <Link to="/mineral-intelligence" className="group block rounded-2xl border border-border bg-card p-5"><div className="flex items-center gap-2 text-sky-700"><MapPin className="h-5 w-5" /><span className="font-bold">USGS Mineral Occurrence Map</span></div><p className="mt-2 text-sm leading-6 text-muted-foreground">Use the regional mineral map when you want to look beyond known quarry records and spot broader mineral clusters and historical producers.</p><div className="mt-3 inline-flex items-center gap-1 text-sm font-bold text-sky-800">Open map <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" /></div></Link>
          </aside>
        </section>
      </main>
    </div>
  );
}
