import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import {
  ArrowLeft,
  Building2,
  CheckCircle2,
  Handshake,
  Link2,
  MapPin,
  Search,
  ShoppingCart,
} from "lucide-react";
import BottomSheetSelect from "@/components/BottomSheetSelect";

const MODES = [
  { id: "Buyer", label: "Find a Quarry", icon: ShoppingCart, description: "Tell us what you want to buy and we’ll match it to quarry and mineral opportunities." },
  { id: "Seller", label: "Sell a Quarry", icon: Handshake, description: "Tell us what you own or control and put it into the S&S seller pipeline." },
  { id: "Link My Quarry", label: "Link My Quarry Data", icon: Link2, description: "Find an existing quarry record and connect your company or relationship to it for review." },
];

const ASSET_TYPES = ["Operating Quarry", "Potential Quarry Land", "Aggregate Operation", "Mineral Rights", "Royalty Interest", "Other"];
const RELATIONSHIPS = ["Owner / Landowner", "Operator", "Permittee", "Controller", "Broker / Agent", "Buyer / Investor", "Other"];
const TIMING = ["Immediately", "0–3 months", "3–6 months", "6–12 months", "12+ months", "Just exploring"];

const initialForm = {
  name: "",
  email: "",
  phone: "",
  company: "",
  role_title: "",
  target_states: "TN, GA, AL, NC, SC, KY, MS, FL",
  target_counties: "",
  target_commodities: "",
  min_acres: "",
  max_acres: "",
  min_budget: "",
  max_budget: "",
  asset_preferences: "",
  acquisition_timing: "0–3 months",
  property_name: "",
  state: "TN",
  county: "",
  acreage: "",
  asking_price: "",
  asset_type: "Operating Quarry",
  commodity: "",
  ownership_summary: "",
  seller_timing: "0–3 months",
  relationship_to_site: "Owner / Landowner",
  link_notes: "",
};

function numberOrNull(value) {
  const n = Number(value);
  return value === "" || Number.isNaN(n) ? null : n;
}

