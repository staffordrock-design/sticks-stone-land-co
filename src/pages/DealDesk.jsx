import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { ArrowLeft, BriefcaseBusiness, Building2, FileKey2, HandCoins, Loader2, Network, ShieldCheck, Users } from "lucide-react";
import DealPipelineBoard from "@/components/DealPipelineBoard";

const STAGES = ["Lead","Seller Review","Preparing Listing","Marketing","Buyer Qualified","NDA","Due Diligence","Offer","Negotiation","Under Contract","Closed","Lost"];

function statusStyle(status) {
  if (status === "Approved") return "bg-emerald-100 text-emerald-900";
  if (status === "NDA Required") return "bg-amber-100 text-amber-900";
  if (status === "Declined" || status === "Expired") return "bg-red-100 text-red-900";
  return "bg-sky-100 text-sky-900";
}

export default function DealDesk() {
  const { user } = useAuth();
  const [sellers, setSellers] = useState([]);
  const [interests, setInterests] = useState([]);
  const [buyers, setBuyers] = useState([]);
  const [pipeline, setPipeline] = useState([]);
  const [roomRequests, setRoomRequests] = useState([]);
  const [roomAccess, setRoomAccess] = useState([]);
  const [networkOpportunities, setNetworkOpportunities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const [s, i, b, p, r, a, n] = await Promise.all([
        base44.entities.SellerSubmission.list("-submitted_at", 200),
        base44.entities.DealInterest.list("-submitted_at", 200),
        base44.entities.BuyerProfile.list("-updated_date", 200),
        base44.entities.DealPipeline.list("-last_activity_at", 200),
        base44.entities.DataRoomRequest.list("-requested_at", 300),
        base44.entities.DataRoomAccess.list("-granted_at", 300),
        base44.entities.NetworkOpportunity.list("-created_at", 300),
      ]);
      setSellers(s || []);
      setInterests(i || []);
      setBuyers(b || []);
      setPipeline(p || []);
      setRoomRequests(r || []);
      setRoomAccess(a || []);
      setNetworkOpportunities(n || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { if (user?.role === "admin") load(); }, [user?.role]);

  const opportunityById = useMemo(() => new Map(networkOpportunities.map((o) => [o.id, o])), [networkOpportunities]);
  const openNetworkRequests = roomRequests.filter((r) => !["Declined", "Expired"].includes(r.status));

  const createFromSeller = async (s) => {
    await base44.entities.DealPipeline.create({
      deal_name: s.property_name,
      seller_submission_id: s.id,
      seller_user_id: s.user_id || "",
      seller_name: s.seller_name,
      seller_email: s.seller_email,
      stage: "Seller Review",
      estimated_value: s.asking_price || null,
      next_action: "Review seller submission and verify property data",
      last_activity_at: new Date().toISOString(),
    });
    await load();
  };

  const openNetworkDeal = async (request) => {
    if (pipeline.some((p) => p.data_room_request_id === request.id)) return;
    setBusyId(request.id);
    try {
      const opportunity = opportunityById.get(request.network_opportunity_id) || null;
      const stage = request.status === "NDA Required" && !request.nda_agreed ? "NDA" : "Buyer Qualified";
      await base44.entities.DealPipeline.create({
        deal_name: request.opportunity_title || opportunity?.title || "Network quarry opportunity",
        listing_id: request.listing_id || "",
        network_opportunity_id: request.network_opportunity_id || "",
        data_room_request_id: request.id,
        mining_site_id: request.mining_site_id || opportunity?.linked_mining_site_id || "",
        seller_user_id: request.opportunity_owner_user_id || opportunity?.author_user_id || "",
        seller_name: opportunity?.author_name || "",
        buyer_user_id: request.user_id,
        buyer_company: request.buyer_company || "",
        stage,
        next_action: stage === "NDA" ? "Confirm executed NDA before confidential data-room access" : "Qualify buyer and approve data-room access",
        notes: request.purpose || "Created from S&S Quarry Network data-room request.",
        last_activity_at: new Date().toISOString(),
      });
      if (request.status === "Requested") {
        await base44.entities.DataRoomRequest.update(request.id, { status: "Qualification Review" });
      }
      await load();
    } finally { setBusyId(""); }
  };

  const markNdaComplete = async (request) => {
    setBusyId(request.id);
    try {
      await base44.entities.DataRoomRequest.update(request.id, {
        nda_agreed: true,
        status: "Qualification Review",
      });
      const deal = pipeline.find((p) => p.data_room_request_id === request.id);
      if (deal) {
        await base44.entities.DealPipeline.update(deal.id, {
          stage: "Buyer Qualified",
          next_action: "Approve data room and begin due diligence",
          last_activity_at: new Date().toISOString(),
        });
      }
      await load();
    } finally { setBusyId(""); }
  };

  const approveDataRoom = async (request) => {
    if (request.status === "NDA Required" && !request.nda_agreed) return;
    setBusyId(request.id);
    try {
      const opportunity = opportunityById.get(request.network_opportunity_id) || null;
      const existing = roomAccess.find((a) => a.data_room_request_id === request.id || (a.network_opportunity_id === request.network_opportunity_id && a.user_id === request.user_id));
      if (!existing) {
        await base44.entities.DataRoomAccess.create({
          listing_id: request.listing_id || `network:${request.network_opportunity_id || request.id}`,
          listing_title: request.opportunity_title || opportunity?.title || "Network quarry opportunity",
          network_opportunity_id: request.network_opportunity_id || "",
          data_room_request_id: request.id,
          mining_site_id: request.mining_site_id || opportunity?.linked_mining_site_id || "",
          opportunity_owner_user_id: request.opportunity_owner_user_id || opportunity?.author_user_id || "",
          user_id: request.user_id,
          customer_email: "",
          paid: false,
          access_status: "Granted",
          granted_at: new Date().toISOString(),
        });
      }
      await base44.entities.DataRoomRequest.update(request.id, {
        status: "Approved",
        decided_at: new Date().toISOString(),
      });
      const deal = pipeline.find((p) => p.data_room_request_id === request.id);
      if (deal) {
        await base44.entities.DealPipeline.update(deal.id, {
          stage: "Due Diligence",
          next_action: "Run S&S due diligence and prepare findings / offer decision",
          last_activity_at: new Date().toISOString(),
        });
      }
      await load();
    } finally { setBusyId(""); }
  };

  const declineRequest = async (request) => {
    setBusyId(request.id);
    try {
      await base44.entities.DataRoomRequest.update(request.id, { status: "Declined", decided_at: new Date().toISOString() });
      const deal = pipeline.find((p) => p.data_room_request_id === request.id);
      if (deal) await base44.entities.DealPipeline.update(deal.id, { stage: "Lost", next_action: "Data-room request declined", last_activity_at: new Date().toISOString() });
      await load();
    } finally { setBusyId(""); }
  };

  const move = async (item, stage) => {
    await base44.entities.DealPipeline.update(item.id, { stage, last_activity_at: new Date().toISOString() });
    await load();
  };

  if (!user || user.role !== "admin") return <div className="min-h-screen p-10 text-center text-muted-foreground">Admin access required.</div>;

  return <div className="min-h-screen bg-background">
    <header className="border-b border-border"><div className="mx-auto max-w-7xl px-6 py-4"><Link to="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground"><ArrowLeft className="h-4 w-4"/>Marketplace</Link></div></header>
    <main className="mx-auto max-w-7xl px-6 py-10">
      <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Private Admin</p>
      <h1 className="mt-2 font-heading text-3xl font-bold">S&amp;S Deal Desk</h1>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">Network matches, NDA/data-room requests, seller leads, buyer interest and the live quarry transaction pipeline.</p>

      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Stat icon={Building2} label="Seller Submissions" value={sellers.length}/>
        <Stat icon={Users} label="Buyer Profiles" value={buyers.length}/>
        <Stat icon={FileKey2} label="Data-Room Requests" value={openNetworkRequests.length}/>
        <Stat icon={HandCoins} label="Buyer Interests / Offers" value={interests.length}/>
        <Stat icon={BriefcaseBusiness} label="Active Deals" value={pipeline.filter((p) => !["Closed","Lost"].includes(p.stage)).length}/>
      </div>

      {loading ? <div className="mt-10 flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin"/>Loading deal desk…</div> : <>
        <section className="mt-10">
          <div className="flex items-center gap-2"><Network className="h-5 w-5 text-sky-700"/><h2 className="font-heading text-xl font-bold">Quarry Network → NDA / Data Room</h2></div>
          <p className="mt-1 text-sm text-muted-foreground">Qualify serious matches here. Confidential opportunities stay locked until S&amp;S confirms the NDA step.</p>
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            {openNetworkRequests.map((request) => {
              const opportunity = opportunityById.get(request.network_opportunity_id) || null;
              const deal = pipeline.find((p) => p.data_room_request_id === request.id);
              const access = roomAccess.find((a) => a.data_room_request_id === request.id);
              const busy = busyId === request.id;
              return <div key={request.id} className="rounded-2xl border border-border bg-card p-5">
                <div className="flex items-start justify-between gap-3"><div><div className="font-heading text-lg font-bold">{request.opportunity_title || opportunity?.title || "Network opportunity"}</div><div className="mt-1 text-sm text-muted-foreground">Buyer: {request.buyer_company || request.user_id}</div></div><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${statusStyle(request.status)}`}>{request.status}</span></div>
                {opportunity && <div className="mt-3 text-sm text-muted-foreground">{[opportunity.author_name, opportunity.author_company, opportunity.states, opportunity.commodities].filter(Boolean).join(" · ")}</div>}
                {request.purpose && <div className="mt-3 rounded-xl bg-muted/30 p-3 text-sm text-muted-foreground">{request.purpose}</div>}
                <div className="mt-4 flex flex-wrap gap-2 text-xs">{request.nda_agreed && <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 font-bold text-emerald-900"><ShieldCheck className="h-3.5 w-3.5"/>NDA complete</span>}{deal && <span className="rounded-full bg-sky-100 px-2.5 py-1 font-bold text-sky-900">Deal: {deal.stage}</span>}{access && <span className="rounded-full bg-violet-100 px-2.5 py-1 font-bold text-violet-900">Data room granted</span>}</div>
                <div className="mt-5 flex flex-wrap gap-2 border-t border-border pt-4">
                  {!deal && <button disabled={busy} onClick={() => openNetworkDeal(request)} className="rounded-xl bg-slate-900 px-3 py-2 text-xs font-bold text-white disabled:opacity-50">Open Deal</button>}
                  {request.status === "NDA Required" && !request.nda_agreed && <button disabled={busy} onClick={() => markNdaComplete(request)} className="inline-flex items-center gap-1.5 rounded-xl border border-border px-3 py-2 text-xs font-bold disabled:opacity-50"><ShieldCheck className="h-4 w-4"/>Mark NDA complete</button>}
                  {!access && (request.status !== "NDA Required" || request.nda_agreed) && <button disabled={busy} onClick={() => approveDataRoom(request)} className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-900 disabled:opacity-50"><FileKey2 className="h-4 w-4"/>Approve Data Room</button>}
                  <button disabled={busy} onClick={() => declineRequest(request)} className="ml-auto rounded-xl border border-border px-3 py-2 text-xs font-bold text-muted-foreground disabled:opacity-50">Decline</button>
                </div>
              </div>;
            })}
            {openNetworkRequests.length === 0 && <div className="rounded-2xl border border-dashed border-border p-8 text-sm text-muted-foreground lg:col-span-2">No Network data-room requests yet.</div>}
          </div>
        </section>

        <section className="mt-10"><h2 className="font-heading text-xl font-bold">New Seller Submissions</h2><div className="mt-4 grid gap-4 lg:grid-cols-2">{sellers.filter((s) => !pipeline.some((p) => p.seller_submission_id === s.id)).map((s) => <div key={s.id} className="rounded-2xl border border-border bg-card p-5"><div className="flex items-start justify-between gap-3"><div><div className="font-heading text-lg font-bold">{s.property_name}</div><div className="mt-1 text-sm text-muted-foreground">{[s.county,s.state].filter(Boolean).join(", ")} · {s.asset_type}</div></div><span className="rounded-full bg-sky-100 px-2.5 py-1 text-xs font-semibold text-sky-900">{s.status}</span></div><div className="mt-3 text-sm text-muted-foreground">{s.seller_name} · {s.seller_email}</div><div className="mt-1 text-sm text-muted-foreground">{s.acreage ? `${Number(s.acreage).toLocaleString()} acres` : "Acreage not supplied"}{s.asking_price ? ` · $${Number(s.asking_price).toLocaleString()}` : ""}</div><button onClick={() => createFromSeller(s)} className="mt-4 rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white">Open Deal</button></div>)}{sellers.length === 0 && <div className="text-sm text-muted-foreground">No seller submissions yet.</div>}</div></section>

        <section className="mt-10"><h2 className="font-heading text-xl font-bold">Buyer Interest & Offers</h2><div className="mt-4 space-y-3">{interests.map((i) => <div key={i.id} className="rounded-xl border border-border bg-card p-4"><div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"><div><div className="font-semibold">{i.listing_title || "Opportunity"}</div><div className="text-sm text-muted-foreground">{i.buyer_company || i.buyer_email} · {i.interest_type}</div></div><div className="text-sm font-semibold">{i.offer_amount ? `$${Number(i.offer_amount).toLocaleString()}` : i.status}</div></div>{i.terms_summary && <div className="mt-2 text-sm text-muted-foreground">{i.terms_summary}</div>}</div>)}{interests.length === 0 && <div className="text-sm text-muted-foreground">No buyer interest yet.</div>}</div></section>

        <section className="mt-10"><h2 className="font-heading text-xl font-bold">Deal Pipeline</h2><p className="mt-1 text-sm text-muted-foreground">Network matches approved into the data room move into Due Diligence automatically. Drag deal cards between later stages as offers and negotiations progress.</p><div className="mt-4"><DealPipelineBoard stages={STAGES} items={pipeline} onMove={move}/></div></section>
      </>}
    </main>
  </div>;
}

function Stat({ icon: Icon, label, value }) {
  return <div className="rounded-2xl border border-border bg-card p-5"><Icon className="h-5 w-5 text-sky-700"/><div className="mt-3 text-2xl font-bold">{value}</div><div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div></div>;
}
