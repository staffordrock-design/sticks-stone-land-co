import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { ArrowLeft, Building2, Factory, Landmark, Layers3, ShieldCheck } from "lucide-react";

function norm(value) {
  return String(value || "").trim();
}

function addGroup(map, key, site, acreage = 0) {
  if (!key) return;
  const name = norm(key);
  if (!name) return;
  if (!map.has(name)) map.set(name, { name, sites: 0, active: 0, acreage: 0, counties: new Set() });
  const row = map.get(name);
  row.sites += 1;
  if (String(site?.mine_status || "").toLowerCase().includes("active")) row.active += 1;
  row.acreage += Number(acreage || 0);
  if (site?.county) row.counties.add(site.county);
}

function Table({ title, icon: Icon, rows, measureLabel }) {
  return (
    <section className="rounded-2xl border border-border bg-card p-6">
      <div className="mb-4 flex items-center gap-2"><Icon className="h-5 w-5 text-sky-700"/><h2 className="font-heading text-xl font-bold">{title}</h2></div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground"><th className="pb-3">Name</th><th className="pb-3">Sites</th><th className="pb-3">Active</th><th className="pb-3">{measureLabel}</th><th className="pb-3">Counties</th></tr></thead>
          <tbody>{rows.map((r) => <tr key={r.name} className="border-b border-border/50 last:border-0"><td className="py-3 font-semibold text-foreground">{r.name}</td><td className="py-3">{r.sites}</td><td className="py-3">{r.active}</td><td className="py-3">{measureLabel === "Linked acreage" ? (r.acreage ? r.acreage.toLocaleString(undefined,{maximumFractionDigits:1}) : "—") : r.sites}</td><td className="py-3 text-muted-foreground">{Array.from(r.counties).slice(0,5).join(", ") || "—"}</td></tr>)}</tbody>
        </table>
      </div>
    </section>
  );
}

export default function OwnershipIntelligence() {
  const [sites, setSites] = useState([]);
  const [parcels, setParcels] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [siteRows, parcelRows] = await Promise.all([
          base44.entities.MiningSite.list("mine_name", 500),
          base44.entities.ParcelRecord.list("owner_name", 500),
        ]);
        setSites(siteRows || []);
        setParcels(parcelRows || []);
      } finally { setLoading(false); }
    })();
  }, []);

  const analysis = useMemo(() => {
    const operators = new Map();
    const controllers = new Map();
    const owners = new Map();
    const parcelByMine = new Map(parcels.filter(p => p.msha_mine_id).map(p => [String(p.msha_mine_id), p]));

    sites.forEach(site => {
      const parcel = site.msha_mine_id ? parcelByMine.get(String(site.msha_mine_id)) : null;
      const acreage = Number(parcel?.acreage ?? site.acreage ?? 0);
      addGroup(operators, site.operator_name, site, acreage);
      addGroup(controllers, site.controller_name, site, acreage);
      addGroup(owners, parcel?.owner_name || site.parcel_owner, site, acreage);
    });

    parcels.forEach(parcel => {
      if (!parcel.owner_name) return;
      if (![...sites].some(s => s.msha_mine_id && String(s.msha_mine_id) === String(parcel.msha_mine_id))) {
        addGroup(owners, parcel.owner_name, { county: parcel.county, mine_status: "" }, Number(parcel.acreage || 0));
      }
    });

    const sortSites = (m) => Array.from(m.values()).sort((a,b) => b.sites - a.sites || b.acreage - a.acreage);
    const sortAcres = (m) => Array.from(m.values()).sort((a,b) => b.acreage - a.acreage || b.sites - a.sites);
    return { operators: sortSites(operators), controllers: sortSites(controllers), owners: sortAcres(owners) };
  }, [sites, parcels]);

  if (loading) return <div className="min-h-screen p-10 text-center text-muted-foreground">Building ownership intelligence…</div>;

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border"><div className="mx-auto max-w-7xl px-6 py-4"><Link to="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground"><ArrowLeft className="h-4 w-4"/>Back to marketplace</Link></div></header>
      <main className="mx-auto max-w-7xl px-6 py-10">
        <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">S&amp;S Market Intelligence</p>
        <h1 className="mt-2 font-heading text-3xl font-bold">Quarry Ownership &amp; Control</h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground">Separates landowner, operator and controller because they are often different parties. Rankings are only as complete as the linked public records; missing ownership is shown as missing rather than inferred.</p>

        <div className="mt-8 grid gap-4 sm:grid-cols-3">
          <div className="rounded-2xl border border-border bg-card p-5"><Factory className="h-5 w-5 text-sky-700"/><div className="mt-3 text-3xl font-bold">{analysis.operators.length}</div><div className="text-sm text-muted-foreground">named operators in current data</div></div>
          <div className="rounded-2xl border border-border bg-card p-5"><Landmark className="h-5 w-5 text-sky-700"/><div className="mt-3 text-3xl font-bold">{analysis.owners.length}</div><div className="text-sm text-muted-foreground">linked landowners</div></div>
          <div className="rounded-2xl border border-border bg-card p-5"><Layers3 className="h-5 w-5 text-sky-700"/><div className="mt-3 text-3xl font-bold">{analysis.controllers.length}</div><div className="text-sm text-muted-foreground">named controllers / parent-level records</div></div>
        </div>

        <div className="mt-6 rounded-2xl border border-sky-200 bg-sky-50 p-5 text-sm text-sky-950"><div className="flex items-center gap-2 font-bold"><ShieldCheck className="h-4 w-4"/>Industry benchmark source</div><p className="mt-2 leading-6">Rock Products Magazine publishes USGS Top 100 producer rankings. The 2023 crushed-stone production ranking placed Vulcan Materials first nationally and Rogers Group seventh. This is producer scale, not proof of Tennessee land ownership, so S&amp;S keeps the industry ranking separate from parcel/deed ownership.</p></div>

        <div className="mt-8 grid gap-6 xl:grid-cols-2">
          <Table title="Operators by linked site count" icon={Factory} rows={analysis.operators.slice(0,25)} measureLabel="Site count" />
          <Table title="Landowners by linked acreage" icon={Landmark} rows={analysis.owners.slice(0,25)} measureLabel="Linked acreage" />
          <Table title="Controllers / parent records" icon={Building2} rows={analysis.controllers.slice(0,25)} measureLabel="Site count" />
        </div>
      </main>
    </div>
  );
}
