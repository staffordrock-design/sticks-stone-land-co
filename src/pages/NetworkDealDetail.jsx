import React, { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, CheckCircle2, FileKey2, Handshake, Loader2, MessageCircle, Mountain, ShieldCheck, XCircle } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";

function Pill({ children }) {
  return <span className="rounded-full bg-muted px-2.5 py-1 text-[10px] font-bold text-muted-foreground">{children}</span>;
}

export default function NetworkDealDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const [deal, setDeal] = useState(null);
  const [site, setSite] = useState(null);
  const [profile, setProfile] = useState(null);
  const [interests, setInterests] = useState([]);
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState("");

  const load = async () => {
    setLoading(true);
    setNotice("");
    try {
      const row = await base44.entities.NetworkOpportunity.get(id);
      setDeal(row || null);
      const [siteRow, profileRows, interestRows, requestRows] = await Promise.all([
        row?.linked_mining_site_id ? base44.entities.MiningSite.get(row.linked_mining_site_id).catch(() => null) : Promise.resolve(null),
        user?.id ? base44.entities.UserProfile.filter({ user_id: user.id }, "-updated_date", 1).catch(() => []) : Promise.resolve([]),
        user?.id ? base44.entities.DealInterest.filter({ network_opportunity_id: id }, "-submitted_at", 500).catch(() => []) : Promise.resolve([]),
        user?.id ? base44.entities.DataRoomRequest.filter({ network_opportunity_id: id }, "-requested_at", 500).catch(() => []) : Promise.resolve([]),
      ]);
      setSite(siteRow);
      setProfile(profileRows?.[0] || null);
      setInterests(interestRows || []);
      setRequests(requestRows || []);
    } catch (error) {
      console.error("Deal workspace load failed", error);
      setNotice("This deal workspace could not load.");
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [id, user?.id]);

  const isOwner = Boolean(user?.id && deal?.author_user_id === user.id);
  const myInterest = useMemo(() => interests.find((row) => row.user_id === user?.id), [interests, user?.id]);
  const myRequest = useMemo(() => requests.find((row) => row.user_id === user?.id), [requests, user?.id]);

  const sendInterest = async () => {
    if (!user?.id || !deal || busy) return;
    setBusy("interest");
    setNotice("");
    try {
      const created = await base44.entities.DealInterest.create({
        user_id: user.id,
        buyer_email: user.email || profile?.email || "",
        buyer_company: profile?.company || "",
        listing_id: deal.linked_listing_id || "",
        listing_title: deal.title,
        seller_submission_id: "",
        network_opportunity_id: deal.id,
        mining_site_id: deal.linked_mining_site_id || "",
        opportunity_owner_user_id: deal.author_user_id,
        opportunity_title: deal.title,
        interest_type: "Request Information",
        terms_summary: `Interested through S&S Quarry Network: ${deal.title}`,
        status: "New",
        submitted_at: new Date().toISOString(),
      });
      setInterests((rows) => [created, ...rows]);
      setNotice("Interest sent. It is now in the seller's Deal Activity workspace.");
    } catch (error) {
      console.error("Deal interest failed", error);
      setNotice("Interest did not send. Please try again.");
    } finally { setBusy(""); }
  };

  const requestDataRoom = async () => {
    if (!user?.id || !deal || busy) return;
    setBusy("data-room");
    setNotice("");
    try {
      const created = await base44.entities.DataRoomRequest.create({
        user_id: user.id,
        listing_id: deal.linked_listing_id || `network:${deal.id}`,
        seller_submission_id: "",
        network_opportunity_id: deal.id,
        mining_site_id: deal.linked_mining_site_id || "",
        opportunity_title: deal.title,
        opportunity_owner_user_id: deal.author_user_id,
        buyer_company: profile?.company || "",
        purpose: `Requesting confidential diligence access for ${deal.title}`,
        nda_agreed: false,
        status: deal.confidentiality === "NDA / Confidential" ? "NDA Required" : "Requested",
        requested_at: new Date().toISOString(),
        decided_at: "",
      });
      setRequests((rows) => [created, ...rows]);
      setNotice("Data-room request sent to the opportunity owner.");
    } catch (error) {
      console.error("Data room request failed", error);
      setNotice("Data-room request did not send. Please try again.");
    } finally { setBusy(""); }
  };

  const updateRequest = async (request, status) => {
    if (!isOwner || busy) return;
    setBusy(`request-${request.id}`);
    try {
      await base44.entities.DataRoomRequest.update(request.id, { status, decided_at: new Date().toISOString() });
      setRequests((rows) => rows.map((row) => row.id === request.id ? { ...row, status, decided_at: new Date().toISOString() } : row));
      setNotice(`Data-room request ${status.toLowerCase()}.`);
    } catch (error) {
      console.error("Data room decision failed", error);
      setNotice("That data-room decision did not save.");
    } finally { setBusy(""); }
  };

  const updateInterest = async (interest, status) => {
    if (!isOwner || busy) return;
    setBusy(`interest-${interest.id}`);
    try {
      await base44.entities.DealInterest.update(interest.id, { status });
      setInterests((rows) => rows.map((row) => row.id === interest.id ? { ...row, status } : row));
      setNotice(`Buyer interest moved to ${status}.`);
    } catch (error) {
      console.error("Interest status update failed", error);
      setNotice("That interest status did not save.");
    } finally { setBusy(""); }
  };

  const updateDealStatus = async (status) => {
    if (!isOwner || busy) return;
    setBusy("deal-status");
    try {
      await base44.entities.NetworkOpportunity.update(deal.id, { status, updated_at: new Date().toISOString() });
      setDeal((row) => ({ ...row, status }));
      setNotice(`Deal status changed to ${status}.`);
    } catch (error) {
      console.error("Deal status failed", error);
      setNotice("Deal status did not update.");
    } finally { setBusy(""); }
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin"/></div>;
  if (!deal) return <div className="min-h-screen bg-slate-50 p-6 dark:bg-background"><div className="mx-auto max-w-2xl rounded-2xl border border-border bg-card p-8 text-center"><h1 className="font-heading text-2xl font-bold">Deal not found</h1><Link to="/network/deals" className="mt-4 inline-flex rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-bold text-white">Back to Deal Network</Link></div></div>;

  return <div className="min-h-screen bg-slate-50 pb-28 dark:bg-background">
    <header className="border-b border-slate-800 bg-slate-950 text-white" style={{ paddingTop: "env(safe-area-inset-top, 16px)" }}><div className="mx-auto max-w-6xl px-4 pb-7 pt-4 sm:px-6"><Link to="/network/deals" className="inline-flex items-center gap-2 text-sm font-semibold text-slate-300"><ArrowLeft className="h-4 w-4"/>Deal Network</Link><div className="mt-5 flex flex-wrap items-start justify-between gap-4"><div><div className="flex flex-wrap gap-2"><Pill>{deal.opportunity_type}</Pill><Pill>{deal.status}</Pill>{deal.confidentiality === "NDA / Confidential" && <Pill>NDA / Confidential</Pill>}</div><h1 className="mt-3 max-w-3xl font-heading text-3xl font-bold">{deal.title}</h1><div className="mt-2 text-sm text-slate-300">{[deal.author_name, deal.author_company].filter(Boolean).join(" · ")}</div></div>{isOwner && <div className="flex flex-wrap gap-2"><button disabled={busy === "deal-status"} onClick={() => updateDealStatus(deal.status === "Closed" ? "Open" : "Closed")} className="rounded-xl bg-white px-4 py-2.5 text-xs font-bold text-slate-950">{deal.status === "Closed" ? "Reopen deal" : "Close deal"}</button><Link to="/network/deals/activity" className="rounded-xl border border-slate-700 px-4 py-2.5 text-xs font-bold">Deal Activity</Link></div>}</div></div></header>

    <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
      {notice && <div className="mb-5 rounded-xl border border-sky-200 bg-sky-50 p-3 text-sm font-semibold text-sky-950">{notice}</div>}
      <div className="grid gap-6 lg:grid-cols-[1.4fr_.8fr]">
        <section className="space-y-5">
          <article className="rounded-2xl border border-border bg-card p-5"><p className="text-sm leading-7 text-muted-foreground">{deal.description}</p><div className="mt-4 flex flex-wrap gap-2">{deal.states && <Pill>{deal.states}</Pill>}{deal.counties && <Pill>{deal.counties}</Pill>}{deal.commodities && <Pill>{deal.commodities}</Pill>}{deal.asset_types && <Pill>{deal.asset_types}</Pill>}</div></article>
          {site && <article className="rounded-2xl border border-border bg-card p-5"><div className="flex items-center gap-2"><Mountain className="h-5 w-5 text-sky-700"/><h2 className="font-heading text-xl font-bold">Linked quarry intelligence</h2></div><h3 className="mt-4 font-bold">{site.mine_name}</h3><div className="mt-1 text-sm text-muted-foreground">{[site.county, site.state, site.commodity].filter(Boolean).join(" · ")}</div><div className="mt-4 space-y-1 text-sm"><div><span className="text-muted-foreground">Operator:</span> <strong>{site.operator_name || "—"}</strong></div><div><span className="text-muted-foreground">Controller:</span> <strong>{site.controller_name || "—"}</strong></div>{site.msha_mine_id && <div><span className="text-muted-foreground">MSHA:</span> <strong>{site.msha_mine_id}</strong></div>}</div><Link to={`/mines/${site.id}`} className="mt-5 inline-flex rounded-xl bg-slate-900 px-4 py-2.5 text-xs font-bold text-white">Open full quarry record</Link></article>}

          {isOwner && <article className="rounded-2xl border border-border bg-card p-5"><div className="flex items-center gap-2"><Handshake className="h-5 w-5 text-sky-700"/><h2 className="font-heading text-xl font-bold">Incoming buyer interest</h2></div><div className="mt-4 space-y-3">{interests.length ? interests.map((interest) => <div key={interest.id} className="rounded-xl border border-border p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="font-bold">{interest.buyer_company || interest.buyer_email || "Interested buyer"}</div><div className="mt-1 text-xs text-muted-foreground">{interest.interest_type} · {interest.status}</div></div><select value={interest.status} onChange={(e) => updateInterest(interest, e.target.value)} className="rounded-lg border border-border bg-background px-2 py-2 text-xs font-bold"><option>New</option><option>Contacted</option><option>Qualified</option><option>Data Room</option><option>Negotiating</option><option>Accepted</option><option>Declined</option><option>Closed</option></select></div>{interest.terms_summary && <p className="mt-3 text-sm text-muted-foreground">{interest.terms_summary}</p>}</div>) : <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">No buyer interest yet.</div>}</div></article>}

          {isOwner && <article className="rounded-2xl border border-border bg-card p-5"><div className="flex items-center gap-2"><FileKey2 className="h-5 w-5 text-sky-700"/><h2 className="font-heading text-xl font-bold">Data-room requests</h2></div><div className="mt-4 space-y-3">{requests.length ? requests.map((request) => <div key={request.id} className="rounded-xl border border-border p-4"><div className="font-bold">{request.buyer_company || "Buyer request"}</div><div className="mt-1 text-xs text-muted-foreground">{request.status} · {request.requested_at ? new Date(request.requested_at).toLocaleDateString() : ""}</div><p className="mt-3 text-sm text-muted-foreground">{request.purpose}</p>{!["Approved","Declined"].includes(request.status) && <div className="mt-4 flex gap-2"><button onClick={() => updateRequest(request, "Approved")} className="inline-flex items-center gap-1 rounded-lg bg-emerald-700 px-3 py-2 text-xs font-bold text-white"><CheckCircle2 className="h-4 w-4"/>Approve</button><button onClick={() => updateRequest(request, "Declined")} className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-2 text-xs font-bold"><XCircle className="h-4 w-4"/>Decline</button></div>}</div>) : <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">No data-room requests yet.</div>}</div></article>}
        </section>

        <aside className="space-y-4">
          {!isOwner && <div className="rounded-2xl border border-border bg-card p-5"><h2 className="font-heading text-lg font-bold">Work this opportunity</h2><p className="mt-2 text-sm text-muted-foreground">Interest and diligence requests are saved to the Deal Network, not just sent as a message.</p>{!user?.id ? <Link to={`/login?returnTo=${encodeURIComponent(window.location.pathname)}`} className="mt-4 inline-flex w-full justify-center rounded-xl bg-slate-900 px-4 py-3 text-sm font-bold text-white">Sign in</Link> : <div className="mt-4 space-y-2"><button disabled={Boolean(myInterest) || busy === "interest"} onClick={sendInterest} className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-3 text-sm font-bold text-white disabled:opacity-50"><Handshake className="h-4 w-4"/>{myInterest ? `Interest sent · ${myInterest.status}` : busy === "interest" ? "Sending…" : "I'm interested"}</button><button disabled={Boolean(myRequest) || busy === "data-room"} onClick={requestDataRoom} className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-border px-4 py-3 text-sm font-bold disabled:opacity-50"><ShieldCheck className="h-4 w-4"/>{myRequest ? `Data room · ${myRequest.status}` : busy === "data-room" ? "Sending…" : "Request Data Room / NDA"}</button>{deal.author_user_id && <Link to={`/messages?user=${encodeURIComponent(deal.author_user_id)}&text=${encodeURIComponent(`Regarding S&S Quarry Network deal: ${deal.title}`)}`} className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-border px-4 py-3 text-sm font-bold"><MessageCircle className="h-4 w-4"/>Message owner</Link>}</div>}</div>}
          <div className="rounded-2xl border border-border bg-card p-5"><h2 className="font-heading text-lg font-bold">Deal facts</h2><div className="mt-4 space-y-3 text-sm"><div><span className="text-muted-foreground">Type:</span> <strong>{deal.opportunity_type}</strong></div><div><span className="text-muted-foreground">Visibility:</span> <strong>{deal.confidentiality}</strong></div>{deal.asking_price ? <div><span className="text-muted-foreground">Asking:</span> <strong>${Number(deal.asking_price).toLocaleString()}</strong></div> : null}{deal.budget_min || deal.budget_max ? <div><span className="text-muted-foreground">Budget:</span> <strong>{[deal.budget_min,deal.budget_max].filter(Boolean).map((n) => `$${Number(n).toLocaleString()}`).join(" – ")}</strong></div> : null}</div></div>
        </aside>
      </div>
    </main>
  </div>;
}
