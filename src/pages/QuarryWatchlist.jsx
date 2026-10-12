import React, { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { ArrowLeft, Bell, Bookmark, LockKeyhole, Plus, Trash2, TrendingUp } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { useProfessionalAccess } from "@/hooks/useProfessionalAccess";
import BottomSheetSelect from "@/components/BottomSheetSelect";

const FREQUENCIES = ["Instant", "Daily", "Weekly"];
const FREE_SAVE_LIMIT = 2;

export default function QuarryWatchlist() {
  const { user } = useAuth();
  const { hasProfessional } = useProfessionalAccess();
  const location = useLocation();
  const fromTab = location.state?.fromTab;
  const [saved, setSaved] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ name: "Southeast quarry opportunities", states: "TN, GA", commodities: "Limestone, Crushed Stone", min_acres: "", max_acres: "", max_price: "", frequency: "Weekly" });
  const [saving, setSaving] = useState(false);

  const load = async () => {
    if (!user?.id) { setLoading(false); return; }
    setLoading(true);
    try {
      const [savedRows, alertRows] = await Promise.all([
        base44.entities.SavedOpportunity.filter({ user_id: user.id }, "-saved_at", 200),
        base44.entities.BuyerAlert.filter({ user_id: user.id }, "-updated_date", 100),
      ]);
      setSaved(savedRows || []);
      setAlerts(alertRows || []);
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [user?.id]);

  const savedCount = saved.length;
  const atFreeLimit = !hasProfessional && savedCount >= FREE_SAVE_LIMIT;

  const createAlert = async (e) => {
    e.preventDefault();
    if (!user?.id || !form.name.trim()) return;
    if (!hasProfessional) return; // alerts are a paid feature
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

  // Unauthenticated: show a preview page, NOT a subscription redirect.
  if (!user?.id) return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border"><div className="mx-auto flex max-w-6xl items-center px-6 py-4">{!fromTab && <Link to="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground"><ArrowLeft className="h-4 w-4"/>Marketplace</Link>}</div></header>
      <main className="mx-auto max-w-4xl px-6 py-12">
        <Bell className="mx-auto h-10 w-10 text-sky-700"/>
        <h1 className="mt-4 text-center font-heading text-3xl font-bold">Save Quarry Targets & Get Alerts</h1>
        <p className="mx-auto mt-3 max-w-2xl text-center text-sm leading-6 text-muted-foreground">Create a free S&amp;S account to save up to {FREE_SAVE_LIMIT} quarry targets. Paid members get unlimited saves, automated alerts, and data-update notifications.</p>

        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          <div className="rounded-2xl border border-border bg-card p-5">
            <Bookmark className="h-5 w-5 text-sky-700"/>
            <h2 className="mt-2 font-bold">Save up to {FREE_SAVE_LIMIT} targets (free)</h2>
            <p className="mt-1 text-sm text-muted-foreground">Open any quarry record and tap "Watch this quarry." Your saved targets stay in your account across devices.</p>
          </div>
          <div className="rounded-2xl border border-sky-200 bg-sky-50/50 p-5">
            <Bell className="h-5 w-5 text-sky-700"/>
            <h2 className="mt-2 font-bold">Unlimited saves + alerts (paid)</h2>
            <p className="mt-1 text-sm text-muted-foreground">Full Quarry Intelligence members get unlimited saved targets, automated alerts when new data arrives, and data-update notifications.</p>
          </div>
        </div>

        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link to={`/register?returnTo=${encodeURIComponent("/watchlist")}`} className="inline-flex min-h-12 items-center justify-center rounded-xl bg-stone-900 px-6 py-3 text-sm font-bold text-white">Create free account</Link>
          <Link to={`/login?returnTo=${encodeURIComponent("/watchlist")}`} className="inline-flex min-h-12 items-center justify-center rounded-xl border border-border px-6 py-3 text-sm font-bold text-foreground">Sign in</Link>
        </div>
      </main>
    </div>
  );

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border"><div className="mx-auto flex max-w-6xl items-center px-6 py-4">{!fromTab && <Link to="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground"><ArrowLeft className="h-4 w-4"/>Marketplace</Link>}</div></header>
      <main className="mx-auto max-w-6xl px-6 py-10">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-sky-700">Buyer workspace</p>
        <h1 className="mt-2 font-heading text-3xl font-bold">Saved Properties & Alerts</h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground">Save quarry records you care about and define exactly what kind of new opportunity you want S&amp;S to surface. This becomes your recurring acquisition radar rather than a one-time search.</p>

        {/* Free user limit notice */}
        {!hasProfessional && (
          <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-5">
            <div className="flex items-start gap-3">
              <LockKeyhole className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
              <div>
                <p className="font-bold text-amber-950">Free account: {savedCount} of {FREE_SAVE_LIMIT} targets saved</p>
                <p className="mt-1 text-sm text-amber-800">You can save up to {FREE_SAVE_LIMIT} quarry targets with a free account. Upgrade to Full Quarry Intelligence for unlimited saved targets, automated alerts, and data-update notifications.</p>
                <Link to="/subscribe" className="mt-3 inline-flex min-h-10 items-center gap-2 rounded-xl bg-amber-700 px-4 py-2 text-xs font-bold text-white hover:bg-amber-800">
                  <TrendingUp className="h-4 w-4" /> Unlock unlimited saves — $39/month
                </Link>
              </div>
            </div>
          </div>
        )}

        {/* Alert creation — paid feature */}
        {hasProfessional ? (
          <section className="mt-8 rounded-2xl border border-border bg-card p-6">
            <div className="flex items-center gap-2"><Bell className="h-5 w-5 text-sky-700"/><h2 className="font-heading text-xl font-bold">Create an opportunity alert</h2></div>
            <form onSubmit={createAlert} className="mt-5 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              <Field label="Alert name"><input className="input" value={form.name} onChange={(e)=>setForm({...form,name:e.target.value})} placeholder="Tennessee limestone targets" required /></Field>
              <Field label="States"><input className="input" value={form.states} onChange={(e)=>setForm({...form,states:e.target.value})} placeholder="TN, GA, AL" /></Field>
              <Field label="Commodities"><input className="input" value={form.commodities} onChange={(e)=>setForm({...form,commodities:e.target.value})} placeholder="Limestone, crushed stone" /></Field>
              <Field label="Minimum acres"><input className="input" inputMode="decimal" value={form.min_acres} onChange={(e)=>setForm({...form,min_acres:e.target.value})} /></Field>
              <Field label="Maximum acres"><input className="input" inputMode="decimal" value={form.max_acres} onChange={(e)=>setForm({...form,max_acres:e.target.value})} /></Field>
              <Field label="Maximum price"><input className="input" inputMode="decimal" value={form.max_price} onChange={(e)=>setForm({...form,max_price:e.target.value})} /></Field>
              <Field label="Frequency"><BottomSheetSelect value={form.frequency} onChange={(v)=>setForm({...form,frequency:v})} options={FREQUENCIES} label="Frequency" /></Field>
              <div className="flex items-end"><button disabled={saving} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-stone-900 px-5 py-3 text-sm font-bold text-white disabled:opacity-50"><Plus className="h-4 w-4"/>{saving?"Saving…":"Create alert"}</button></div>
            </form>
          </section>
        ) : (
          <section className="mt-8 rounded-2xl border border-dashed border-border bg-muted/20 p-6 text-center">
            <Bell className="mx-auto h-6 w-6 text-muted-foreground"/>
            <h2 className="mt-2 font-bold text-foreground">Automated alerts are a paid feature</h2>
            <p className="mt-1 text-sm text-muted-foreground">Full Quarry Intelligence members can create automated alerts that surface new quarry opportunities matching their criteria. Upgrade to unlock alerts and data-update notifications.</p>
            <Link to="/subscribe" className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-xl bg-sky-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-sky-500">
              <TrendingUp className="h-4 w-4" /> Unlock alerts — $39/month
            </Link>
          </section>
        )}

        <section className="mt-8 grid gap-6 lg:grid-cols-2">
          <div className="rounded-2xl border border-border bg-card p-6">
            <div className="flex items-center gap-2"><Bookmark className="h-5 w-5 text-sky-700"/><h2 className="font-heading text-xl font-bold">Saved properties</h2></div>
            <div className="mt-4 space-y-3">{loading?<p className="text-sm text-muted-foreground">Loading…</p>:saved.length===0?<p className="rounded-xl border border-dashed border-border p-6 text-sm text-muted-foreground">No saved quarry records yet. Open a site and tap "Watch this quarry."</p>:saved.map((item)=><div key={item.id} className="rounded-xl border border-border p-4"><div className="flex items-start justify-between gap-3"><div><div className="font-semibold">{item.resource_name}</div><div className="mt-1 text-xs text-muted-foreground">Saved opportunity</div></div><button onClick={()=>removeSaved(item.id)} className="rounded-lg border border-border p-2 text-muted-foreground hover:text-destructive"><Trash2 className="h-4 w-4"/></button></div>{item.mining_site_id&&<Link to={`/mines/${item.mining_site_id}`} className="mt-3 inline-block text-sm font-semibold text-sky-800">Open intelligence →</Link>}</div>)}</div>
          </div>

          <div className="rounded-2xl border border-border bg-card p-6">
            <div className="flex items-center gap-2"><Bell className="h-5 w-5 text-sky-700"/><h2 className="font-heading text-xl font-bold">Your active alerts</h2></div>
            <div className="mt-4 space-y-3">{loading?<p className="text-sm text-muted-foreground">Loading…</p>:alerts.length===0?<p className="rounded-xl border border-dashed border-border p-6 text-sm text-muted-foreground">{hasProfessional ? "No alerts yet. Create one above to turn S&S into a recurring quarry-opportunity radar." : "Automated alerts are a paid feature. Upgrade to create alerts and get notified when new data arrives."}</p>:alerts.map((a)=><div key={a.id} className="rounded-xl border border-border p-4"><div className="flex items-start justify-between gap-3"><div><div className="font-semibold">{a.name}</div><div className="mt-1 text-xs text-muted-foreground">{[a.states,a.commodities,a.min_acres?`${Number(a.min_acres).toLocaleString()}+ acres`:null,a.frequency].filter(Boolean).join(" · ")}</div></div><button onClick={()=>removeAlert(a.id)} className="rounded-lg border border-border p-2 text-muted-foreground hover:text-destructive"><Trash2 className="h-4 w-4"/></button></div><button onClick={()=>toggleAlert(a)} className={`mt-3 rounded-full px-3 py-1.5 text-xs font-bold ${a.active?"bg-emerald-100 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-200":"bg-muted text-muted-foreground"}`}>{a.active?"Active":"Paused"}</button></div>)}</div>
          </div>
        </section>
      </main>
    </div>
  );
}

function Field({label,children}){return <label className="block"><span className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</span>{children}</label>}