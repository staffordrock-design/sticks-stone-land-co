import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, ArrowRight, BellRing, Building2, Loader2, Mountain, Network, Trash2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";

function slug(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "company";
}

export default function NetworkWatchlist() {
  const { user } = useAuth();
  const [companyWatches, setCompanyWatches] = useState([]);
  const [quarryWatches, setQuarryWatches] = useState([]);
  const [sites, setSites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState("");

  const load = async () => {
    if (!user?.id) { setLoading(false); return; }
    setLoading(true);
    try {
      const [companies, saved] = await Promise.all([
        base44.entities.CompanyWatch.filter({ user_id: user.id }, "-created_at", 500).catch(() => []),
        base44.entities.SavedOpportunity.filter({ user_id: user.id }, "-saved_at", 500).catch(() => []),
      ]);
      const siteRows = await Promise.all((saved || []).filter((row) => row.mining_site_id).slice(0, 250).map((row) => base44.entities.MiningSite.get(row.mining_site_id).catch(() => null)));
      setCompanyWatches(companies || []);
      setQuarryWatches(saved || []);
      setSites(siteRows.filter(Boolean));
    } catch (error) {
      console.error("Network watchlist load failed", error);
      setNotice("Your Network Watchlist could not load completely. Try again.");
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [user?.id]);

  const removeCompany = async (id) => {
    try { await base44.entities.CompanyWatch.delete(id); setCompanyWatches((rows) => rows.filter((row) => row.id !== id)); setNotice("Company removed from Network Watchlist."); }
    catch { setNotice("Company watch could not be removed."); }
  };

  const removeQuarry = async (id) => {
    try { await base44.entities.SavedOpportunity.delete(id); setQuarryWatches((rows) => rows.filter((row) => row.id !== id)); setNotice("Quarry removed from Network Watchlist."); }
    catch { setNotice("Quarry watch could not be removed."); }
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin"/></div>;

  if (!user?.id) return <div className="min-h-screen bg-slate-50 p-6 dark:bg-background"><div className="mx-auto max-w-2xl rounded-2xl border border-border bg-card p-8 text-center"><BellRing className="mx-auto h-9 w-9 text-sky-700"/><h1 className="mt-3 font-heading text-2xl font-bold">Network Watchlist</h1><p className="mt-2 text-sm text-muted-foreground">Sign in to save companies and quarry targets.</p><Link to="/login?returnTo=/network/watchlist" className="mt-5 inline-flex rounded-xl bg-slate-900 px-5 py-3 text-sm font-bold text-white">Sign in</Link></div></div>;

  const siteById = new Map(sites.map((site) => [site.id, site]));

  return <div className="min-h-screen bg-slate-50 pb-28 dark:bg-background">
    <header className="border-b border-slate-800 bg-slate-950 text-white" style={{ paddingTop: "env(safe-area-inset-top, 16px)" }}><div className="mx-auto max-w-7xl px-4 pb-7 pt-4 sm:px-6"><Link to="/network" className="inline-flex items-center gap-2 text-sm font-semibold text-slate-300"><ArrowLeft className="h-4 w-4"/>Quarry Network Intel</Link><div className="mt-5 flex items-center gap-3"><BellRing className="h-7 w-7 text-sky-300"/><div><div className="text-xs font-bold uppercase tracking-[0.18em] text-sky-300">Your acquisition radar</div><h1 className="font-heading text-3xl font-bold">Network Watchlist</h1></div></div></div></header>
    <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
      {notice && <div className="mb-5 rounded-xl border border-sky-200 bg-sky-50 p-3 text-sm font-semibold text-sky-950">{notice}</div>}
      <section><div className="flex items-end justify-between gap-3"><div><div className="text-xs font-bold uppercase tracking-[0.18em] text-sky-700">Companies</div><h2 className="mt-1 font-heading text-2xl font-bold">Watched operators, controllers &amp; owners</h2></div><div className="text-sm font-bold text-muted-foreground">{companyWatches.length}</div></div>
        <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">{companyWatches.map((watch) => <article key={watch.id} className="rounded-2xl border border-border bg-card p-5"><div className="flex items-start justify-between gap-3"><div className="flex h-11 w-11 items-center justify-center rounded-xl bg-slate-900 text-white"><Building2 className="h-5 w-5"/></div><button onClick={() => removeCompany(watch.id)} className="rounded-lg border border-border p-2 text-muted-foreground" aria-label="Remove company"><Trash2 className="h-4 w-4"/></button></div><h3 className="mt-4 font-heading text-lg font-bold">{watch.company_name}</h3><div className="mt-1 text-xs text-muted-foreground">{watch.relationship_type || "Any relationship"}</div><Link to={`/network/company/${slug(watch.company_name)}?name=${encodeURIComponent(watch.company_name)}`} className="mt-4 inline-flex w-full items-center justify-between rounded-xl border border-border px-4 py-2.5 text-xs font-bold">Open company network <ArrowRight className="h-4 w-4 text-sky-700"/></Link></article>)}{companyWatches.length === 0 && <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground md:col-span-2 xl:col-span-3">No companies watched yet. Open a company in Quarry Network Intel and tap Watch company.</div>}</div>
      </section>

      <section className="mt-10"><div className="flex items-end justify-between gap-3"><div><div className="text-xs font-bold uppercase tracking-[0.18em] text-sky-700">Quarries</div><h2 className="mt-1 font-heading text-2xl font-bold">Watched quarry targets</h2></div><div className="text-sm font-bold text-muted-foreground">{quarryWatches.length}</div></div>
        <div className="mt-4 grid gap-4 lg:grid-cols-2">{quarryWatches.map((watch) => { const site = siteById.get(watch.mining_site_id); return <article key={watch.id} className="rounded-2xl border border-border bg-card p-5"><div className="flex items-start justify-between gap-3"><div><div className="flex items-center gap-2"><Mountain className="h-5 w-5 text-sky-700"/><h3 className="font-heading text-lg font-bold">{site?.mine_name || watch.resource_name}</h3></div><div className="mt-1 text-xs text-muted-foreground">{site ? [site.county,site.state,site.commodity].filter(Boolean).join(" · ") : "Saved quarry intelligence target"}</div></div><button onClick={() => removeQuarry(watch.id)} className="rounded-lg border border-border p-2 text-muted-foreground" aria-label="Remove quarry"><Trash2 className="h-4 w-4"/></button></div>{site && <div className="mt-4 text-sm"><div><span className="text-muted-foreground">Operator:</span> <strong>{site.operator_name || "—"}</strong></div><div className="mt-1"><span className="text-muted-foreground">Controller:</span> <strong>{site.controller_name || "—"}</strong></div></div>}<div className="mt-5 flex flex-wrap gap-2">{site && <Link to={`/mines/${site.id}`} className="rounded-xl bg-slate-900 px-4 py-2.5 text-xs font-bold text-white">Open full intelligence</Link>}{site && <Link to={`/network?site=${site.id}`} className="inline-flex items-center gap-2 rounded-xl border border-border px-3 py-2.5 text-xs font-bold"><Network className="h-4 w-4"/>View in network</Link>}</div></article>; })}{quarryWatches.length === 0 && <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground lg:col-span-2">No quarry targets watched yet.</div>}</div>
      </section>
    </main>
  </div>;
}
