import React, { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, Handshake, Loader2, Mountain, Network, ShieldCheck } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";

function numberOrUndefined(value) {
  if (value === "" || value == null) return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

export default function NetworkPostDeal() {
  const { user } = useAuth();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const siteId = params.get("site") || "";
  const companyParam = params.get("company") || "";
  const [site, setSite] = useState(null);
  const [profile, setProfile] = useState(null);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [form, setForm] = useState({
    opportunity_type: "Have / Offering",
    title: "",
    description: "",
    states: "",
    counties: "",
    commodities: "",
    asset_types: "Quarry / Mineral Property",
    min_acres: "",
    max_acres: "",
    budget_min: "",
    budget_max: "",
    asking_price: "",
    confidentiality: "Network",
  });

  useEffect(() => {
    (async () => {
      if (siteId) {
        const row = await base44.entities.MiningSite.get(siteId).catch(() => null);
        if (row) {
          setSite(row);
          setForm((current) => ({
            ...current,
            opportunity_type: "Have / Offering",
            title: current.title || `${row.mine_name || "Quarry"} opportunity`,
            description: current.description || `Quarry / mineral property opportunity linked to ${row.mine_name || "this S&S quarry record"}.`,
            states: current.states || row.state || "",
            counties: current.counties || row.county || "",
            commodities: current.commodities || row.commodity || "",
          }));
        }
      }
      if (user?.id) {
        const rows = await base44.entities.UserProfile.filter({ user_id: user.id }, "-updated_date", 1).catch(() => []);
        setProfile(rows?.[0] || null);
      }
    })();
  }, [siteId, user?.id]);

  const set = (field) => (event) => setForm((current) => ({ ...current, [field]: event.target.value }));

  const submit = async (event) => {
    event.preventDefault();
    if (!user?.id) return;
    if (!form.title.trim() || !form.description.trim()) {
      setNotice("Add a title and description before posting.");
      return;
    }
    setSaving(true);
    setNotice("");
    try {
      await base44.entities.NetworkOpportunity.create({
        author_user_id: user.id,
        author_name: profile?.full_name || user.full_name || user.email || "S&S member",
        author_company: companyParam || profile?.company || "",
        author_headline: profile?.headline || profile?.role_title || "",
        opportunity_type: form.opportunity_type,
        title: form.title.trim(),
        description: form.description.trim(),
        states: form.states.trim(),
        counties: form.counties.trim(),
        commodities: form.commodities.trim(),
        asset_types: form.asset_types.trim(),
        min_acres: numberOrUndefined(form.min_acres),
        max_acres: numberOrUndefined(form.max_acres),
        budget_min: numberOrUndefined(form.budget_min),
        budget_max: numberOrUndefined(form.budget_max),
        asking_price: numberOrUndefined(form.asking_price),
        linked_mining_site_id: site?.id || "",
        linked_listing_id: site?.listing_id || "",
        confidentiality: form.confidentiality,
        status: "Open",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
      navigate("/network/deals?posted=1", { replace: true });
    } catch (error) {
      console.error("Network deal post failed", error);
      setNotice("The deal did not post. Please try again.");
    } finally { setSaving(false); }
  };

  if (!user?.id) return <div className="min-h-screen bg-slate-50 p-6 dark:bg-background"><div className="mx-auto max-w-2xl rounded-2xl border border-border bg-card p-8 text-center"><Handshake className="mx-auto h-9 w-9 text-sky-700"/><h1 className="mt-3 font-heading text-2xl font-bold">Post to the Deal Network</h1><p className="mt-2 text-sm text-muted-foreground">Sign in to post a buyer requirement, quarry offering, lease, sale, JV or operating opportunity.</p><Link to={`/login?returnTo=${encodeURIComponent(window.location.pathname + window.location.search)}`} className="mt-5 inline-flex rounded-xl bg-slate-900 px-5 py-3 text-sm font-bold text-white">Sign in</Link></div></div>;

  return <div className="min-h-screen bg-slate-50 pb-28 dark:bg-background">
    <header className="border-b border-slate-800 bg-slate-950 text-white" style={{ paddingTop: "env(safe-area-inset-top, 16px)" }}><div className="mx-auto max-w-4xl px-4 pb-7 pt-4 sm:px-6"><Link to="/network/deals" className="inline-flex items-center gap-2 text-sm font-semibold text-slate-300"><ArrowLeft className="h-4 w-4"/>Deal Network</Link><div className="mt-5 flex items-center gap-3"><Network className="h-7 w-7 text-sky-300"/><div><div className="text-xs font-bold uppercase tracking-[0.18em] text-sky-300">Transaction network</div><h1 className="font-heading text-3xl font-bold">Post a quarry opportunity</h1></div></div></div></header>
    <main className="mx-auto max-w-4xl px-4 py-6 sm:px-6">
      {site && <div className="mb-5 rounded-2xl border border-sky-200 bg-sky-50 p-4 text-sky-950"><div className="flex items-center gap-2 font-bold"><Mountain className="h-4 w-4"/>Linked quarry record</div><div className="mt-2 text-sm">{site.mine_name} · {[site.county,site.state,site.commodity].filter(Boolean).join(" · ")}</div></div>}
      {notice && <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm font-semibold text-amber-950">{notice}</div>}
      <form onSubmit={submit} className="space-y-5 rounded-3xl border border-border bg-card p-5 shadow-sm sm:p-7">
        <div className="grid gap-4 sm:grid-cols-2"><label className="text-sm font-bold">Opportunity type<select value={form.opportunity_type} onChange={set("opportunity_type")} className="input mt-2"><option>Have / Offering</option><option>Looking For</option></select></label><label className="text-sm font-bold">Visibility<select value={form.confidentiality} onChange={set("confidentiality")} className="input mt-2"><option>Network</option><option>NDA / Confidential</option></select></label></div>
        <label className="block text-sm font-bold">Title<input value={form.title} onChange={set("title")} maxLength={180} className="input mt-2" placeholder="Example: East Tennessee limestone quarry available for lease"/></label>
        <label className="block text-sm font-bold">Description<textarea value={form.description} onChange={set("description")} maxLength={3000} className="mt-2 min-h-36 w-full rounded-xl border border-border bg-background p-3 text-sm" placeholder="Describe what you have or what you are looking for, including deal structure, quarry status and key criteria."/></label>
        <div className="grid gap-4 sm:grid-cols-2"><label className="text-sm font-bold">States<input value={form.states} onChange={set("states")} className="input mt-2" placeholder="TN, GA, AL"/></label><label className="text-sm font-bold">Counties / markets<input value={form.counties} onChange={set("counties")} className="input mt-2" placeholder="Polk, Bradley, Chattanooga market"/></label></div>
        <div className="grid gap-4 sm:grid-cols-2"><label className="text-sm font-bold">Commodity / rock<input value={form.commodities} onChange={set("commodities")} className="input mt-2" placeholder="Limestone, granite, sand & gravel"/></label><label className="text-sm font-bold">Asset type<input value={form.asset_types} onChange={set("asset_types")} className="input mt-2" placeholder="Quarry, mineral property, lease, plant"/></label></div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"><label className="text-sm font-bold">Min acres<input type="number" value={form.min_acres} onChange={set("min_acres")} className="input mt-2"/></label><label className="text-sm font-bold">Max acres<input type="number" value={form.max_acres} onChange={set("max_acres")} className="input mt-2"/></label><label className="text-sm font-bold">Budget min<input type="number" value={form.budget_min} onChange={set("budget_min")} className="input mt-2"/></label><label className="text-sm font-bold">Budget max<input type="number" value={form.budget_max} onChange={set("budget_max")} className="input mt-2"/></label></div>
        {form.opportunity_type === "Have / Offering" && <label className="block max-w-sm text-sm font-bold">Asking price / value signal<input type="number" value={form.asking_price} onChange={set("asking_price")} className="input mt-2"/></label>}
        <div className="rounded-xl border border-border bg-muted/20 p-4 text-xs leading-5 text-muted-foreground"><ShieldCheck className="mr-1 inline h-4 w-4"/>Use NDA / Confidential for opportunities where details should move through qualification and a data room rather than being shown openly.</div>
        <button disabled={saving} className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-5 py-3 font-bold text-white disabled:opacity-50">{saving ? <Loader2 className="h-4 w-4 animate-spin"/> : <Handshake className="h-4 w-4"/>}{saving ? "Posting…" : "Post to Deal Network"}</button>
      </form>
    </main>
  </div>;
}
