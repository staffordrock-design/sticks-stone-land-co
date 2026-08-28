import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Handshake, Loader2, MessageCircle, Mountain, Search, ShieldCheck, Target } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";

const STATES = ["All","TN","GA","AL","KY","NC","SC","MS","VA"];

function Pill({ children }) {
  return <span className="rounded-full bg-muted px-2.5 py-1 text-[10px] font-bold text-muted-foreground">{children}</span>;
}

export default function NetworkDeals() {
  const { user } = useAuth();
  const [deals, setDeals] = useState([]);
  const [sites, setSites] = useState([]);
  const [search, setSearch] = useState("");
  const [stateFilter, setStateFilter] = useState("All");
  const [typeFilter, setTypeFilter] = useState("All");
  const [interests, setInterests] = useState([]);
  const [interestBusy, setInterestBusy] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const [rows, interestRows] = await Promise.all([
          base44.entities.NetworkOpportunity.list("-created_at", 500).catch(() => []),
          user?.id ? base44.entities.DealInterest.list("-submitted_at", 500).catch(() => []) : Promise.resolve([]),
        ]);
        const open = (rows || []).filter((row) => row.status !== "Closed");
        setDeals(open);
        setInterests(interestRows || []);
        const siteRows = await Promise.all(open.filter((row) => row.linked_mining_site_id).slice(0,200).map((row) => base44.entities.MiningSite.get(row.linked_mining_site_id).catch(() => null)));
        setSites(siteRows.filter(Boolean));
      } finally { setLoading(false); }
    })();
  }, [user?.id]);

  const siteById = useMemo(() => new Map(sites.map((site) => [site.id, site])), [sites]);
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return deals.filter((item) => {
      if (stateFilter !== "All" && !String(item.states || "").toUpperCase().includes(stateFilter)) return false;
      if (typeFilter !== "All" && item.opportunity_type !== typeFilter) return false;
      if (!q) return true;
      const site = siteById.get(item.linked_mining_site_id);
      return [item.title,item.description,item.author_name,item.author_company,item.states,item.counties,item.commodities,item.asset_types,site?.mine_name,site?.operator_name]
        .some((value) => String(value || "").toLowerCase().includes(q));
    });
  }, [deals, search, stateFilter, typeFilter, siteById]);

  const myInterestFor = (item) => interests.find((row) => row.network_opportunity_id === item.id && row.user_id === user?.id);
  const incomingCountFor = (item) => interests.filter((row) => row.network_opportunity_id === item.id && row.opportunity_owner_user_id === user?.id).length;

  const sendInterest = async (item) => {
    if (!user?.id || interestBusy) return;
    setInterestBusy(item.id);
    setNotice("");
    try {
      const created = await base44.entities.DealInterest.create({
        user_id: user.id,
        buyer_email: user.email || "",
        buyer_company: "",
        listing_id: item.linked_listing_id || "",
        listing_title: item.title,
        seller_submission_id: "",
        network_opportunity_id: item.id,
        mining_site_id: item.linked_mining_site_id || "",
        opportunity_owner_user_id: item.author_user_id,
        opportunity_title: item.title,
        interest_type: "Request Information",
        terms_summary: `Interested through S&S Quarry Network: ${item.title}`,
        status: "New",
        submitted_at: new Date().toISOString(),
      });
      setInterests((rows) => [created, ...rows]);
      setNotice(`Interest sent for ${item.title}. The opportunity owner can now see it in the Deal Network.`);
    } catch (error) {
      console.error("Deal interest failed", error);
      setNotice("Your interest did not send. Please try again.");
    } finally { setInterestBusy(""); }
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin"/></div>;

  return <div className="min-h-screen bg-slate-50 pb-28 dark:bg-background">
    <header className="border-b border-slate-800 bg-slate-950 text-white" style={{ paddingTop: "env(safe-area-inset-top, 16px)" }}><div className="mx-auto max-w-7xl px-4 pb-7 pt-4 sm:px-6"><Link to="/network" className="inline-flex items-center gap-2 text-sm font-semibold text-slate-300"><ArrowLeft className="h-4 w-4"/>Quarry Network Intel</Link><div className="mt-5 flex flex-wrap items-end justify-between gap-4"><div><div className="text-xs font-bold uppercase tracking-[0.18em] text-sky-300"><Handshake className="mr-2 inline h-4 w-4"/>Transaction infrastructure</div><h1 className="mt-1 font-heading text-3xl font-bold">Deal Network</h1><p className="mt-2 max-w-2xl text-sm text-slate-300">Buyer requirements and quarry offerings tied directly to quarry intelligence records.</p></div><Link to="/network/community?tab=opportunities" className="rounded-xl bg-white px-4 py-2.5 text-xs font-bold text-slate-950">Post a deal</Link></div></div></header>
    <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
      <section className="rounded-2xl border border-border bg-card p-4"><div className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"/><input value={search} onChange={(e) => setSearch(e.target.value)} className="input pl-10" placeholder="Search deal, company, quarry, county, commodity…"/></div><div className="mt-3 flex flex-wrap gap-2"><select value={stateFilter} onChange={(e) => setStateFilter(e.target.value)} className="rounded-xl border border-border bg-background px-3 py-2 text-xs font-bold">{STATES.map((state) => <option key={state}>{state}</option>)}</select><select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className="rounded-xl border border-border bg-background px-3 py-2 text-xs font-bold"><option>All</option><option>Looking For</option><option>Have / Offering</option></select></div></section>

      <div className="mt-6 flex items-end justify-between gap-3"><div><div className="text-xs font-bold uppercase tracking-[0.18em] text-sky-700">Open opportunities</div><h2 className="mt-1 font-heading text-2xl font-bold">{filtered.length} deal{filtered.length === 1 ? "" : "s"}</h2></div></div>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">{filtered.map((item) => { const site = siteById.get(item.linked_mining_site_id); return <article key={item.id} className="rounded-2xl border border-border bg-card p-5 shadow-sm"><div className="flex items-start justify-between gap-3"><div><Pill>{item.opportunity_type}</Pill><h3 className="mt-3 font-heading text-xl font-bold">{item.title}</h3><div className="mt-1 text-xs text-muted-foreground">{[item.author_name,item.author_company].filter(Boolean).join(" · ")}</div></div>{item.confidentiality === "NDA / Confidential" && <div className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-[10px] font-bold text-amber-900"><ShieldCheck className="h-3 w-3"/>NDA</div>}</div><p className="mt-4 text-sm leading-6 text-muted-foreground">{item.description}</p><div className="mt-4 flex flex-wrap gap-2">{item.states && <Pill>{item.states}</Pill>}{item.commodities && <Pill>{item.commodities}</Pill>}{item.asset_types && <Pill>{item.asset_types}</Pill>}</div>{site && <div className="mt-4 rounded-xl border border-border bg-muted/20 p-4"><div className="flex items-center gap-2"><Mountain className="h-4 w-4 text-sky-700"/><strong className="text-sm">{site.mine_name}</strong></div><div className="mt-1 text-xs text-muted-foreground">{[site.county,site.state,site.operator_name].filter(Boolean).join(" · ")}</div></div>}<div className="mt-5 flex flex-wrap gap-2 border-t border-border pt-4">{site && <Link to={`/mines/${site.id}`} className="rounded-xl border border-border px-3 py-2 text-xs font-bold">Linked quarry intelligence</Link>}{user?.id && item.author_user_id && item.author_user_id !== user.id && <Link to={`/messages?user=${encodeURIComponent(item.author_user_id)}&text=${encodeURIComponent(`I'm interested in your S&S Quarry Network opportunity: ${item.title}`)}`} className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-3 py-2 text-xs font-bold text-white"><MessageCircle className="h-4 w-4"/>I'm interested</Link>}</div></article>; })}</div>
      {filtered.length === 0 && <div className="mt-4 rounded-2xl border border-dashed border-border p-10 text-center"><Target className="mx-auto h-8 w-8 text-muted-foreground"/><div className="mt-3 font-bold">No matching deals yet</div><p className="mt-1 text-sm text-muted-foreground">Post a buyer requirement or quarry offering to start the transaction network.</p><Link to="/network/community?tab=opportunities" className="mt-4 inline-flex rounded-xl bg-slate-900 px-4 py-2.5 text-xs font-bold text-white">Post a deal</Link></div>}
    </main>
  </div>;
}
