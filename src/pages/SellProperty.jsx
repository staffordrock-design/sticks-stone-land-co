import React, { useState } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { ArrowLeft, Building2, CheckCircle2 } from "lucide-react";

const ASSET_TYPES = ["Operating Quarry","Potential Quarry Land","Aggregate Operation","Mineral Rights","Royalty Interest","Other"];

export default function SellProperty() {
  const { user } = useAuth();
  const [form, setForm] = useState({ property_name:"", state:"TN", county:"", acreage:"", asset_type:"Operating Quarry", asking_price:"", commodity:"", company:"", ownership_summary:"", description:"", confidential_notes:"" });
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const [feeAcknowledged, setFeeAcknowledged] = useState(false);

  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }));
  const submit = async (e) => {
    e.preventDefault();
    if (!user?.id || !feeAcknowledged) return;
    setSaving(true);
    try {
      await base44.entities.SellerSubmission.create({
        user_id:user.id,
        seller_name:user.name || "",
        seller_email:user.email || "",
        company:form.company,
        property_name:form.property_name,
        state:form.state,
        county:form.county,
        acreage:form.acreage ? Number(form.acreage) : null,
        asset_type:form.asset_type,
        asking_price:form.asking_price ? Number(form.asking_price) : null,
        commodity:form.commodity,
        ownership_summary:form.ownership_summary,
        description:form.description,
        confidential_notes:form.confidential_notes,
        status:"Submitted",
        submitted_at:new Date().toISOString(),
      });
      setDone(true);
    } finally { setSaving(false); }
  };

  if (!user?.id) return <div className="min-h-screen p-10 text-center text-muted-foreground">Sign in to submit a property.</div>;

  return <div className="min-h-screen bg-background">
    <header className="border-b border-border"><div className="mx-auto max-w-4xl px-6 py-4"><Link to="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground"><ArrowLeft className="h-4 w-4"/>Back</Link></div></header>
    <main className="mx-auto max-w-4xl px-6 py-10">
      <div className="mb-8"><p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">For Sellers</p><h1 className="mt-2 font-heading text-3xl font-bold">List or Market Your Property</h1><p className="mt-3 max-w-2xl text-sm text-muted-foreground">Submit a quarry, aggregate operation, mineral interest, royalty interest, or quarry-capable property for S&S review and marketing.</p></div>
      {done ? <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-8 text-center"><CheckCircle2 className="mx-auto h-10 w-10 text-emerald-700"/><h2 className="mt-4 font-heading text-2xl font-bold">Submission received</h2><p className="mt-2 text-sm text-emerald-900">It is now in the S&S seller review pipeline.</p></div> :
      <form onSubmit={submit} className="space-y-6 rounded-2xl border border-border bg-card p-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Property / Asset Name"><input className="input" value={form.property_name} onChange={e=>set("property_name",e.target.value)} required /></Field>
          <Field label="Company"><input className="input" value={form.company} onChange={e=>set("company",e.target.value)} /></Field>
          <Field label="State"><input className="input" value={form.state} onChange={e=>set("state",e.target.value)} required /></Field>
          <Field label="County"><input className="input" value={form.county} onChange={e=>set("county",e.target.value)} /></Field>
          <Field label="Acreage"><input className="input" inputMode="decimal" value={form.acreage} onChange={e=>set("acreage",e.target.value)} /></Field>
          <Field label="Asking Price"><input className="input" inputMode="decimal" value={form.asking_price} onChange={e=>set("asking_price",e.target.value)} /></Field>
          <Field label="Asset Type"><select className="input" value={form.asset_type} onChange={e=>set("asset_type",e.target.value)}>{ASSET_TYPES.map(x=><option key={x}>{x}</option>)}</select></Field>
          <Field label="Commodity / Rock"><input className="input" value={form.commodity} onChange={e=>set("commodity",e.target.value)} placeholder="Limestone, sand & gravel, chert..." /></Field>
        </div>
        <Field label="Ownership / Mineral Rights Summary"><textarea className="input min-h-24" value={form.ownership_summary} onChange={e=>set("ownership_summary",e.target.value)} /></Field>
        <Field label="Public Description"><textarea className="input min-h-28" value={form.description} onChange={e=>set("description",e.target.value)} /></Field>
        <Field label="Confidential Notes for S&S"><textarea className="input min-h-28" value={form.confidential_notes} onChange={e=>set("confidential_notes",e.target.value)} placeholder="Production, equipment, lease, reserve study, seller timing, etc." /></Field>
        <label className="flex items-start gap-3 rounded-xl border border-border bg-muted/20 p-4 text-sm leading-6"><input type="checkbox" className="mt-1" checked={feeAcknowledged} onChange={e=>setFeeAcknowledged(e.target.checked)} required/><span>I understand that S&S may charge a separate transaction or success fee, generally targeted at 3–4% of the purchase price or other agreed transaction value, only if stated in a separate written agreement for the specific transaction. This submission by itself does not create that fee obligation.</span></label>
        <button disabled={saving || !feeAcknowledged} className="inline-flex items-center gap-2 rounded-xl bg-stone-900 px-5 py-3 font-semibold text-white disabled:opacity-50"><Building2 className="h-4 w-4"/>{saving?"Submitting…":"Submit to S&S"}</button>
      </form>}
    </main>
  </div>;
}

function Field({label,children}){return <label className="block"><span className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</span>{children}</label>}
