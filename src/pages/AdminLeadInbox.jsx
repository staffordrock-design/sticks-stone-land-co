import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import {
  ArrowLeft,
  BadgeDollarSign,
  ExternalLink,
  Handshake,
  Link2,
  Mail,
  MapPin,
  Phone,
  RefreshCw,
  Search,
  ShieldAlert,
  ShoppingCart,
  Users,
} from "lucide-react";

const TYPES = ["All", "Buyer", "Seller", "Link My Quarry"];
const STAGES = ["All", "New", "Reviewing", "Contacted", "Qualified", "Deal", "Connected", "Closed"];

export default function AdminLeadInbox() {
  const { user } = useAuth();
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState("");
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("All");
  const [stageFilter, setStageFilter] = useState("All");

  const load = async () => {
    if (user?.role !== "admin") {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const rows = await base44.entities.QuarryLeadIntake.list("-created_at", 500);
      setLeads(rows || []);
    } catch (error) {
      console.error("Failed to load quarry leads", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [user?.role]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return leads.filter((lead) => {
      const typeOk = typeFilter === "All" || lead.lead_type === typeFilter;
      const stageOk = stageFilter === "All" || lead.status === stageFilter;
      const haystack = [
        lead.name,
        lead.email,
        lead.phone,
        lead.company,
        lead.property_name,
        lead.mine_name,
        lead.msha_mine_id,
        lead.county,
        lead.state,
        lead.target_states,
        lead.target_counties,
        lead.target_commodities,
        lead.commodity,
      ].filter(Boolean).join(" ").toLowerCase();
      return typeOk && stageOk && (!q || haystack.includes(q));
    });
  }, [leads, query, typeFilter, stageFilter]);

  const stats = useMemo(() => ({
    total: leads.length,
    newCount: leads.filter((l) => l.status === "New").length,
    buyers: leads.filter((l) => l.lead_type === "Buyer").length,
    sellers: leads.filter((l) => l.lead_type === "Seller").length,
    links: leads.filter((l) => l.lead_type === "Link My Quarry").length,
  }), [leads]);

  const setStatus = async (lead, status) => {
    if (!lead?.id || status === lead.status) return;
    const prior = lead.status;
    setUpdating(lead.id);
    setLeads((rows) => rows.map((row) => row.id === lead.id ? { ...row, status } : row));
    try {
      await base44.entities.QuarryLeadIntake.update(lead.id, { status });
    } catch (error) {
      console.error("Failed to update lead stage", error);
      setLeads((rows) => rows.map((row) => row.id === lead.id ? { ...row, status: prior } : row));
    } finally {
      setUpdating("");
    }
  };

  if (user?.role !== "admin") {
    return (
      <div className="min-h-screen bg-background p-6">
        <div className="mx-auto max-w-3xl rounded-2xl border border-border bg-card p-8 text-center">
          <ShieldAlert className="mx-auto h-9 w-9 text-muted-foreground" />
          <h1 className="mt-4 text-xl font-bold">Admin only</h1>
          <p className="mt-2 text-sm text-muted-foreground">The S&S lead inbox is private.</p>
          <Link to="/" className="mt-5 inline-block font-semibold text-sky-800 hover:underline">Back to quarry intelligence</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-28 lg:pb-10">
      <header className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur" style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}>
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-5 pb-4 sm:px-6">
          <Link to="/" className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" /> Quarries
          </Link>
          <button onClick={load} disabled={loading} className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-xs font-semibold text-foreground disabled:opacity-50">
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Refresh
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-5 py-8 sm:px-6">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-700">Private S&S Admin</p>
          <h1 className="mt-2 font-heading text-3xl font-bold text-foreground sm:text-4xl">Lead Inbox</h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground">Every buyer, seller and quarry-link request from the app in one place. Call or email the lead, open the quarry record, and move the opportunity through your pipeline.</p>
        </div>

        <div className="mt-7 grid grid-cols-2 gap-3 sm:grid-cols-5">
          <Stat icon={Users} label="All leads" value={stats.total} />
          <Stat icon={RefreshCw} label="New" value={stats.newCount} />
          <Stat icon={ShoppingCart} label="Buyers" value={stats.buyers} />
          <Stat icon={Handshake} label="Sellers" value={stats.sellers} />
          <Stat icon={Link2} label="Quarry links" value={stats.links} />
        </div>

        <div className="mt-7 rounded-2xl border border-border bg-card p-4">
          <div className="grid gap-3 md:grid-cols-[1fr_180px_180px]">
            <label className="relative block">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search name, company, quarry, county, MSHA ID…" className="input w-full pl-9" />
            </label>
            <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className="input w-full">
              {TYPES.map((type) => <option key={type} value={type}>{type === "All" ? "All lead types" : type}</option>)}
            </select>
            <select value={stageFilter} onChange={(e) => setStageFilter(e.target.value)} className="input w-full">
              {STAGES.map((stage) => <option key={stage} value={stage}>{stage === "All" ? "All stages" : stage}</option>)}
            </select>
          </div>
          <div className="mt-3 text-xs text-muted-foreground">Showing {filtered.length} of {leads.length} leads</div>
        </div>

        {loading ? (
          <div className="mt-6 rounded-2xl border border-border bg-card p-10 text-center text-sm text-muted-foreground">Loading leads…</div>
        ) : filtered.length === 0 ? (
          <div className="mt-6 rounded-2xl border border-dashed border-border p-12 text-center">
            <Users className="mx-auto h-8 w-8 text-muted-foreground" />
            <h2 className="mt-4 font-semibold text-foreground">No matching leads yet</h2>
            <p className="mt-2 text-sm text-muted-foreground">New buyer, seller and quarry-link submissions will show up here automatically.</p>
          </div>
        ) : (
          <div className="mt-6 space-y-4">
            {filtered.map((lead) => <LeadCard key={lead.id} lead={lead} updating={updating === lead.id} onStatus={setStatus} />)}
          </div>
        )}
      </main>
    </div>
  );
}

function LeadCard({ lead, updating, onStatus }) {
  const isBuyer = lead.lead_type === "Buyer";
  const isSeller = lead.lead_type === "Seller";
  const TypeIcon = isBuyer ? ShoppingCart : isSeller ? Handshake : Link2;

  return (
    <article className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
      <div className="flex flex-col gap-4 p-5 sm:p-6 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-900 px-2.5 py-1 text-xs font-bold text-white"><TypeIcon className="h-3.5 w-3.5" />{lead.lead_type}</span>
            <span className="rounded-full border border-border bg-muted/40 px-2.5 py-1 text-xs font-semibold text-foreground">{lead.status || "New"}</span>
            <span className="text-xs text-muted-foreground">{formatDate(lead.created_at || lead.created_date)}</span>
          </div>

          <h2 className="mt-3 text-xl font-bold text-foreground">{lead.name || lead.email || "Unnamed lead"}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{[lead.company, lead.role_title].filter(Boolean).join(" · ") || "Individual lead"}</p>

          <div className="mt-4 flex flex-wrap gap-2">
            {lead.phone && <a href={`tel:${lead.phone}`} className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-background px-3 py-2 text-sm font-semibold text-foreground"><Phone className="h-4 w-4" /> Call</a>}
            {lead.email && <a href={`mailto:${lead.email}`} className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-background px-3 py-2 text-sm font-semibold text-foreground"><Mail className="h-4 w-4" /> Email</a>}
            {lead.mining_site_id && <Link to={`/mines/${lead.mining_site_id}`} className="inline-flex items-center gap-1.5 rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-sm font-semibold text-sky-900"><ExternalLink className="h-4 w-4" /> Open Quarry Record</Link>}
          </div>
        </div>

        <div className="w-full rounded-xl border border-border bg-muted/20 p-3 lg:w-48">
          <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Pipeline stage</label>
          <select value={lead.status || "New"} disabled={updating} onChange={(e) => onStatus(lead, e.target.value)} className="input mt-1.5 w-full text-sm font-semibold disabled:opacity-50">
            {STAGES.filter((s) => s !== "All").map((stage) => <option key={stage} value={stage}>{stage}</option>)}
          </select>
        </div>
      </div>

      <div className="grid border-t border-border md:grid-cols-2 xl:grid-cols-4">
        <Info label="Contact" value={[lead.phone, lead.email].filter(Boolean).join(" · ")} />
        <Info label="Quarry / Property" value={lead.mine_name || lead.property_name || "—"} sub={lead.msha_mine_id ? `MSHA ${lead.msha_mine_id}` : ""} icon={MapPin} />
        {isBuyer ? (
          <Info label="Buyer Range" value={budgetRange(lead.min_budget, lead.max_budget)} sub={acreRange(lead.min_acres, lead.max_acres)} icon={BadgeDollarSign} />
        ) : isSeller ? (
          <Info label="Seller Ask" value={money(lead.asking_price)} sub={lead.acreage != null ? `${Number(lead.acreage).toLocaleString()} acres` : ""} icon={BadgeDollarSign} />
        ) : (
          <Info label="Relationship" value={lead.relationship_to_site || "—"} sub={lead.company || ""} icon={Link2} />
        )}
        <Info label="Timing / Area" value={isBuyer ? (lead.acquisition_timing || "—") : isSeller ? (lead.seller_timing || "—") : ([lead.county, lead.state].filter(Boolean).join(", ") || "—")} sub={isBuyer ? ([lead.target_counties, lead.target_states].filter(Boolean).join(" · ") || "") : ""} />
      </div>

      <div className="border-t border-border p-5 sm:p-6">
        <div className="grid gap-5 lg:grid-cols-2">
          {isBuyer && <>
            <TextBlock label="Rock / Commodity Wanted" value={lead.target_commodities} />
            <TextBlock label="Buyer Preferences" value={lead.asset_preferences} />
          </>}
          {isSeller && <>
            <TextBlock label="Commodity / Asset" value={[lead.commodity, lead.asset_type].filter(Boolean).join(" · ")} />
            <TextBlock label="Ownership / Mineral Rights" value={lead.ownership_summary} />
          </>}
          {!isBuyer && !isSeller && <>
            <TextBlock label="Quarry Link Request" value={lead.mine_name ? `${lead.mine_name}${lead.msha_mine_id ? ` · MSHA ${lead.msha_mine_id}` : ""}` : "No quarry name recorded"} />
            <TextBlock label="Link Notes" value={lead.link_notes} />
          </>}
        </div>
      </div>
    </article>
  );
}

function Stat({ icon: Icon, label, value }) {
  return <div className="rounded-2xl border border-border bg-card p-4"><div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground"><Icon className="h-4 w-4" />{label}</div><div className="mt-2 text-2xl font-bold text-foreground">{Number(value || 0).toLocaleString()}</div></div>;
}

function Info({ label, value, sub, icon: Icon }) {
  return <div className="border-b border-border p-4 last:border-b-0 md:border-b-0 md:border-r md:last:border-r-0"><div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{Icon && <Icon className="h-3.5 w-3.5" />}{label}</div><div className="mt-1 break-words text-sm font-semibold text-foreground">{value || "—"}</div>{sub && <div className="mt-1 break-words text-xs text-muted-foreground">{sub}</div>}</div>;
}

function TextBlock({ label, value }) {
  return <div><div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{label}</div><p className="mt-1 whitespace-pre-line text-sm leading-6 text-foreground">{value || "—"}</p></div>;
}

function money(value) {
  if (value == null || value === "") return "—";
  return Number(value).toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

function budgetRange(min, max) {
  if (min == null && max == null) return "Budget not entered";
  if (min != null && max != null) return `${money(min)} – ${money(max)}`;
  if (min != null) return `${money(min)}+`;
  return `Up to ${money(max)}`;
}

function acreRange(min, max) {
  if (min == null && max == null) return "";
  if (min != null && max != null) return `${Number(min).toLocaleString()}–${Number(max).toLocaleString()} acres`;
  if (min != null) return `${Number(min).toLocaleString()}+ acres`;
  return `Up to ${Number(max).toLocaleString()} acres`;
}

function formatDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}
