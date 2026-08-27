import React, { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import {
  Building2, Check, CircleDollarSign, Flag, Handshake, Heart, Loader2, MapPin,
  MessageCircle, Mountain, Plus, Search, Send, ShieldBan, Target, UserPlus, Users,
  X, ArrowRight, LockKeyhole, Sparkles, FileKey2, ShieldCheck
} from "lucide-react";

const POST_TYPES = ["Update", "Equipment", "Hiring", "Project", "Question", "News"];
const OPPORTUNITY_TYPES = ["Looking For", "Have / Offering"];
const EMPTY_OPPORTUNITY = {
  opportunity_type: "Looking For",
  title: "",
  description: "",
  states: "",
  counties: "",
  commodities: "",
  asset_types: "",
  min_acres: "",
  max_acres: "",
  budget_min: "",
  budget_max: "",
  asking_price: "",
  confidentiality: "Network",
  linked_mining_site_id: "",
};

function money(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n.toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

function numeric(value) {
  return value === "" || value == null ? null : Number(value);
}

function opportunitySummary(o) {
  const acreage = [o.min_acres, o.max_acres].filter((v) => Number(v) > 0).map((v) => `${Number(v).toLocaleString()} ac`);
  const budget = o.opportunity_type === "Looking For"
    ? [money(o.budget_min), money(o.budget_max)].filter(Boolean)
    : [money(o.asking_price)].filter(Boolean);
  return [o.states, o.commodities, acreage.length ? acreage.join("–") : "", budget.length ? budget.join("–") : ""].filter(Boolean);
}

function terms(value) {
  return new Set(String(value || "").toLowerCase().split(/[,;/|]+/).map((v) => v.trim()).filter(Boolean));
}

function overlaps(a, b) {
  const aa = terms(a);
  const bb = terms(b);
  if (!aa.size || !bb.size) return false;
  return [...aa].some((value) => [...bb].some((other) => value.includes(other) || other.includes(value)));
}

function rangesOverlap(minA, maxA, minB, maxB) {
  const aMin = Number(minA) || 0;
  const aMax = Number(maxA) || Number.POSITIVE_INFINITY;
  const bMin = Number(minB) || 0;
  const bMax = Number(maxB) || Number.POSITIVE_INFINITY;
  return Math.max(aMin, bMin) <= Math.min(aMax, bMax);
}

function matchOpportunities(first, second) {
  if (!first || !second || first.opportunity_type === second.opportunity_type) return { score: 0, reasons: [] };
  const buyer = first.opportunity_type === "Looking For" ? first : second;
  const offer = first.opportunity_type === "Have / Offering" ? first : second;
  let score = 0;
  const reasons = [];

  if (overlaps(buyer.states, offer.states)) { score += 25; reasons.push("state/region"); }
  if (overlaps(buyer.counties, offer.counties)) { score += 8; reasons.push("county/area"); }
  if (overlaps(buyer.commodities, offer.commodities)) { score += 25; reasons.push("rock/commodity"); }
  if (overlaps(buyer.asset_types, offer.asset_types)) { score += 15; reasons.push("asset type"); }
  if (rangesOverlap(buyer.min_acres, buyer.max_acres, offer.min_acres, offer.max_acres)) { score += 12; reasons.push("acreage"); }

  const maxBudget = Number(buyer.budget_max) || 0;
  const minBudget = Number(buyer.budget_min) || 0;
  const asking = Number(offer.asking_price) || 0;
  if (asking && maxBudget && asking <= maxBudget && (!minBudget || asking >= minBudget * 0.5)) { score += 10; reasons.push("budget"); }
  else if (!asking || !maxBudget) score += 3;

  if (offer.linked_mining_site_id) { score += 5; reasons.push("linked S&S record"); }
  return { score: Math.min(100, score), reasons };
}

function buyerProfileOpportunity(profile, userId) {
  if (!profile) return null;
  return {
    id: "buyer-profile",
    author_user_id: userId,
    opportunity_type: "Looking For",
    title: "Your buyer profile",
    states: profile.target_states || "",
    commodities: profile.target_commodities || "",
    asset_types: profile.asset_preferences || "",
    min_acres: profile.min_acres,
    max_acres: profile.max_acres,
    budget_min: profile.min_budget,
    budget_max: profile.max_budget,
  };
}

export default function Network() {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const requestedTab = params.get("tab");
  const shareMineId = params.get("shareMine") || "";
  const [tab, setTab] = useState(requestedTab === "people" || requestedTab === "feed" ? requestedTab : "opportunities");
  const [loading, setLoading] = useState(true);
  const [posting, setPosting] = useState(false);
  const [savingOpportunity, setSavingOpportunity] = useState(false);
  const [showOpportunityForm, setShowOpportunityForm] = useState(Boolean(shareMineId));
  const [body, setBody] = useState("");
  const [postType, setPostType] = useState("Update");
  const [privateProfile, setPrivateProfile] = useState(null);
  const [publicProfile, setPublicProfile] = useState(null);
  const [profiles, setProfiles] = useState([]);
  const [posts, setPosts] = useState([]);
  const [opportunities, setOpportunities] = useState([]);
  const [dataRoomRequests, setDataRoomRequests] = useState([]);
  const [requestingRoomId, setRequestingRoomId] = useState("");
  const [connections, setConnections] = useState([]);
  const [blocks, setBlocks] = useState([]);
  const [buyerProfile, setBuyerProfile] = useState(null);
  const [linkedMine, setLinkedMine] = useState(null);
  const [notice, setNotice] = useState("");
  const [search, setSearch] = useState("");
  const [opportunityFilter, setOpportunityFilter] = useState("All");
  const [opportunity, setOpportunity] = useState(EMPTY_OPPORTUNITY);

  const syncPublicProfile = async (privateRow, existingPublic) => {
    if (!user?.id || !privateRow) return existingPublic || null;
    const payload = {
      user_id: user.id,
      full_name: privateRow.full_name || user.name || "Industry member",
      company: privateRow.company || "",
      role_title: privateRow.role_title || "",
      account_type: privateRow.account_type || "Buyer",
      headline: privateRow.headline || privateRow.role_title || privateRow.account_type || "",
      bio: privateRow.bio || "",
      website: privateRow.website || "",
      home_state: privateRow.home_state || "",
      states_of_interest: privateRow.states_of_interest || "",
      commodities_of_interest: privateRow.commodities_of_interest || "",
      skills: privateRow.skills || "",
      industry_years: privateRow.industry_years ?? null,
      open_to_opportunities: privateRow.open_to_opportunities !== false,
      profile_visibility: privateRow.profile_visibility || "Network",
      updated_at: new Date().toISOString(),
    };
    try {
      if (existingPublic?.id) return await base44.entities.NetworkMemberProfile.update(existingPublic.id, payload);
      return await base44.entities.NetworkMemberProfile.create(payload);
    } catch (error) {
      console.warn("Network public profile sync failed", error);
      return existingPublic || null;
    }
  };

  const load = async () => {
    if (!user?.id) { setLoading(false); return; }
    setLoading(true);
    try {
      const [mineRows, publicMineRows, people, feed, opportunityRows, roomRequests, links, blocked, buyers] = await Promise.all([
        base44.entities.UserProfile.filter({ user_id: user.id }, "-updated_date", 1),
        base44.entities.NetworkMemberProfile.filter({ user_id: user.id }, "-updated_at", 1).catch(() => []),
        base44.entities.NetworkMemberProfile.list("-updated_at", 300).catch(() => []),
        base44.entities.NetworkPost.list("-created_at", 250).catch(() => []),
        base44.entities.NetworkOpportunity.list("-created_at", 300).catch(() => []),
        base44.entities.DataRoomRequest.list("-requested_at", 200).catch(() => []),
        base44.entities.ProfessionalConnection.list("-created_at", 500).catch(() => []),
        base44.entities.UserBlock.filter({ blocker_user_id: user.id }, "-created_at", 250).catch(() => []),
        base44.entities.BuyerProfile.filter({ user_id: user.id }, "-updated_date", 1).catch(() => []),
      ]);
      const mine = mineRows?.[0] || null;
      const publicMine = await syncPublicProfile(mine, publicMineRows?.[0] || null);
      setPrivateProfile(mine);
      setPublicProfile(publicMine);
      setProfiles((people || []).filter((p) => p.user_id !== user.id && p.profile_visibility !== "Private"));
      setPosts((feed || []).filter((p) => p.status === "Published"));
      setOpportunities((opportunityRows || []).filter((o) => o.status !== "Closed" || o.author_user_id === user.id));
      setDataRoomRequests(roomRequests || []);
      setConnections(links || []);
      setBlocks(blocked || []);
      setBuyerProfile(buyers?.[0] || null);
    } catch (error) {
      console.error("Network load failed", error);
      setNotice("The quarry network could not refresh. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [user?.id]);

  useEffect(() => {
    if (!shareMineId || !user?.id) return;
    let cancelled = false;
    base44.entities.MiningSite.get(shareMineId).then((site) => {
      if (cancelled || !site) return;
      setLinkedMine(site);
      setOpportunity((current) => ({
        ...current,
        linked_mining_site_id: site.id,
        states: current.states || site.state || "",
        counties: current.counties || site.county || "",
        commodities: current.commodities || site.commodity || "",
        title: current.title || `Quarry opportunity: ${site.mine_name}`,
      }));
      setTab("opportunities");
      setShowOpportunityForm(true);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [shareMineId, user?.id]);

  const blockedIds = useMemo(() => new Set(blocks.map((b) => b.blocked_user_id)), [blocks]);
  const visiblePosts = useMemo(() => posts.filter((p) => !blockedIds.has(p.author_user_id)), [posts, blockedIds]);
  const visibleOpportunities = useMemo(() => {
    const q = search.trim().toLowerCase();
    return opportunities.filter((o) => {
      if (blockedIds.has(o.author_user_id)) return false;
      if (opportunityFilter !== "All" && o.opportunity_type !== opportunityFilter) return false;
      if (!q) return true;
      return [o.title, o.description, o.states, o.counties, o.commodities, o.asset_types, o.author_company, o.author_name]
        .some((v) => String(v || "").toLowerCase().includes(q));
    });
  }, [opportunities, blockedIds, search, opportunityFilter]);

  const myCriteria = useMemo(() => {
    const ownOpen = opportunities.filter((o) => o.author_user_id === user?.id && o.status !== "Closed");
    const profileCriteria = buyerProfileOpportunity(buyerProfile, user?.id);
    return profileCriteria ? [...ownOpen, profileCriteria] : ownOpen;
  }, [opportunities, buyerProfile, user?.id]);

  const matchesForMe = useMemo(() => {
    return opportunities
      .filter((item) => item.author_user_id !== user?.id && item.status !== "Closed")
      .map((item) => {
        let best = { score: 0, reasons: [], criteria: null };
        for (const criteria of myCriteria) {
          const result = matchOpportunities(criteria, item);
          if (result.score > best.score) best = { ...result, criteria };
        }
        return { item, ...best };
      })
      .filter((match) => match.score >= 35)
      .sort((a, b) => b.score - a.score)
      .slice(0, 6);
  }, [opportunities, myCriteria, user?.id]);

  const matchFor = (item) => matchesForMe.find((match) => match.item.id === item.id) || null;
  const roomRequestFor = (item) => dataRoomRequests.find((request) => request.network_opportunity_id === item.id && request.user_id === user?.id) || null;
  const incomingRoomRequestCount = (item) => dataRoomRequests.filter((request) => request.network_opportunity_id === item.id && request.opportunity_owner_user_id === user?.id).length;

  const relationFor = (otherId) => connections.find((c) =>
    (c.requester_user_id === user?.id && c.recipient_user_id === otherId) ||
    (c.recipient_user_id === user?.id && c.requester_user_id === otherId)
  );

  const changeTab = (next) => {
    setTab(next);
    const nextParams = new URLSearchParams(params);
    nextParams.set("tab", next);
    if (next !== "opportunities") nextParams.delete("shareMine");
    setParams(nextParams, { replace: true });
  };

  const openOpportunityForm = (type) => {
    const fromBuyer = type === "Looking For" && buyerProfile;
    setOpportunity({
      ...EMPTY_OPPORTUNITY,
      opportunity_type: type,
      states: fromBuyer ? buyerProfile.target_states || "" : "",
      commodities: fromBuyer ? buyerProfile.target_commodities || "" : "",
      asset_types: fromBuyer ? buyerProfile.asset_preferences || "" : "",
      min_acres: fromBuyer && buyerProfile.min_acres != null ? String(buyerProfile.min_acres) : "",
      max_acres: fromBuyer && buyerProfile.max_acres != null ? String(buyerProfile.max_acres) : "",
      budget_min: fromBuyer && buyerProfile.min_budget != null ? String(buyerProfile.min_budget) : "",
      budget_max: fromBuyer && buyerProfile.max_budget != null ? String(buyerProfile.max_budget) : "",
    });
    setLinkedMine(null);
    setShowOpportunityForm(true);
    setTab("opportunities");
  };

  const createOpportunity = async (event) => {
    event.preventDefault();
    if (!user?.id || !opportunity.title.trim() || !opportunity.description.trim()) return;
    setSavingOpportunity(true);
    try {
      const now = new Date().toISOString();
      await base44.entities.NetworkOpportunity.create({
        author_user_id: user.id,
        author_name: publicProfile?.full_name || privateProfile?.full_name || user.name || "Industry member",
        author_company: publicProfile?.company || privateProfile?.company || "",
        author_headline: publicProfile?.headline || privateProfile?.role_title || "",
        opportunity_type: opportunity.opportunity_type,
        title: opportunity.title.trim(),
        description: opportunity.description.trim(),
        states: opportunity.states.trim(),
        counties: opportunity.counties.trim(),
        commodities: opportunity.commodities.trim(),
        asset_types: opportunity.asset_types.trim(),
        min_acres: numeric(opportunity.min_acres),
        max_acres: numeric(opportunity.max_acres),
        budget_min: numeric(opportunity.budget_min),
        budget_max: numeric(opportunity.budget_max),
        asking_price: numeric(opportunity.asking_price),
        linked_mining_site_id: opportunity.linked_mining_site_id || "",
        linked_listing_id: "",
        confidentiality: opportunity.confidentiality,
        status: "Open",
        created_at: now,
        updated_at: now,
      });
      setOpportunity(EMPTY_OPPORTUNITY);
      setLinkedMine(null);
      setShowOpportunityForm(false);
      setNotice("Opportunity posted to the S&S Quarry Network.");
      const nextParams = new URLSearchParams(params);
      nextParams.delete("shareMine");
      nextParams.set("tab", "opportunities");
      setParams(nextParams, { replace: true });
      await load();
    } finally { setSavingOpportunity(false); }
  };

  const setOpportunityStatus = async (item, status) => {
    await base44.entities.NetworkOpportunity.update(item.id, { ...item, status, updated_at: new Date().toISOString() });
    await load();
  };

  const requestDataRoom = async (item) => {
    if (!user?.id || item.author_user_id === user.id || requestingRoomId) return;
    const existing = roomRequestFor(item);
    if (existing) {
      setNotice(`Your data-room request is already ${existing.status.toLowerCase()}.`);
      return;
    }
    setRequestingRoomId(item.id);
    try {
      const needsNda = item.confidentiality === "NDA / Confidential";
      await base44.entities.DataRoomRequest.create({
        user_id: user.id,
        listing_id: item.linked_listing_id || "",
        seller_submission_id: "",
        network_opportunity_id: item.id,
        mining_site_id: item.linked_mining_site_id || "",
        opportunity_title: item.title,
        opportunity_owner_user_id: item.author_user_id,
        buyer_company: publicProfile?.company || privateProfile?.company || "",
        purpose: `Evaluate S&S Quarry Network opportunity: ${item.title}`,
        nda_agreed: false,
        status: needsNda ? "NDA Required" : "Requested",
        requested_at: new Date().toISOString(),
      });
      setNotice(needsNda ? "Data-room request sent. S&S will qualify the request and the NDA is required before confidential access." : "Data-room request sent for S&S qualification review.");
      await load();
    } finally {
      setRequestingRoomId("");
    }
  };

  const createPost = async (event) => {
    event.preventDefault();
    const text = body.trim();
    if (!text || !user?.id) return;
    setPosting(true);
    try {
      await base44.entities.NetworkPost.create({
        author_user_id: user.id,
        author_name: publicProfile?.full_name || privateProfile?.full_name || user.name || user.email || "Member",
        author_company: publicProfile?.company || privateProfile?.company || "",
        author_headline: publicProfile?.headline || privateProfile?.role_title || privateProfile?.account_type || "",
        post_type: postType,
        body: text,
        created_at: new Date().toISOString(),
        status: "Published",
      });
      setBody("");
      setPostType("Update");
      await load();
    } finally { setPosting(false); }
  };

  const connect = async (person) => {
    if (!user?.id || relationFor(person.user_id)) return;
    await base44.entities.ProfessionalConnection.create({
      requester_user_id: user.id,
      recipient_user_id: person.user_id,
      requester_name: publicProfile?.full_name || privateProfile?.full_name || user.name || "Member",
      recipient_name: person.full_name || "Member",
      status: "Pending",
      created_at: new Date().toISOString(),
    });
    await load();
  };

  const accept = async (connection) => {
    await base44.entities.ProfessionalConnection.update(connection.id, { ...connection, status: "Accepted", responded_at: new Date().toISOString() });
    await load();
  };

  const blockUser = async (targetUserId) => {
    if (!targetUserId || targetUserId === user?.id || blockedIds.has(targetUserId)) return;
    await base44.entities.UserBlock.create({ blocker_user_id: user.id, blocked_user_id: targetUserId, reason: "Blocked from network", created_at: new Date().toISOString() });
    setNotice("Member blocked. Their activity is hidden from your network.");
    await load();
  };

  const reportPost = async (post) => {
    await base44.entities.ContentReport.create({
      reporter_user_id: user.id,
      reported_user_id: post.author_user_id,
      content_type: "Post",
      content_id: post.id,
      reason: "Other",
      details: "Reported from S&S Quarry Network feed for moderator review.",
      status: "Open",
      created_at: new Date().toISOString(),
    });
    setNotice("Post reported for review.");
  };

  const reportOpportunity = async (item) => {
    await base44.entities.ContentReport.create({
      reporter_user_id: user.id,
      reported_user_id: item.author_user_id,
      content_type: "Post",
      content_id: item.id,
      reason: "Other",
      details: `Network opportunity reported for review: ${item.title}`,
      status: "Open",
      created_at: new Date().toISOString(),
    });
    setNotice("Opportunity reported for review.");
  };

  if (!user?.id) return <div className="min-h-screen bg-background px-6 py-16 text-center"><Users className="mx-auto h-9 w-9 text-muted-foreground"/><h1 className="mt-4 font-heading text-2xl font-bold">Join the S&amp;S Quarry Network</h1><p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">Connect with quarry owners, operators, landowners, buyers, investors and industry professionals. Your Apple quarry-intelligence subscription remains separate and active.</p><div className="mt-6 flex flex-wrap justify-center gap-3"><Link to={`/login?returnTo=${encodeURIComponent(`/network${window.location.search || ""}`)}`} className="rounded-xl bg-slate-900 px-5 py-3 text-sm font-bold text-white">Sign in</Link><Link to={`/register?returnTo=${encodeURIComponent(`/network${window.location.search || ""}`)}`} className="rounded-xl border border-border px-5 py-3 text-sm font-bold">Create account</Link></div></div>;

  if (loading) return <div className="min-h-screen flex items-center justify-center bg-background"><Loader2 className="h-7 w-7 animate-spin text-slate-700" /></div>;

  return (
    <div className="min-h-screen bg-slate-50 pb-28 dark:bg-background">
      <header className="sticky top-0 z-30 border-b border-border bg-card/95 backdrop-blur" style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}>
        <div className="mx-auto max-w-6xl px-4 pb-4 pt-3 sm:px-6">
          <div className="flex items-center justify-between gap-3">
            <div><p className="text-[11px] font-bold uppercase tracking-[0.2em] text-sky-700">S&amp;S Quarry Network</p><h1 className="font-heading text-2xl font-bold">Quarry Opportunity Network</h1></div>
            <Link to="/messages" className="inline-flex h-10 items-center gap-2 rounded-xl border border-border bg-card px-3 text-sm font-bold"><MessageCircle className="h-4 w-4" />Messages</Link>
          </div>
          <div className="mt-4 grid grid-cols-3 rounded-xl bg-muted p-1">
            <button onClick={() => changeTab("opportunities")} className={`rounded-lg px-2 py-2.5 text-xs font-bold sm:text-sm ${tab === "opportunities" ? "bg-card shadow-sm" : "text-muted-foreground"}`}>Opportunities</button>
            <button onClick={() => changeTab("feed")} className={`rounded-lg px-2 py-2.5 text-xs font-bold sm:text-sm ${tab === "feed" ? "bg-card shadow-sm" : "text-muted-foreground"}`}>Industry Feed</button>
            <button onClick={() => changeTab("people")} className={`rounded-lg px-2 py-2.5 text-xs font-bold sm:text-sm ${tab === "people" ? "bg-card shadow-sm" : "text-muted-foreground"}`}>People</button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-5 sm:px-6">
        {notice && <div className="mb-4 rounded-xl border border-sky-200 bg-sky-50 p-3 text-sm font-semibold text-sky-950">{notice}</div>}

        {tab === "opportunities" && <>
          <section className="rounded-3xl border border-slate-700 bg-slate-950 p-5 text-white sm:p-7">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-sky-300">Where quarry deals start</p>
            <h2 className="mt-2 font-heading text-3xl font-bold">What are you looking for—or what do you have?</h2>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-300">Post acquisition criteria, quarry-capable land, operating assets, mineral rights or royalty opportunities. Keep confidential diligence out of the public post; move serious conversations into private messages and S&amp;S diligence.</p>
            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              <button onClick={() => openOpportunityForm("Looking For")} className="flex items-center justify-between rounded-2xl border border-sky-400/30 bg-sky-400/10 p-4 text-left hover:bg-sky-400/15"><span><span className="block text-xs font-bold uppercase tracking-wider text-sky-300">Buyer / Investor</span><span className="mt-1 block text-lg font-bold">I’m looking for…</span></span><Target className="h-6 w-6 text-sky-300" /></button>
              <button onClick={() => openOpportunityForm("Have / Offering")} className="flex items-center justify-between rounded-2xl border border-emerald-400/30 bg-emerald-400/10 p-4 text-left hover:bg-emerald-400/15"><span><span className="block text-xs font-bold uppercase tracking-wider text-emerald-300">Owner / Seller / Operator</span><span className="mt-1 block text-lg font-bold">I have / I’m offering…</span></span><Mountain className="h-6 w-6 text-emerald-300" /></button>
            </div>
          </section>

          {showOpportunityForm && <form onSubmit={createOpportunity} className="mt-5 rounded-3xl border border-sky-200 bg-card p-5 shadow-sm sm:p-6">
            <div className="flex items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[0.18em] text-sky-700">New network opportunity</p><h3 className="mt-1 font-heading text-2xl font-bold">{opportunity.opportunity_type}</h3></div><button type="button" onClick={() => { setShowOpportunityForm(false); setLinkedMine(null); }} className="rounded-xl border border-border p-2"><X className="h-4 w-4" /></button></div>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <Field label="Opportunity type"><select className="input" value={opportunity.opportunity_type} onChange={(e) => setOpportunity({ ...opportunity, opportunity_type: e.target.value })}>{OPPORTUNITY_TYPES.map((type) => <option key={type}>{type}</option>)}</select></Field>
              <Field label="Title"><input className="input" maxLength={120} required value={opportunity.title} onChange={(e) => setOpportunity({ ...opportunity, title: e.target.value })} placeholder="Seeking TN limestone quarry, 100+ acres" /></Field>
              <Field label="States"><input className="input" value={opportunity.states} onChange={(e) => setOpportunity({ ...opportunity, states: e.target.value })} placeholder="TN, GA, AL" /></Field>
              <Field label="Counties / areas"><input className="input" value={opportunity.counties} onChange={(e) => setOpportunity({ ...opportunity, counties: e.target.value })} placeholder="Polk, Bradley, Chattanooga region…" /></Field>
              <Field label="Rock / commodity"><input className="input" value={opportunity.commodities} onChange={(e) => setOpportunity({ ...opportunity, commodities: e.target.value })} placeholder="Limestone, granite, sand & gravel…" /></Field>
              <Field label="Asset type"><input className="input" value={opportunity.asset_types} onChange={(e) => setOpportunity({ ...opportunity, asset_types: e.target.value })} placeholder="Operating quarry, potential land, mineral rights…" /></Field>
              <Field label="Minimum acres"><input className="input" inputMode="decimal" value={opportunity.min_acres} onChange={(e) => setOpportunity({ ...opportunity, min_acres: e.target.value })} /></Field>
              <Field label="Maximum acres"><input className="input" inputMode="decimal" value={opportunity.max_acres} onChange={(e) => setOpportunity({ ...opportunity, max_acres: e.target.value })} /></Field>
              {opportunity.opportunity_type === "Looking For" ? <><Field label="Minimum budget"><input className="input" inputMode="decimal" value={opportunity.budget_min} onChange={(e) => setOpportunity({ ...opportunity, budget_min: e.target.value })} /></Field><Field label="Maximum budget"><input className="input" inputMode="decimal" value={opportunity.budget_max} onChange={(e) => setOpportunity({ ...opportunity, budget_max: e.target.value })} /></Field></> : <Field label="Asking / target value"><input className="input" inputMode="decimal" value={opportunity.asking_price} onChange={(e) => setOpportunity({ ...opportunity, asking_price: e.target.value })} /></Field>}
              <Field label="Visibility"><select className="input" value={opportunity.confidentiality} onChange={(e) => setOpportunity({ ...opportunity, confidentiality: e.target.value })}><option>Network</option><option>NDA / Confidential</option></select></Field>
            </div>
            <Field label="What should the network know?"><textarea className="input mt-1 min-h-28" maxLength={1800} required value={opportunity.description} onChange={(e) => setOpportunity({ ...opportunity, description: e.target.value })} placeholder="Describe the opportunity or acquisition criteria. Do not include private title documents, confidential reserves, account numbers or other sensitive diligence here." /></Field>
            {linkedMine && <div className="mt-4 rounded-2xl border border-sky-200 bg-sky-50 p-4 text-sky-950"><div className="text-xs font-bold uppercase tracking-wider text-sky-700">Linked S&amp;S quarry record</div><div className="mt-1 font-bold">{linkedMine.mine_name}</div><div className="mt-1 text-xs">{[linkedMine.county, linkedMine.state, linkedMine.commodity].filter(Boolean).join(" · ")}</div><Link to={`/mines/${linkedMine.id}`} className="mt-2 inline-flex items-center gap-1 text-xs font-bold underline">Open intelligence <ArrowRight className="h-3 w-3" /></Link></div>}
            <div className="mt-5 flex flex-wrap items-center gap-3"><button disabled={savingOpportunity} className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-5 py-3 text-sm font-bold text-white disabled:opacity-50">{savingOpportunity ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}{savingOpportunity ? "Posting…" : "Post opportunity"}</button><span className="text-xs text-muted-foreground">Serious deals can move into private messaging, NDA/data room and S&amp;S diligence.</span></div>
          </form>}

          {matchesForMe.length > 0 && <section className="mt-7 rounded-3xl border border-violet-200 bg-violet-50/70 p-5 sm:p-6">
            <div className="flex items-start gap-3"><div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-violet-950 text-white"><Sparkles className="h-5 w-5" /></div><div><p className="text-xs font-bold uppercase tracking-[0.18em] text-violet-700">Automatic matching</p><h2 className="mt-1 font-heading text-2xl font-bold text-violet-950">Best matches for you</h2><p className="mt-2 text-sm leading-6 text-violet-900/75">S&amp;S compares your buyer profile and your open network opportunities against the other side of the market. Higher scores mean more overlap in region, material, asset type, acreage and budget.</p></div></div>
            <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{matchesForMe.map((match) => <a key={match.item.id} href={`#opportunity-${match.item.id}`} className="rounded-2xl border border-violet-200 bg-white p-4 shadow-sm"><div className="flex items-center justify-between gap-3"><span className="rounded-full bg-violet-950 px-2.5 py-1 text-xs font-bold text-white">{match.score}% match</span><ArrowRight className="h-4 w-4 text-violet-700" /></div><div className="mt-3 font-heading text-base font-bold text-slate-950">{match.item.title}</div><div className="mt-2 text-xs leading-5 text-slate-600">Matches on {match.reasons.slice(0,4).join(", ")}.</div></a>)}</div>
          </section>}

          <section className="mt-7">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-xs font-bold uppercase tracking-[0.18em] text-sky-700">Live network</p><h2 className="mt-1 font-heading text-2xl font-bold">Open quarry opportunities</h2></div><div className="flex gap-2"><select className="rounded-xl border border-border bg-card px-3 py-2 text-xs font-bold" value={opportunityFilter} onChange={(e) => setOpportunityFilter(e.target.value)}><option>All</option>{OPPORTUNITY_TYPES.map((type) => <option key={type}>{type}</option>)}</select></div></div>
            <div className="relative mt-4"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><input className="input pl-10" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search state, commodity, company, county, asset type…" /></div>
            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              {visibleOpportunities.map((item) => {
                const mine = item.author_user_id === user.id;
                const messageText = `I’m interested in your S&S Quarry Network opportunity: ${item.title}`;
                const match = matchFor(item);
                const roomRequest = roomRequestFor(item);
                const incomingRequests = mine ? incomingRoomRequestCount(item) : 0;
                return <article id={`opportunity-${item.id}`} key={item.id} className="scroll-mt-32 rounded-2xl border border-border bg-card p-5 shadow-sm">
                  <div className="flex items-start justify-between gap-3"><div><div className="flex flex-wrap items-center gap-2"><span className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${item.opportunity_type === "Looking For" ? "bg-sky-100 text-sky-900" : "bg-emerald-100 text-emerald-900"}`}>{item.opportunity_type}</span>{match && <span className="inline-flex items-center gap-1 rounded-full bg-violet-100 px-2.5 py-1 text-[10px] font-bold text-violet-900"><Sparkles className="h-3 w-3" />{match.score}% match</span>}</div><h3 className="mt-3 font-heading text-xl font-bold">{item.title}</h3></div>{item.confidentiality === "NDA / Confidential" && <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-bold text-slate-700"><LockKeyhole className="h-3 w-3" />NDA</span>}</div>
                  <div className="mt-2 text-xs text-muted-foreground">{[item.author_name, item.author_company].filter(Boolean).join(" · ")}</div>
                  <p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-foreground">{item.description}</p>
                  <div className="mt-4 flex flex-wrap gap-2">{opportunitySummary(item).map((value) => <span key={value} className="rounded-lg bg-muted px-2.5 py-1.5 text-xs font-semibold text-muted-foreground">{value}</span>)}</div>
                  {item.linked_mining_site_id && <Link to={`/mines/${item.linked_mining_site_id}`} className="mt-4 flex items-center justify-between rounded-xl border border-sky-200 bg-sky-50 p-3 text-sm font-bold text-sky-950"><span className="inline-flex items-center gap-2"><Mountain className="h-4 w-4" />Linked S&amp;S quarry intelligence</span><ArrowRight className="h-4 w-4" /></Link>}
                  <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-border pt-4">{!mine ? <><Link to={`/messages?user=${encodeURIComponent(item.author_user_id)}&text=${encodeURIComponent(messageText)}`} className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-xs font-bold text-white"><MessageCircle className="h-4 w-4" />I’m interested</Link>{item.opportunity_type === "Have / Offering" && (roomRequest ? <span className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-800"><ShieldCheck className="h-4 w-4" />{roomRequest.status}</span> : <button onClick={() => requestDataRoom(item)} disabled={requestingRoomId === item.id} className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-3 py-2 text-xs font-bold disabled:opacity-50">{requestingRoomId === item.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileKey2 className="h-4 w-4" />}{item.confidentiality === "NDA / Confidential" ? "Request NDA / Data Room" : "Request Data Room"}</button>)}<button onClick={() => reportOpportunity(item)} className="ml-auto inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-semibold text-muted-foreground"><Flag className="h-4 w-4" />Report</button><button onClick={() => blockUser(item.author_user_id)} className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-semibold text-muted-foreground"><ShieldBan className="h-4 w-4" />Block</button></> : <><span className="text-xs font-bold text-muted-foreground">Your opportunity · {item.status}</span>{incomingRequests > 0 && <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[10px] font-bold text-amber-900">{incomingRequests} data-room request{incomingRequests === 1 ? "" : "s"}</span>}{item.status === "Closed" ? <button onClick={() => setOpportunityStatus(item, "Open")} className="ml-auto rounded-lg border border-border px-3 py-2 text-xs font-bold">Reopen</button> : <button onClick={() => setOpportunityStatus(item, "Closed")} className="ml-auto rounded-lg border border-border px-3 py-2 text-xs font-bold">Close</button>}</>}</div>
                </article>;
              })}
              {visibleOpportunities.length === 0 && <div className="rounded-2xl border border-dashed border-border bg-card p-10 text-center lg:col-span-2"><Target className="mx-auto h-8 w-8 text-muted-foreground" /><div className="mt-3 font-bold">No matching opportunities yet</div><p className="mt-1 text-sm text-muted-foreground">Post what you’re looking for or what you have. This is where the S&amp;S deal network starts.</p></div>}
            </div>
          </section>
        </>}

        {tab === "feed" && <div className="grid gap-5 lg:grid-cols-[280px_1fr]">
          <aside className="hidden lg:block"><div className="sticky top-32 rounded-2xl border border-border bg-card p-5 shadow-sm"><div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-900 text-white"><Mountain className="h-6 w-6" /></div><div className="mt-4 font-heading text-xl font-bold">{publicProfile?.full_name || privateProfile?.full_name}</div><div className="mt-1 text-sm text-muted-foreground">{publicProfile?.headline || privateProfile?.role_title || privateProfile?.account_type}</div>{(publicProfile?.company || privateProfile?.company) && <div className="mt-2 flex items-center gap-2 text-sm"><Building2 className="h-4 w-4" />{publicProfile?.company || privateProfile?.company}</div>}<Link to="/profile?returnTo=/network" className="mt-4 inline-block text-sm font-bold text-sky-800">Edit network profile</Link></div></aside>
          <section className="min-w-0 space-y-4"><form onSubmit={createPost} className="rounded-2xl border border-border bg-card p-4 shadow-sm"><div className="flex gap-3"><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-900 text-sm font-bold text-white">{(publicProfile?.full_name || privateProfile?.full_name || user?.email || "S").slice(0,1).toUpperCase()}</div><div className="min-w-0 flex-1"><textarea value={body} onChange={(e) => setBody(e.target.value)} maxLength={1500} placeholder="Share an industry update, equipment need, project, hiring need or question…" className="min-h-24 w-full resize-none rounded-xl border border-border bg-background p-3 text-sm outline-none focus:ring-2 focus:ring-sky-300" /><div className="mt-3 flex items-center justify-between gap-3"><select value={postType} onChange={(e) => setPostType(e.target.value)} className="rounded-lg border border-border bg-background px-3 py-2 text-xs font-bold">{POST_TYPES.map((type) => <option key={type}>{type}</option>)}</select><button disabled={posting || !body.trim()} className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-bold text-white disabled:opacity-40">{posting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}Post</button></div></div></div></form>
            {visiblePosts.map((post) => <article key={post.id} className="rounded-2xl border border-border bg-card p-5 shadow-sm"><div className="flex items-start justify-between gap-4"><div className="flex min-w-0 gap-3"><div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-slate-800 text-sm font-bold text-white">{(post.author_name || "M").slice(0,1).toUpperCase()}</div><div className="min-w-0"><div className="truncate font-bold">{post.author_name || "Industry member"}</div><div className="truncate text-xs text-muted-foreground">{[post.author_headline, post.author_company].filter(Boolean).join(" · ")}</div><div className="mt-0.5 text-[11px] text-muted-foreground">{post.created_at ? new Date(post.created_at).toLocaleString() : ""}</div></div></div><span className="rounded-full bg-sky-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-sky-800">{post.post_type}</span></div><p className="mt-4 whitespace-pre-wrap text-[15px] leading-6 text-foreground">{post.body}</p><div className="mt-5 flex flex-wrap items-center gap-2 border-t border-border pt-3"><button className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-semibold text-muted-foreground"><Heart className="h-4 w-4" />Like</button>{post.author_user_id !== user?.id && <Link to={`/messages?user=${encodeURIComponent(post.author_user_id)}`} className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-semibold text-muted-foreground"><MessageCircle className="h-4 w-4" />Message</Link>}{post.author_user_id !== user?.id && <button onClick={() => reportPost(post)} className="ml-auto inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-semibold text-muted-foreground"><Flag className="h-4 w-4" />Report</button>}{post.author_user_id !== user?.id && <button onClick={() => blockUser(post.author_user_id)} className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-semibold text-muted-foreground"><ShieldBan className="h-4 w-4" />Block</button>}</div></article>)}
            {visiblePosts.length === 0 && <div className="rounded-2xl border border-dashed border-border bg-card p-10 text-center"><Handshake className="mx-auto h-8 w-8 text-muted-foreground" /><div className="mt-3 font-bold">The industry feed starts here</div><p className="mt-1 text-sm text-muted-foreground">Share an update or question. Deal opportunities belong in the Opportunities tab.</p></div>}
          </section>
        </div>}

        {tab === "people" && <section><div className="mb-4"><p className="text-xs font-bold uppercase tracking-[0.18em] text-sky-700">Industry directory</p><h2 className="mt-1 font-heading text-2xl font-bold">People in the quarry industry</h2><p className="mt-2 text-sm text-muted-foreground">Only network-safe profile information appears here. Private account contact information is not exposed.</p></div><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{profiles.filter((p) => !blockedIds.has(p.user_id)).map((person) => { const relation = relationFor(person.user_id); const incoming = relation?.recipient_user_id === user?.id && relation?.status === "Pending"; return <div key={person.id} className="rounded-2xl border border-border bg-card p-5 shadow-sm"><div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-900 text-lg font-bold text-white">{(person.full_name || "M").slice(0,1).toUpperCase()}</div><div className="mt-4 font-heading text-lg font-bold">{person.full_name}</div><div className="mt-1 text-sm text-muted-foreground">{person.headline || person.role_title || person.account_type}</div>{person.company && <div className="mt-2 flex items-center gap-2 text-sm"><Building2 className="h-4 w-4" />{person.company}</div>}{person.home_state && <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground"><MapPin className="h-3.5 w-3.5" />{person.home_state}</div>}{person.commodities_of_interest && <div className="mt-3 text-xs leading-5 text-muted-foreground">Rock interests: {person.commodities_of_interest}</div>}{person.open_to_opportunities && <div className="mt-3 inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-emerald-800"><CircleDollarSign className="h-3 w-3" />Open to opportunities</div>}<div className="mt-5 flex flex-wrap gap-2">{incoming ? <button onClick={() => accept(relation)} className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-3 py-2 text-xs font-bold text-white"><Check className="h-4 w-4" />Accept</button> : relation?.status === "Accepted" ? <span className="inline-flex items-center gap-2 rounded-xl bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-800"><Handshake className="h-4 w-4" />Connected</span> : relation?.status === "Pending" ? <span className="inline-flex items-center rounded-xl bg-muted px-3 py-2 text-xs font-bold text-muted-foreground">Pending</span> : <button onClick={() => connect(person)} className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-3 py-2 text-xs font-bold text-white"><UserPlus className="h-4 w-4" />Connect</button>}<Link to={`/messages?user=${encodeURIComponent(person.user_id)}`} className="inline-flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-xs font-bold"><MessageCircle className="h-4 w-4" />Message</Link></div></div>; })}{profiles.length === 0 && <div className="rounded-2xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground sm:col-span-2 lg:col-span-3">No other visible network profiles yet. As members save their S&amp;S profile, the safe public directory will populate here.</div>}</div></section>}
      </main>
    </div>
  );
}

function Field({ label, children }) {
  return <label className="block"><span className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-muted-foreground">{label}</span>{children}</label>;
}
