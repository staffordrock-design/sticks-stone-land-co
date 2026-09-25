import React, { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { ArrowLeft, Building2, CheckCircle2, LockKeyhole } from "lucide-react";
import BottomSheetSelect from "@/components/BottomSheetSelect";

const PROPERTY_TYPES = ["Operating Quarry", "Potential Quarry Land", "Aggregate Operation", "Mineral Rights", "Royalty Interest", "Other"];
const CONSIDERATIONS = ["Selling", "Leasing", "Finding an operator", "Understanding the property's potential/value", "Exploring quarry potential", "Not sure yet"];
const STATES = ["TN", "GA", "AL", "KY", "NC", "SC", "FL", "MS", "VA", "WV", "Other"];

export default function SellProperty() {
  const { user } = useAuth();
  const location = useLocation();
  const fromTab = location.state?.fromTab;
  const [form, setForm] = useState({ name: "", email: "", phone: "", state: "TN", county: "", acreage: "", property_type: "Operating Quarry", commodity: "", consideration: "Selling" });
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }));

  const submit = async (e) => {
    e.preventDefault();
    if (!form.name.trim() || !form.email.trim()) return;
    setSaving(true);
    setError("");
    try {
      const response = await base44.functions.invoke("submit-seller-lead", {
        name: form.name.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
        state: form.state,
        county: form.county.trim(),
        acreage: form.acreage ? Number(form.acreage) : null,
        property_type: form.property_type,
        commodity: form.commodity.trim(),
        consideration: form.consideration,
      });
      const payload = response?.data || response || {};
      if (payload?.error) throw new Error(payload.error);
      setDone(true);
    } catch (err) {
      setError(err?.message || "Could not submit. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border" style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}>
        <div className="mx-auto max-w-4xl px-6 py-4">
          {!fromTab && <Link to="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground"><ArrowLeft className="h-4 w-4" />Back to marketplace</Link>}
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-10">
        <div className="mb-8 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-900 text-white"><Building2 className="h-7 w-7" /></div>
          <p className="mt-6 text-xs font-bold uppercase tracking-[0.2em] text-sky-700">For Property Owners</p>
          <h1 className="mt-2 font-heading text-3xl font-bold text-foreground">List Your Quarry or Property</h1>
          <p className="mx-auto mt-4 max-w-2xl text-sm leading-6 text-muted-foreground">Submit your property for a confidential S&amp;S review. No account needed — just fill out the form below and we'll contact you.</p>
        </div>

        {done ? (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-8 text-center dark:border-emerald-900/50 dark:bg-emerald-950/40">
            <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-700 dark:text-emerald-400" />
            <h2 className="mt-4 font-heading text-2xl font-bold text-emerald-950 dark:text-emerald-100">Request received</h2>
            <p className="mt-2 text-sm text-emerald-900 dark:text-emerald-200">Thank you, {form.name.split(" ")[0]}. An S&amp;S Rock Holdings representative will review your property and contact you at {form.email} within 2 business days.</p>
            <p className="mt-3 text-xs text-emerald-800 dark:text-emerald-300">Your information is confidential and is not automatically published.</p>
            {!user?.id && (
              <div className="mx-auto mt-6 max-w-md rounded-2xl border border-slate-300 bg-white p-5 text-left dark:border-border dark:bg-card">
                <p className="text-sm font-bold text-foreground">Want to track your review status?</p>
                <p className="mt-1 text-xs text-muted-foreground">Create a free account to see your submission status, save properties, and sync across devices.</p>
                <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                  <Link to={`/register?returnTo=${encodeURIComponent("/seller-portal")}`} className="inline-flex min-h-11 flex-1 items-center justify-center rounded-xl bg-sky-700 px-4 text-xs font-bold text-white hover:bg-sky-800">Create Free Account</Link>
                  <Link to="/" className="inline-flex min-h-11 flex-1 items-center justify-center rounded-xl border border-slate-300 bg-white px-4 text-xs font-bold text-slate-900 hover:bg-slate-50 dark:border-border dark:bg-card dark:text-foreground dark:hover:bg-muted">Back to Marketplace</Link>
                </div>
              </div>
            )}
            {user?.id && <Link to="/seller-portal" className="mt-5 inline-flex items-center gap-2 rounded-xl bg-stone-900 px-5 py-2.5 text-sm font-semibold text-white">Track in seller portal</Link>}
          </div>
        ) : (
          <>
            <div className="mb-6 flex items-center gap-2 rounded-xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-950 dark:border-sky-900/50 dark:bg-sky-950/40 dark:text-sky-100">
              <LockKeyhole className="h-4 w-4 shrink-0 text-sky-700" />
              <span><strong>Confidential.</strong> Your information is reviewed by S&amp;S and is not published automatically.</span>
            </div>
            <form onSubmit={submit} className="space-y-5 rounded-2xl border border-border bg-card p-6">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Your Name" required>
                  <input className="input" value={form.name} onChange={(e) => set("name", e.target.value)} required placeholder="First and last name" />
                </Field>
                <Field label="Email" required>
                  <input className="input" type="email" value={form.email} onChange={(e) => set("email", e.target.value)} required placeholder="you@example.com" />
                </Field>
                <Field label="Phone (optional)">
                  <input className="input" type="tel" value={form.phone} onChange={(e) => set("phone", e.target.value)} placeholder="555-555-5555" />
                </Field>
                <Field label="State">
                  <BottomSheetSelect value={form.state} onChange={(v) => set("state", v)} options={STATES} label="State" />
                </Field>
                <Field label="County">
                  <input className="input" value={form.county} onChange={(e) => set("county", e.target.value)} placeholder="e.g. Warren" />
                </Field>
                <Field label="Approximate Acreage">
                  <input className="input" inputMode="decimal" value={form.acreage} onChange={(e) => set("acreage", e.target.value)} placeholder="e.g. 120" />
                </Field>
                <Field label="Property Type">
                  <BottomSheetSelect value={form.property_type} onChange={(v) => set("property_type", v)} options={PROPERTY_TYPES} label="Property Type" />
                </Field>
                <Field label="What are you considering?">
                  <BottomSheetSelect value={form.consideration} onChange={(v) => set("consideration", v)} options={CONSIDERATIONS} label="What are you considering?" />
                </Field>
              </div>
              <Field label="Quarry / Mineral Information (if known)">
                <textarea className="input min-h-24" value={form.commodity} onChange={(e) => set("commodity", e.target.value)} placeholder="Limestone, sand & gravel, chert, granite, etc. Include any known details about the operation." />
              </Field>
              {error && <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200">{error}</div>}
              <button type="submit" disabled={saving || !form.name.trim() || !form.email.trim()} className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-5 py-3 font-bold text-white disabled:opacity-50 sm:w-auto">
                <Building2 className="h-4 w-4" />
                {saving ? "Submitting…" : "Request Confidential Property Review"}
              </button>
              <p className="text-xs text-muted-foreground">No account required. S&amp;S Rock Holdings will contact you directly after review.</p>
            </form>
          </>
        )}
      </main>
    </div>
  );
}

function Field({ label, children, required }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}{required && <span className="text-red-500"> *</span>}</span>
      {children}
    </label>
  );
}