function escapeRegex(value = "") {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export default function LeadSetup() {
  const { user } = useAuth();
  const [mode, setMode] = useState("Buyer");
  const [form, setForm] = useState(initialForm);
  const [mineQuery, setMineQuery] = useState("");
  const [mineResults, setMineResults] = useState([]);
  const [selectedMine, setSelectedMine] = useState(null);
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");
  const [feeAcknowledged, setFeeAcknowledged] = useState(false);

  useEffect(() => {
    if (!user) return;
    setForm((f) => ({ ...f, name: f.name || user.name || "", email: f.email || user.email || "" }));
  }, [user]);

  useEffect(() => {
    const q = mineQuery.trim();
    if (q.length < 2) {
      setMineResults([]);
      return undefined;
    }

    let cancelled = false;
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const safe = escapeRegex(q).slice(0, 80);
        const rows = await base44.entities.MiningSite.filter({
          $or: [
            { mine_name: { $regex: safe, $options: "i" } },
            { operator_name: { $regex: safe, $options: "i" } },
            { permittee_name: { $regex: safe, $options: "i" } },
            { county: { $regex: safe, $options: "i" } },
            { commodity: { $regex: safe, $options: "i" } },
            { msha_mine_id: { $regex: safe, $options: "i" } },
            { tdec_permit_number: { $regex: safe, $options: "i" } },
            { parcel_id: { $regex: safe, $options: "i" } },
          ],
        }, "-updated_date", 12);
        if (!cancelled) setMineResults(rows || []);
      } catch (e) {
        console.error("Quarry lookup failed", e);
        if (!cancelled) setMineResults([]);
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 300);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [mineQuery]);

  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }));

  const chooseMine = (site) => {
    setSelectedMine(site);
    setMineQuery(site.mine_name || site.msha_mine_id || "");
    setMineResults([]);
    if (mode === "Seller") {
      setForm((f) => ({
        ...f,
        property_name: f.property_name || site.mine_name || "",
        state: site.state || f.state,
        county: site.county || f.county,
        acreage: f.acreage || (site.acreage ? String(site.acreage) : ""),
        commodity: f.commodity || site.commodity || "",
      }));
    }
  };

  const switchMode = (next) => {
    setMode(next);
    setDone(false);
    setError("");
    setSelectedMine(null);
    setMineQuery("");
    setMineResults([]);
  };

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    if (!user?.id) {
      setError("Please sign in before submitting your information.");
      return;
    }
    if (mode === "Link My Quarry" && !selectedMine?.id) {
      setError("Choose the quarry record you want to link first.");
      return;
    }
    if (mode === "Seller" && !feeAcknowledged) {
      setError("Please acknowledge the transaction-fee disclosure before submitting.");
      return;
    }

    setSaving(true);
    try {
      const now = new Date().toISOString();
      const lead = {
        user_id: user.id,
        lead_type: mode,
        name: form.name || user.name || "",
        email: form.email || user.email || "",
        phone: form.phone,
        company: form.company,
        role_title: form.role_title,
        target_states: mode === "Buyer" ? form.target_states : "",
        target_counties: mode === "Buyer" ? form.target_counties : "",
        target_commodities: mode === "Buyer" ? form.target_commodities : "",
        min_acres: mode === "Buyer" ? numberOrNull(form.min_acres) : null,
        max_acres: mode === "Buyer" ? numberOrNull(form.max_acres) : null,
        min_budget: mode === "Buyer" ? numberOrNull(form.min_budget) : null,
        max_budget: mode === "Buyer" ? numberOrNull(form.max_budget) : null,
        asset_preferences: mode === "Buyer" ? form.asset_preferences : "",
        acquisition_timing: mode === "Buyer" ? form.acquisition_timing : "",
        property_name: mode === "Seller" ? form.property_name : "",
        state: mode === "Seller" ? form.state : "",
        county: mode === "Seller" ? form.county : "",
        acreage: mode === "Seller" ? numberOrNull(form.acreage) : null,
        asking_price: mode === "Seller" ? numberOrNull(form.asking_price) : null,
        asset_type: mode === "Seller" ? form.asset_type : "",
        commodity: mode === "Seller" ? form.commodity : "",
        ownership_summary: mode === "Seller" ? form.ownership_summary : "",
        seller_timing: mode === "Seller" ? form.seller_timing : "",
        mining_site_id: selectedMine?.id || "",
        msha_mine_id: selectedMine?.msha_mine_id || "",
        mine_name: selectedMine?.mine_name || "",
        relationship_to_site: mode === "Link My Quarry" ? form.relationship_to_site : "",
        link_notes: mode === "Link My Quarry" ? form.link_notes : "",
        source: "App Intake",
        status: "New",
        created_at: now,
      };

      await base44.entities.QuarryLeadIntake.create(lead);

      if (mode === "Buyer") {
        const buyerPayload = {
          user_id: user.id,
          name: form.name || user.name || "",
          email: form.email || user.email || "",
          company: form.company,
          role_title: form.role_title,
          target_states: form.target_states,
          target_commodities: form.target_commodities,
          min_acres: numberOrNull(form.min_acres),
          max_acres: numberOrNull(form.max_acres),
          min_budget: numberOrNull(form.min_budget),
          max_budget: numberOrNull(form.max_budget),
          asset_preferences: [form.asset_preferences, form.target_counties ? `Target counties: ${form.target_counties}` : "", selectedMine?.mine_name ? `Interested in: ${selectedMine.mine_name}` : ""].filter(Boolean).join("\n"),
          notes: `Acquisition timing: ${form.acquisition_timing}${form.phone ? `\nPhone: ${form.phone}` : ""}`,
          active: true,
        };
        const rows = await base44.entities.BuyerProfile.filter({ user_id: user.id }, "-updated_date", 1);
        if (rows?.[0]) await base44.entities.BuyerProfile.update(rows[0].id, buyerPayload);
        else await base44.entities.BuyerProfile.create(buyerPayload);
      }

      if (mode === "Seller") {
        await base44.entities.SellerSubmission.create({
          user_id: user.id,
          seller_name: form.name || user.name || "",
          seller_email: form.email || user.email || "",
          company: form.company,
          property_name: form.property_name || selectedMine?.mine_name || "Seller Property",
          state: form.state || selectedMine?.state || "TN",
          county: form.county || selectedMine?.county || "",
          acreage: numberOrNull(form.acreage),
          asset_type: form.asset_type,
          asking_price: numberOrNull(form.asking_price),
          commodity: form.commodity || selectedMine?.commodity || "",
          ownership_summary: form.ownership_summary,
          description: selectedMine?.mine_name ? `Linked to S&S quarry record: ${selectedMine.mine_name}${selectedMine.msha_mine_id ? ` (MSHA ${selectedMine.msha_mine_id})` : ""}.` : "Submitted through S&S buyer/seller intake.",
          confidential_notes: `Seller timing: ${form.seller_timing}${form.phone ? `\nPhone: ${form.phone}` : ""}`,
          status: "Submitted",
          submitted_at: now,
        });
      }

      setDone(true);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e) {
      console.error("Lead intake failed", e);
      setError(e?.message || "We couldn’t save this submission. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  if (!user?.id) {
    return (
      <div className="min-h-screen bg-background">
        <header className="border-b border-border"><div className="mx-auto max-w-5xl px-6 py-4"><Link to="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground"><ArrowLeft className="h-4 w-4" />Back</Link></div></header>
        <main className="mx-auto max-w-3xl px-6 py-16 text-center">
          <Building2 className="mx-auto h-12 w-12 text-slate-700" />
          <h1 className="mt-5 font-heading text-3xl font-bold">Buy, Sell, or Link Your Quarry</h1>
          <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-muted-foreground">Create a free S&S account or sign in so we can save your buyer criteria, seller lead, or quarry-data link request.</p>
          <div className="mt-7 flex flex-wrap justify-center gap-3">
            <Link to="/register?returnTo=%2Fget-started" className="rounded-xl bg-slate-900 px-5 py-3 text-sm font-bold text-white">Create Account</Link>
            <Link to="/login?returnTo=%2Fget-started" className="rounded-xl border border-border bg-card px-5 py-3 text-sm font-bold">Sign In</Link>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-28">
      <header className="border-b border-border bg-card/80 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <Link to="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground"><ArrowLeft className="h-4 w-4" />Back to quarries</Link>
          <span className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-800">S&amp;S Quarry Connect</span>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-10">
        <div className="max-w-3xl">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Buyer / Seller Lead Setup</p>
          <h1 className="mt-2 font-heading text-3xl font-bold sm:text-4xl">Buy, sell, or link your quarry.</h1>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">Start with what you’re trying to do. S&amp;S keeps the lead information tied to the quarry intelligence side instead of making you re-enter the same data later.</p>
        </div>

        <div className="mt-8 grid gap-3 md:grid-cols-3">
          {MODES.map(({ id, label, icon: Icon, description }) => {
            const active = mode === id;
            return (
              <button key={id} type="button" onClick={() => switchMode(id)} className={`rounded-2xl border p-5 text-left transition ${active ? "border-sky-700 bg-sky-50 shadow-sm" : "border-border bg-card hover:border-slate-400"}`}>
                <Icon className={`h-6 w-6 ${active ? "text-sky-800" : "text-slate-600"}`} />
                <div className="mt-3 font-heading text-lg font-bold">{label}</div>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">{description}</p>
              </button>
            );
          })}
        </div>

        {done ? (
          <Success mode={mode} />
        ) : (
          <form onSubmit={submit} className="mt-7 space-y-7 rounded-2xl border border-border bg-card p-6 shadow-sm sm:p-8">
            <section>
              <SectionTitle>Contact Information</SectionTitle>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <Field label="Name"><input className="input" value={form.name} onChange={(e) => set("name", e.target.value)} required /></Field>
                <Field label="Company"><input className="input" value={form.company} onChange={(e) => set("company", e.target.value)} /></Field>
                <Field label="Email"><input className="input" type="email" value={form.email} onChange={(e) => set("email", e.target.value)} required /></Field>
                <Field label="Phone"><input className="input" type="tel" value={form.phone} onChange={(e) => set("phone", e.target.value)} /></Field>
                <Field label="Role / Title"><input className="input" value={form.role_title} onChange={(e) => set("role_title", e.target.value)} placeholder="Owner, president, acquisitions, broker..." /></Field>
              </div>
            </section>

            <section className="border-t border-border pt-6">
              <SectionTitle>{mode === "Buyer" ? "Find Your Quarry" : mode === "Seller" ? "Link an Existing Quarry Record (Optional)" : "Find the Quarry to Link"}</SectionTitle>
              <p className="mt-2 text-sm text-muted-foreground">Search by quarry name, company, county, rock type, MSHA ID, TDEC permit, or parcel ID.</p>
              <div className="relative mt-4">
                <Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-muted-foreground" />
                <input className="input pl-10" value={mineQuery} onChange={(e) => { setMineQuery(e.target.value); setSelectedMine(null); }} placeholder="Search quarry data..." />
                {searching && <span className="absolute right-3 top-3 text-xs text-muted-foreground">Searching…</span>}
                {mineResults.length > 0 && (
                  <div className="absolute z-30 mt-1 max-h-80 w-full overflow-y-auto rounded-xl border border-border bg-popover shadow-xl">
                    {mineResults.map((site) => (
                      <button key={site.id} type="button" onClick={() => chooseMine(site)} className="flex w-full items-start gap-3 border-b border-border/60 px-4 py-3 text-left last:border-0 hover:bg-muted/60">
                        <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-sky-700" />
                        <div className="min-w-0">
                          <div className="truncate text-sm font-bold">{site.mine_name || "Unnamed quarry"}</div>
                          <div className="mt-0.5 text-xs text-muted-foreground">{[site.county, site.state].filter(Boolean).join(", ")}{site.commodity ? ` · ${site.commodity}` : ""}{site.msha_mine_id ? ` · MSHA ${site.msha_mine_id}` : ""}</div>
                          {(site.operator_name || site.permittee_name) && <div className="mt-1 text-xs text-muted-foreground">{site.operator_name || site.permittee_name}</div>}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {selectedMine && (
                <div className="mt-4 rounded-xl border border-sky-200 bg-sky-50 p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="text-xs font-semibold uppercase tracking-wider text-sky-800">Linked quarry record</div>
                      <div className="mt-1 font-heading text-lg font-bold text-slate-950">{selectedMine.mine_name}</div>
                      <div className="mt-1 text-sm text-slate-700">{[selectedMine.county, selectedMine.state].filter(Boolean).join(", ")}{selectedMine.msha_mine_id ? ` · MSHA ${selectedMine.msha_mine_id}` : ""}</div>
                    </div>
                    <button type="button" onClick={() => { setSelectedMine(null); setMineQuery(""); }} className="text-xs font-bold text-slate-600 hover:text-slate-950">Change</button>
                  </div>
                </div>
              )}
            </section>

            {mode === "Buyer" && (
              <section className="border-t border-border pt-6">
                <SectionTitle>Buyer Criteria</SectionTitle>
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <Field label="Target States"><input className="input" value={form.target_states} onChange={(e) => set("target_states", e.target.value)} /></Field>
                  <Field label="Target Counties / Markets"><input className="input" value={form.target_counties} onChange={(e) => set("target_counties", e.target.value)} placeholder="Polk, Bradley, Chattanooga market..." /></Field>
                  <Field label="Rock / Commodity"><input className="input" value={form.target_commodities} onChange={(e) => set("target_commodities", e.target.value)} placeholder="Limestone, granite, sand & gravel..." /></Field>
                  <Field label="Timing"><BottomSheetSelect value={form.acquisition_timing} onChange={(value) => set("acquisition_timing", value)} options={TIMING} label="Acquisition Timing" /></Field>
                  <Field label="Minimum Acres"><input className="input" inputMode="decimal" value={form.min_acres} onChange={(e) => set("min_acres", e.target.value)} /></Field>
                  <Field label="Maximum Acres"><input className="input" inputMode="decimal" value={form.max_acres} onChange={(e) => set("max_acres", e.target.value)} /></Field>
                  <Field label="Minimum Budget"><input className="input" inputMode="decimal" value={form.min_budget} onChange={(e) => set("min_budget", e.target.value)} placeholder="$" /></Field>
                  <Field label="Maximum Budget"><input className="input" inputMode="decimal" value={form.max_budget} onChange={(e) => set("max_budget", e.target.value)} placeholder="$" /></Field>
                </div>
                <Field label="What are you looking for?"><textarea className="input mt-4 min-h-28" value={form.asset_preferences} onChange={(e) => set("asset_preferences", e.target.value)} placeholder="Operating quarry, undeveloped permitted property, reserve potential, rail access, ready-mix tie-in, royalty interest..." /></Field>
              </section>
            )}

            {mode === "Seller" && (
              <section className="border-t border-border pt-6">
                <SectionTitle>Seller / Property Information</SectionTitle>
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <Field label="Property / Quarry Name"><input className="input" value={form.property_name} onChange={(e) => set("property_name", e.target.value)} required /></Field>
                  <Field label="Asset Type"><BottomSheetSelect value={form.asset_type} onChange={(value) => set("asset_type", value)} options={ASSET_TYPES} label="Asset Type" /></Field>
                  <Field label="State"><input className="input" value={form.state} onChange={(e) => set("state", e.target.value)} required /></Field>
                  <Field label="County"><input className="input" value={form.county} onChange={(e) => set("county", e.target.value)} /></Field>
                  <Field label="Acreage"><input className="input" inputMode="decimal" value={form.acreage} onChange={(e) => set("acreage", e.target.value)} /></Field>
                  <Field label="Asking Price"><input className="input" inputMode="decimal" value={form.asking_price} onChange={(e) => set("asking_price", e.target.value)} placeholder="$" /></Field>
                  <Field label="Rock / Commodity"><input className="input" value={form.commodity} onChange={(e) => set("commodity", e.target.value)} /></Field>
                  <Field label="Timing"><BottomSheetSelect value={form.seller_timing} onChange={(value) => set("seller_timing", value)} options={TIMING} label="Seller Timing" /></Field>
                </div>
                <Field label="Ownership / Mineral Rights / Lease Situation"><textarea className="input mt-4 min-h-28" value={form.ownership_summary} onChange={(e) => set("ownership_summary", e.target.value)} placeholder="Who owns the land, who owns mineral rights, current operator or lease, permit holder, anything S&S should know..." /></Field>
                <label className="mt-4 flex items-start gap-3 rounded-xl border border-border bg-muted/20 p-4 text-sm leading-6"><input type="checkbox" className="mt-1" checked={feeAcknowledged} onChange={(e) => setFeeAcknowledged(e.target.checked)} required /><span>I understand that S&amp;S may charge a separate transaction or success fee, generally targeted at 3–4% of the purchase price or other agreed transaction value, only if stated in a separate written agreement for the specific transaction. This submission by itself does not create that fee obligation.</span></label>
              </section>
            )}

            {mode === "Link My Quarry" && (
              <section className="border-t border-border pt-6">
                <SectionTitle>Relationship to This Quarry</SectionTitle>
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <Field label="Your Relationship"><BottomSheetSelect value={form.relationship_to_site} onChange={(value) => set("relationship_to_site", value)} options={RELATIONSHIPS} label="Relationship" /></Field>
                </div>
                <Field label="What should S&S verify or connect?"><textarea className="input mt-4 min-h-28" value={form.link_notes} onChange={(e) => set("link_notes", e.target.value)} placeholder="Example: I own the land, our company operates this site, the permit changed hands, link this record to my seller profile, correct the operator, add my company contact..." /></Field>
                <p className="mt-3 text-xs leading-5 text-muted-foreground">A link request does not automatically change public quarry data. S&amp;S can review the relationship before updating ownership, operator, permittee, or company connections.</p>
              </section>
            )}

            {error && <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-medium text-red-800">{error}</div>}

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-6">
              <p className="max-w-xl text-xs leading-5 text-muted-foreground">Your lead stays connected to your S&amp;S account and, when selected, the quarry record you chose.</p>
              <button disabled={saving} className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-6 py-3 text-sm font-bold text-white shadow-sm disabled:opacity-50">
                {saving ? "Saving…" : mode === "Buyer" ? "Save Buyer Lead" : mode === "Seller" ? "Submit Seller Lead" : "Submit Link Request"}
              </button>
            </div>
          </form>
        )}
      </main>
    </div>
  );
}

function SectionTitle({ children }) {
  return <h2 className="font-heading text-xl font-bold">{children}</h2>;
}

function Field({ label, children }) {
  return <label className="block"><span className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</span>{children}</label>;
}

function Success({ mode }) {
  const seller = mode === "Seller";
  const linker = mode === "Link My Quarry";
  return (
    <div className="mt-7 rounded-2xl border border-emerald-200 bg-emerald-50 p-8 text-center">
      <CheckCircle2 className="mx-auto h-11 w-11 text-emerald-700" />
      <h2 className="mt-4 font-heading text-2xl font-bold text-slate-950">{seller ? "Seller lead received" : linker ? "Quarry link request received" : "Buyer profile saved"}</h2>
      <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-emerald-950">{seller ? "Your property is now in the S&S seller pipeline." : linker ? "S&S now has the quarry record and your relationship request together for review." : "Your quarry acquisition criteria are saved and ready to match against S&S quarry intelligence."}</p>
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <Link to="/" className="rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-bold text-white">Explore Quarry Data</Link>
        {seller && <Link to="/seller-portal" className="rounded-xl border border-emerald-300 bg-white px-5 py-2.5 text-sm font-bold text-emerald-900">Seller Portal</Link>}
        {!seller && !linker && <Link to="/buyer-profile" className="rounded-xl border border-emerald-300 bg-white px-5 py-2.5 text-sm font-bold text-emerald-900">Buyer Profile</Link>}
      </div>
    </div>
  );
}
