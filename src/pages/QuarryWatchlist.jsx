import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Bell, Bookmark, Plus, Trash2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";

const FREQUENCIES = ["Instant", "Daily", "Weekly"];

export default function QuarryWatchlist() {
  const { user } = useAuth();
  const [saved, setSaved] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [sites, setSites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ name: "Southeast quarry opportunities", states: "TN, GA", commodities: "Limestone, Crushed Stone", min_acres: "", max_acres: "", max_price: "", frequency: "Weekly" });
  const [saving, setSaving] = useState(false);

  const load = async () => {
    if (!user?.id) { setLoading(false); return; }
    setLoading(true);
    try {
      const [savedRows, alertRows, siteRows] = await Promise.all([
        base44.entities.SavedOpportunity.filter({ user_id: user.id }, "-saved_at", 200),
        base44.entities.BuyerAlert.filter({ user_id: user.id }, "-updated_date", 100),
        base44.entities.MiningSite.list("mine_name", 500),
      ]);
      setSaved(savedRows || []);
      setAlerts(alertRows || []);
      setSites(siteRows || []);
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [user?.id]);

  const savedSites = useMemo(() => {
    const byId = new Map(sites.map((s) => [s.id, s]));
    return saved.map((item) => ({ ...item, site: item.mining_site_id ? byId.get(item.mining_site_id) : null }));
  }, [saved, sites]);

  const createAlert = async (e) => {
    e.preventDefault();
    if (!user?.id || !form.name.trim()) return;
    setSaving(true);
    try {
      await base44.entities.BuyerAlert.create({
        user_id: user.id,
        name: form.name.trim(),
        states: form.states.trim(),
        commodities: form.commodities.trim(),
        min_acres: form.min_acres ? Number(form.min_acres) : null,
        max_acres: form.max_acres ? Number(form.max_acres) : null,
        max_price: form.max_price ? Number(form.max_price) : null,
        asset_types: "Quarry, Aggregate, Potential Quarry Land",
        frequency: form.frequency,
        active: true,
      });
      setForm((f) => ({ ...f, name: "", min_acres: "", max_acres: "", max_price: "" }));
      await load();
    } finally { setSaving(false); }
  };

  const removeSaved = async (id) => { await base44.entities.SavedOpportunity.delete(id); await load(); };
  const removeAlert = async (id) => { await base44.entities.BuyerAlert.delete(id); await load(); };
  const toggleAlert = async (alert) => { await base44.entities.BuyerAlert.update(alert.id, { active: !alert.active }); await load(); };

  if (!user?.id) return <div className="min-h-screen bg-background px-6 py-16 text-center"><Bell className="mx-auto h-9 w-9 text-muted-foreground"/><h1 className="mt-4 font-heading text-2xl font-bold">Sign in to watch quarry opportunities</h1><p className="mt-2 text-sm text-muted-foreground">Your saved sites and alert criteria are tied to your S&amp;S account.</p><Link to="/login?returnTo=/watchlist" className="mt-6 inline-block rounded-xl bg-stone-900 px-5 py-3 text-sm font-bold text-white">Sign in</Link></div>;

  return <div className="min-h-screen bg-background">
    <header className="border-b border-border"><div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4"><Link to="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground"><ArrowLeft className="h-4 w-4"/>Marketplace</Link><Link to="/compare" className="text-sm font-semibold text-sky-800">Compare quarries</Link></div></header>
    <main className="mx-auto max-w-6xl px-6 py-10">
      <p className="text-xs font-bold uppercase tracking-[0.2em] text-sky-700">Buyer workspace</p>
      <h1 className="mt-2 font-heading text-3xl font-bold">Quarry Watchlist & Alerts</h1>
      <p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground">Save quarry records you care about and define exactly what kind of new opportunity you want S&amp;S to surface. This becomes your recurring acquisition radar rather than a one-time search.</p>

      <section className="mt-8 rounded-2xl border border-border bg-card p-6">
        <div className="flex items-center gap-2"><Bell className="h-5 w-5 text-sky-700"/><h2 className="font-heading text-xl font-bold">Create an opportunity alert</h2></div>
        <form onSubmit={createAlert} className="mt-5 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <Field label="Alert name"><input className="input" value={form.name} onChange={(e)=>setForm({...form,name:e.target.value})} placeholder="Tennessee limestone targets" required /></Field>
          <Field label="States"><input className="input" value={form.states} onChange={(e)=>setForm({...form,states:e.target.value})} placeholder="TN, GA, AL" /></Field>
          <Field label="Commodities"><input className="input" value={form.commodities} onChange={(e)=>setForm({...form,commodities:e.target.value})} placeholder="Limestone, crushed stone" /></Field>
          <Field label="Minimum acres"><input className="input" inputMode="decimal" value={form.min_acres} onChange={(e)=>setForm({...form,min_acres:e.target.value})} /></Field>
          <Field label="Maximum acres"><input className="input" inputMode="decimal" value={form.max_acres} onChange={(e)=>setForm({...form,max_acres:e.target.value})} /></Field>
          <Field label="Maximum price"><input className="input" inputMode="decimal" value={form.max_price} onChange={(e)=>setForm({...form,max_price:e.target.value})} /></Field>
          <Field label="Frequency"><select className="input" value={form.frequency} onChange={(e)=>setForm({...form,frequency:e.target.value})}>{FREQUENCIES.map((f)=><option key={f}>{f}</option>)}</select></Field>
          <div className="flex items-end"><button disabled={saving} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-stone-900 px-5 py-3 text-sm font-bold text-white disabled:opacity-50"><Plus className="h-4 w-4"/>{saving?"Saving…":"Create alert"}</button></div>
        </form>
      </section>

      <section className="mt-8 grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-border bg-card p-6">
          <div className="flex items-center gap-2"><Bookmark className="h-5 w-5 text-sky-700"/><h2 className="font-heading text-xl font-bold">Saved quarries</h2></div>
          <div className="mt-4 space-y-3">{loading?<p className="text-sm text-muted-foreground">Loading…</p>:savedSites.length===0?<p className="rounded-xl border border-dashed border-border p-6 text-sm text-muted-foreground">No saved quarry records yet. Open a site and tap “Watch this quarry.”</p>:savedSites.map((item)=><div key={item.id} className="rounded-xl border border-border p-4"><div className="flex items-start justify-between gap-3"><div><div className="font-semibold">{item.resource_name}</div><div className="mt-1 text-xs text-muted-foreground">{item.site ? [item.site.county,item.site.state,item.site.commodity].filter(Boolean).join(" · ") : "Saved opportunity"}</div></div><button onClick={()=>removeSaved(item.id)} className="rounded-lg border border-border p-2 text-muted-foreground hover:text-destructive"><Trash2 className="h-4 w-4"/></button></div>{item.mining_site_id&&<Link to={`/mines/${item.mining_site_id}`} className="mt-3 inline-block text-sm font-semibold text-sky-800">Open intelligence →</Link>}</div>)}</div>
        </div>

        <div className="rounded-2xl border border-border bg-card p-6">
          <div className="flex items-center gap-2"><Bell className="h-5 w-5 text-sky-700"/><h2 className="font-heading text-xl font-bold">Your active alerts</h2></div>
          <div className="mt-4 space-y-3">{loading?<p className="text-sm text-muted-foreground">Loading…</p>:alerts.length===0?<p className="rounded-xl border border-dashed border-border p-6 text-sm text-muted-foreground">No alerts yet. Create one above to turn S&amp;S into a recurring quarry-opportunity radar.</p>:alerts.map((a)=><div key={a.id} className="rounded-xl border border-border p-4"><div className="flex items-start justify-between gap-3"><div><div className="font-semibold">{a.name}</div><div className="mt-1 text-xs text-muted-foreground">{[a.states,a.commodities,a.min_acres?`${Number(a.min_acres).toLocaleString()}+ acres`:null,a.frequency].filter(Boolean).join(" · ")}</div></div><button onClick={()=>removeAlert(a.id)} className="rounded-lg border border-border p-2 text-muted-foreground hover:text-destructive"><Trash2 className="h-4 w-4"/></button></div><button onClick={()=>toggleAlert(a)} className={`mt-3 rounded-full px-3 py-1.5 text-xs font-bold ${a.active?"bg-emerald-100 text-emerald-900":"bg-muted text-muted-foreground"}`}>{a.active?"Active":"Paused"}</button></div>)}</div>
        </div>
      </section>
    </main>
  </div>;
}

function Field({label,children}){return <label className="block"><span className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</span>{children}</label>}
