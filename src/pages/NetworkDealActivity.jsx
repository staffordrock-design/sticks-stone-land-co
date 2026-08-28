import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, FileKey2, Handshake, Loader2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";

function Card({ title, subtitle, status, to }) {
  return <Link to={to} className="block rounded-2xl border border-border bg-card p-5 shadow-sm transition hover:bg-muted/20"><div className="flex items-start justify-between gap-3"><div><h3 className="font-heading text-lg font-bold">{title}</h3><p className="mt-1 text-xs text-muted-foreground">{subtitle}</p></div><span className="rounded-full bg-muted px-2.5 py-1 text-[10px] font-bold text-muted-foreground">{status}</span></div></Link>;
}

export default function NetworkDealActivity() {
  const { user } = useAuth();
  const [interests, setInterests] = useState([]);
  const [requests, setRequests] = useState([]);
  const [deals, setDeals] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      if (!user?.id) { setLoading(false); return; }
      setLoading(true);
      try {
        const [interestRows, requestRows, dealRows] = await Promise.all([
          base44.entities.DealInterest.list("-submitted_at", 500).catch(() => []),
          base44.entities.DataRoomRequest.list("-requested_at", 500).catch(() => []),
          base44.entities.NetworkOpportunity.list("-created_at", 500).catch(() => []),
        ]);
        setInterests(interestRows || []);
        setRequests(requestRows || []);
        setDeals(dealRows || []);
      } finally { setLoading(false); }
    })();
  }, [user?.id]);

  const dealById = useMemo(() => new Map(deals.map((deal) => [deal.id, deal])), [deals]);
  const myDeals = deals.filter((deal) => deal.author_user_id === user?.id);
  const sentInterests = interests.filter((row) => row.user_id === user?.id);
  const incomingInterests = interests.filter((row) => row.opportunity_owner_user_id === user?.id && row.user_id !== user?.id);
  const sentRequests = requests.filter((row) => row.user_id === user?.id);
  const incomingRequests = requests.filter((row) => row.opportunity_owner_user_id === user?.id && row.user_id !== user?.id);

  if (loading) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin"/></div>;
  if (!user?.id) return <div className="min-h-screen bg-slate-50 p-6 dark:bg-background"><div className="mx-auto max-w-2xl rounded-2xl border border-border bg-card p-8 text-center"><Handshake className="mx-auto h-9 w-9 text-sky-700"/><h1 className="mt-3 font-heading text-2xl font-bold">Deal Activity</h1><p className="mt-2 text-sm text-muted-foreground">Sign in to see your posted opportunities, buyer interest and data-room requests.</p><Link to="/login?returnTo=/network/deals/activity" className="mt-5 inline-flex rounded-xl bg-slate-900 px-5 py-3 text-sm font-bold text-white">Sign in</Link></div></div>;

  return <div className="min-h-screen bg-slate-50 pb-28 dark:bg-background">
    <header className="border-b border-slate-800 bg-slate-950 text-white" style={{ paddingTop: "env(safe-area-inset-top, 16px)" }}><div className="mx-auto max-w-6xl px-4 pb-7 pt-4 sm:px-6"><Link to="/network/deals" className="inline-flex items-center gap-2 text-sm font-semibold text-slate-300"><ArrowLeft className="h-4 w-4"/>Deal Network</Link><div className="mt-5"><div className="text-xs font-bold uppercase tracking-[0.18em] text-sky-300">Your transaction workspace</div><h1 className="mt-1 font-heading text-3xl font-bold">Deal Activity</h1><p className="mt-2 max-w-2xl text-sm text-slate-300">Everything you post, express interest in, or request for diligence is tracked here.</p></div></div></header>
    <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5"><div className="rounded-xl border border-border bg-card p-4"><div className="text-2xl font-bold">{myDeals.length}</div><div className="text-xs text-muted-foreground">my deals</div></div><div className="rounded-xl border border-border bg-card p-4"><div className="text-2xl font-bold">{incomingInterests.length}</div><div className="text-xs text-muted-foreground">incoming interest</div></div><div className="rounded-xl border border-border bg-card p-4"><div className="text-2xl font-bold">{sentInterests.length}</div><div className="text-xs text-muted-foreground">interest sent</div></div><div className="rounded-xl border border-border bg-card p-4"><div className="text-2xl font-bold">{incomingRequests.length}</div><div className="text-xs text-muted-foreground">data-room requests</div></div><div className="rounded-xl border border-border bg-card p-4"><div className="text-2xl font-bold">{sentRequests.length}</div><div className="text-xs text-muted-foreground">diligence requested</div></div></div>

      <section className="mt-8"><div className="flex items-center gap-2"><Handshake className="h-5 w-5 text-sky-700"/><h2 className="font-heading text-2xl font-bold">My posted deals</h2></div><div className="mt-4 grid gap-4 md:grid-cols-2">{myDeals.length ? myDeals.map((deal) => <Card key={deal.id} title={deal.title} subtitle={[deal.opportunity_type, deal.states].filter(Boolean).join(" · ")} status={deal.status} to={`/network/deals/${deal.id}`}/>) : <div className="rounded-2xl border border-dashed border-border p-8 text-sm text-muted-foreground md:col-span-2">You have not posted a deal yet. <Link className="font-bold text-sky-800" to="/network/deals/new">Post one now.</Link></div>}</div></section>

      <section className="mt-8"><h2 className="font-heading text-2xl font-bold">Incoming buyer interest</h2><div className="mt-4 grid gap-4 md:grid-cols-2">{incomingInterests.length ? incomingInterests.map((row) => <Card key={row.id} title={row.opportunity_title || dealById.get(row.network_opportunity_id)?.title || "Network opportunity"} subtitle={row.buyer_company || row.buyer_email || "Interested buyer"} status={row.status} to={`/network/deals/${row.network_opportunity_id}`}/>) : <div className="rounded-2xl border border-dashed border-border p-8 text-sm text-muted-foreground md:col-span-2">No incoming buyer interest yet.</div>}</div></section>

      <section className="mt-8"><h2 className="font-heading text-2xl font-bold">Interest I sent</h2><div className="mt-4 grid gap-4 md:grid-cols-2">{sentInterests.length ? sentInterests.map((row) => <Card key={row.id} title={row.opportunity_title || dealById.get(row.network_opportunity_id)?.title || "Network opportunity"} subtitle={row.interest_type} status={row.status} to={`/network/deals/${row.network_opportunity_id}`}/>) : <div className="rounded-2xl border border-dashed border-border p-8 text-sm text-muted-foreground md:col-span-2">You have not expressed interest in a deal yet.</div>}</div></section>

      <section className="mt-8"><div className="flex items-center gap-2"><FileKey2 className="h-5 w-5 text-sky-700"/><h2 className="font-heading text-2xl font-bold">Data-room activity</h2></div><div className="mt-4 grid gap-4 md:grid-cols-2">{[...incomingRequests, ...sentRequests].length ? [...incomingRequests, ...sentRequests].map((row) => <Card key={row.id} title={row.opportunity_title || dealById.get(row.network_opportunity_id)?.title || "Network opportunity"} subtitle={row.user_id === user.id ? "Request sent" : `Incoming request${row.buyer_company ? ` · ${row.buyer_company}` : ""}`} status={row.status} to={`/network/deals/${row.network_opportunity_id}`}/>) : <div className="rounded-2xl border border-dashed border-border p-8 text-sm text-muted-foreground md:col-span-2">No data-room activity yet.</div>}</div></section>
    </main>
  </div>;
}
