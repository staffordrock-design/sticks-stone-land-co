import React, { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowLeft, BarChart3, Check, Crown, Plus, X } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { calculateOpportunityScore } from "@/utils/opportunityScore";
import { calculateIndicativeQuarryValue, formatCompactMoney } from "@/utils/quarryValuation";
import { currentAppleSubscriptionAccess, isNativeIOS } from "@/lib/appleSubscriptions";

const MAX_COMPARE = 5;

function value(v, fallback = "—") {
  return v === null || v === undefined || v === "" ? fallback : v;
}

function num(v, suffix = "") {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? `${n.toLocaleString(undefined, { maximumFractionDigits: 1 })}${suffix}` : "—";
}

function riskLabel(environmental = [], violations = []) {
  const penalties = environmental.reduce((sum, r) => sum + Number(r.penalty_amount || 0), 0) + violations.reduce((sum, r) => sum + Number(r.assessment_amount || r.proposed_penalty || 0), 0);
  const count = environmental.length + violations.length;
  if (!count) return "No connected flags";
  if (penalties >= 50000 || count >= 10) return "Higher review priority";
  if (penalties > 0 || count >= 3) return "Moderate review priority";
  return "Lower review priority";
}

export default function QuarryCompare() {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const [sites, setSites] = useState([]);
  const [selected, setSelected] = useState([]);
  const [records, setRecords] = useState({});
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [hasProfessional, setHasProfessional] = useState(user?.role === "admin");

  useEffect(() => {
    (async () => {
      try {
        const [siteRows, entitlements] = await Promise.all([
          base44.entities.MiningSite.list("mine_name", 500),
          user?.id ? base44.entities.SubscriptionEntitlement.filter({ user_id: user.id }, "-updated_date", 20) : Promise.resolve([]),
        ]);
        setSites(siteRows || []);
        const appleAccess = isNativeIOS() ? await currentAppleSubscriptionAccess().catch(() => null) : null;
        const entitlementProfessional = (entitlements || []).some((e) =>
          ["active","trial","grace_period"].includes(e.status) &&
          (/^professional(_|$)/.test(String(e.plan_code || "")) || /^deal(_|$)/.test(String(e.plan_code || "")))
        );
        setHasProfessional(user?.role === "admin" || Boolean(appleAccess?.professional) || entitlementProfessional);
        const ids = String(params.get("ids") || "").split(",").filter(Boolean).slice(0, MAX_COMPARE);
        const initial = ids.map((id) => (siteRows || []).find((s) => s.id === id)).filter(Boolean);
        setSelected(initial);
      } finally { setLoading(false); }
    })();
  }, [user?.id, user?.role]);

  useEffect(() => {
    setParams(selected.length ? { ids: selected.map((s) => s.id).join(",") } : {});
    if (!selected.length) return;
    (async () => {
      const next = { ...records };
      await Promise.all(selected.map(async (site) => {
        if (next[site.id]) return;
        const siteLink = { $or: [{ mining_site_id: site.id }, ...(site.msha_mine_id ? [{ msha_mine_id: site.msha_mine_id }] : [])] };
        const parcelConditions = [site.parcel_id ? { parcel_id: site.parcel_id } : null, site.msha_mine_id ? { msha_mine_id: site.msha_mine_id } : null, site.tdec_permit_number ? { tdec_permit_number: site.tdec_permit_number } : null].filter(Boolean);
        const permitConditions = [site.msha_mine_id ? { msha_mine_id: site.msha_mine_id } : null, site.tdec_permit_number ? { permit_number: site.tdec_permit_number } : null].filter(Boolean);
        const environmentalConditions = [site.msha_mine_id ? { msha_mine_id: site.msha_mine_id } : null, site.npdes_permit_number ? { npdes_permit_number: site.npdes_permit_number } : null].filter(Boolean);
        const [parcels, geology, permits, environmental, violations, production, profiles] = await Promise.all([
          parcelConditions.length ? base44.entities.ParcelRecord.filter({ $or: parcelConditions }, "-updated_date", 10).catch(() => []) : [],
          base44.entities.GeologyRecord.filter(siteLink, "-updated_date", 10).catch(() => []),
          permitConditions.length ? base44.entities.TDECPermit.filter({ $or: permitConditions }, "-updated_date", 10).catch(() => []) : [],
          environmentalConditions.length ? base44.entities.EnvironmentalRecord.filter({ $or: environmentalConditions }, "-updated_date", 50).catch(() => []) : [],
          site.msha_mine_id ? base44.entities.MSHAViolation.filter({ msha_mine_id: site.msha_mine_id }, "-issue_date", 100).catch(() => []) : [],
          base44.entities.ProductionRecord.filter(siteLink, "-year", 30).catch(() => []),
          base44.entities.QuarryPotentialProfile.filter(siteLink, "-updated_date", 5).catch(() => []),
        ]);
        const parcel = parcels?.[0] || null;
        const geo = geology?.[0] || null;
        const profile = profiles?.[0] || null;
        const opportunity = calculateOpportunityScore({ site, parcel, geology: geo, permits, environmental, profile });
        const valuation = calculateIndicativeQuarryValue({ site, parcel, geology: geo, profile });
        const latestProduction = (production || []).find((r) => Number(r.production_amount) > 0) || (production || [])[0] || null;
        next[site.id] = { parcel, geology: geo, permits, environmental, violations, production: latestProduction, opportunity, valuation };
      }));
      setRecords(next);
    })();
  }, [selected.map((s) => s.id).join(",")]);

  const options = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return sites.slice(0, 40);
    return sites.filter((s) => [s.mine_name,s.operator_name,s.county,s.state,s.commodity,s.msha_mine_id].some((v) => String(v || "").toLowerCase().includes(q))).slice(0, 40);
  }, [sites, query]);

  const add = (site) => {
    if (!site || selected.some((s) => s.id === site.id) || selected.length >= MAX_COMPARE) return;
    setSelected((current) => [...current, site]);
    setQuery("");
  };

  const rows = [
    ["Opportunity score", (s, r) => r?.opportunity?.score != null ? `${Math.round(r.opportunity.score)}/100` : "—"],
    ["Status", (s) => value(s.mine_status)],
    ["Commodity", (s) => value(s.commodity)],
    ["Operator", (s) => value(s.operator_name)],
    ["Land owner", (s, r) => hasProfessional ? value(r?.parcel?.owner_name || s.parcel_owner) : "Professional"],
    ["Parcel acres", (s, r) => hasProfessional ? num(r?.parcel?.acreage ?? s.acreage, " ac") : "Professional"],
    ["Permitted acres", (s, r) => hasProfessional ? num((r?.permits || []).find((p) => Number(p.permitted_acres) > 0)?.permitted_acres ?? s.permitted_acres, " ac") : "Professional"],
    ["Rock / geology", (s, r) => hasProfessional ? value(r?.geology?.primary_rock || r?.geology?.lithology) : "Professional"],
    ["Production context", (s, r) => hasProfessional ? (r?.production?.production_amount ? `${num(r.production.production_amount)} ${r.production.production_unit || ""}`.trim() : value(r?.production?.employee_hours ? `${num(r.production.employee_hours)} employee hrs` : null)) : "Professional"],
    ["Compliance review", (s, r) => hasProfessional ? riskLabel(r?.environmental || [], r?.violations || []) : "Professional"],
    ["Indicative value", (s, r) => hasProfessional ? (r?.valuation?.mid ? formatCompactMoney(r.valuation.mid) : "—") : "Professional"],
    ["Data confidence", (s, r) => hasProfessional ? value(r?.opportunity?.confidence || r?.geology?.confidence) : "Professional"],
  ];

  return <div className="min-h-screen bg-background">
    <header className="border-b border-border bg-background/95"><div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4"><Link to="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground"><ArrowLeft className="h-4 w-4"/>Marketplace</Link><Link to="/subscribe" className="inline-flex items-center gap-2 text-sm font-semibold text-sky-800"><Crown className="h-4 w-4"/>Plans</Link></div></header>
    <main className="mx-auto max-w-7xl px-6 py-10">
      <p className="text-xs font-bold uppercase tracking-[0.2em] text-sky-700">Decision tool</p>
      <h1 className="mt-2 font-heading text-3xl font-bold">Compare Quarry Opportunities</h1>
      <p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground">Put up to five quarry records side by side. Professional members see ownership, permitted acreage, geology, production context, compliance review and S&amp;S screening intelligence in the same decision table.</p>

      <div className="mt-7 rounded-2xl border border-border bg-card p-5">
        <div className="flex items-center gap-2 font-semibold"><Plus className="h-4 w-4 text-sky-700"/>Add a quarry</div>
        <input value={query} onChange={(e)=>setQuery(e.target.value)} placeholder="Search mine, county, operator, MSHA ID…" className="mt-3 w-full rounded-xl border border-input bg-background px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-ring" />
        {query && <div className="mt-2 max-h-64 overflow-auto rounded-xl border border-border bg-background">{options.map((s)=><button key={s.id} type="button" onClick={()=>add(s)} className="flex w-full items-center justify-between gap-3 border-b border-border/60 px-4 py-3 text-left text-sm last:border-0 hover:bg-muted/40"><span><strong>{s.mine_name}</strong><span className="ml-2 text-muted-foreground">{[s.county,s.state].filter(Boolean).join(", ")}</span></span>{selected.some((x)=>x.id===s.id)?<Check className="h-4 w-4 text-emerald-600"/>:<Plus className="h-4 w-4 text-sky-700"/>}</button>)}</div>}
        <div className="mt-4 flex flex-wrap gap-2">{selected.map((s)=><span key={s.id} className="inline-flex items-center gap-2 rounded-full border border-border bg-muted/30 px-3 py-2 text-xs font-semibold">{s.mine_name}<button onClick={()=>setSelected((cur)=>cur.filter((x)=>x.id!==s.id))}><X className="h-3.5 w-3.5"/></button></span>)}<span className="px-2 py-2 text-xs text-muted-foreground">{selected.length}/{MAX_COMPARE} selected</span></div>
      </div>

      {!hasProfessional && <div className="mt-5 rounded-2xl border border-sky-200 bg-sky-50 p-5 text-sm text-sky-950"><strong>Professional comparison is locked.</strong> You can compare public mine identity now; ownership, acreage reconciliation, geology, production, compliance and valuation columns unlock with Professional Intelligence. <Link to="/subscribe" className="font-bold underline">See Professional</Link>.</div>}

      {loading ? <div className="mt-8 text-sm text-muted-foreground">Loading quarry intelligence…</div> : selected.length < 2 ? <div className="mt-8 rounded-2xl border border-dashed border-border p-12 text-center"><BarChart3 className="mx-auto h-8 w-8 text-muted-foreground"/><div className="mt-3 font-semibold">Choose at least two quarries to compare.</div></div> : <div className="mt-8 overflow-x-auto rounded-2xl border border-border bg-card">
        <table className="min-w-[900px] w-full text-sm"><thead><tr className="border-b border-border bg-muted/30"><th className="sticky left-0 z-10 bg-muted/30 px-4 py-4 text-left text-xs uppercase tracking-wider text-muted-foreground">Metric</th>{selected.map((s)=><th key={s.id} className="min-w-[210px] px-4 py-4 text-left"><Link to={`/mines/${s.id}`} className="font-heading text-base font-bold hover:text-sky-800">{s.mine_name}</Link><div className="mt-1 text-xs font-normal text-muted-foreground">{[s.county,s.state].filter(Boolean).join(", ")}</div></th>)}</tr></thead><tbody>{rows.map(([label,render])=><tr key={label} className="border-b border-border/60 last:border-0"><td className="sticky left-0 bg-card px-4 py-3 text-xs font-bold uppercase tracking-wider text-muted-foreground">{label}</td>{selected.map((s)=><td key={s.id} className="px-4 py-3 font-medium text-foreground">{render(s, records[s.id])}</td>)}</tr>)}</tbody></table>
      </div>}
    </main>
  </div>;
}
