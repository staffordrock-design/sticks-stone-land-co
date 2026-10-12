import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { ArrowLeft, Building2, CheckCircle2, LockKeyhole, Shield, Clock, FileText, Upload } from "lucide-react";
import BottomSheetSelect from "@/components/BottomSheetSelect";

const PROPERTY_TYPES = ["Operating Quarry", "Potential Quarry Land", "Aggregate Operation", "Mineral Rights", "Royalty Interest", "Other"];
const CONSIDERATIONS = ["Selling", "Leasing", "Finding an operator", "Understanding the property's potential/value", "Exploring quarry potential", "Not sure yet"];
const STATES = ["TN", "GA", "AL", "KY", "NC", "SC", "FL", "MS", "VA", "WV", "Other"];
const CONFIDENTIALITY = ["Confidential — do not publish", "S&S may list after review", "Public listing OK after review"];
const STORAGE_KEY = "ss_seller_draft";

export default function SellProperty() {
  const { user } = useAuth();
  const [form, setForm] = useState({
    name: "", email: "", phone: "", company: "",
    state: "TN", county: "", city: "", address: "",
    acreage: "", property_type: "Operating Quarry",
    commodity: "", consideration: "Selling",
    existing_permits: "", ownership_status: "",
    confidentiality: "Confidential — do not publish",
  });
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  // Restore draft from sessionStorage
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        setForm((f) => ({ ...f, ...parsed }));
      }
    } catch { /* ignore */ }
  }, []);

  // Pre-fill name/email if signed in
  useEffect(() => {
    if (user) {
      setForm((f) => ({
        ...f,
        name: f.name || user.name || "",
        email: f.email || user.email || "",
      }));
    }
  }, [user]);

  // Save draft on every change
  useEffect(() => {
    try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(form)); } catch { /* ignore */ }
  }, [form]);

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
        company: form.company.trim(),
        state: form.state,
        county: form.county.trim(),
        city: form.city.trim(),
        acreage: form.acreage ? Number(form.acreage) : null,
        property_type: form.property_type,
        commodity: form.commodity.trim(),
        consideration: form.consideration,
        existing_permits: form.existing_permits.trim(),
        ownership_status: form.ownership_status.trim(),
        confidentiality: form.confidentiality,
      });
      const payload = response?.data || response || {};
      if (payload?.error) throw new Error(payload.error);
      setDone(true);
      try { sessionStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
      window.scrollTo({ top: 0, behavior: "smooth" });
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
          <Link to="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground"><ArrowLeft className="h-4 w-4" />Back to marketplace</Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-10">
        {done ? (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-8 text-center dark:border-emerald-900/50 dark:bg-emerald-950/40">
            <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-700 dark:text-emerald-400" />
            <h2 className="mt-4 font-heading text-2xl font-bold text-emerald-950 dark:text-emerald-100">Request received</h2>
            <p className="mt-2 text-sm text-emerald-900 dark:text-emerald-200">Thank you, {form.name.split(" ")[0]}. An S&amp;S Rock Holdings representative will review your property and contact you at {form.email} within 2 business days.</p>
            <div className="mx-auto mt-6 max-w-md rounded-2xl border border-slate-300 bg-white p-5 text-left dark:border-border dark:bg-card">
              <h3 className="text-sm font-bold text-foreground">What happens next</h3>
              <ol className="mt-3 space-y-2 text-xs text-muted-foreground">
                <li className="flex gap-2"><span className="font-bold text-slate-900">1.</span> An S&amp;S analyst reviews your property and ownership summary.</li>
                <li className="flex gap-2"><span className="font-bold text-slate-900">2.</span> We contact you to discuss listing, valuation, or next steps.</li>
                <li className="flex gap-2"><span className="font-bold text-slate-900">3.</span> If listed, S&amp;S charges a transaction fee (typically 3–4%) only on a completed sale, per a separate written agreement.</li>
              </ol>
              <p className="mt-3 text-xs text-muted-foreground">Your submission is <strong>confidential</strong> and is not automatically published.</p>
            </div>
            {!user?.id && (
              <div className="mx-auto mt-5 max-w-md">
                <p className="text-sm font-bold text-foreground">Want to track your review status?</p>
                <p className="mt-1 text-xs text-muted-foreground">Create a free account to see your submission status, save properties, and sync across devices. Your form data is preserved.</p>
                <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                  <Link to={`/register?returnTo=${encodeURIComponent("/seller-portal")}`} className="inline-flex min-h-11 flex-1 items-center justify-center rounded-xl bg-sky-700 px-4 text-xs font-bold text-white hover:bg-sky-800">Create Free Account</Link>
                  <Link to="/" className="inline-flex min-h-11 flex-1 items-center justify-center rounded-xl border border-slate-300 bg-white px-4 text-xs font-bold text-slate-900 hover:bg-slate-50 dark:border-border dark:bg-card dark:text-foreground dark:hover:bg-muted">Back to Marketplace</Link>
                </div>
              </div>
            )}
            {user?.id && <Link to="/seller-portal" className="mt-5 inline-flex items-center gap-2 rounded-xl bg-stone-900 px-5 py-2.5 text-sm font-semibold text-white">Track in seller portal</Link>}
          </div>
        ) : (
          <>
            <div className="mb-8 text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-900 text-white"><Building2 className="h-7 w-7" /></div>
              <p className="mt-6 text-xs font-bold uppercase tracking-[0.2em] text-sky-700">For Property Owners</p>
              <h1 className="mt-2 font-heading text-3xl font-bold text-foreground">List Your Quarry or Property</h1>
              <p className="mx-auto mt-4 max-w-2xl text-sm leading-6 text-muted-foreground">Submit your property for a confidential S&amp;S review. No account needed — just fill out the form below and we'll contact you.</p>
            </div>

            {/* Process explanation */}
            <div className="mb-6 grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl border border-border bg-card p-4">
                <Shield className="h-5 w-5 text-sky-700" />
                <p className="mt-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">Confidentiality</p>
                <p className="mt-1 text-sm text-foreground">Your submission is private. Nothing is published without your approval.</p>
              </div>
              <div className="rounded-xl border border-border bg-card p-4">
                <Clock className="h-5 w-5 text-sky-700" />
                <p className="mt-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">Review Time</p>
                <p className="mt-1 text-sm text-foreground">We respond within 2 business days of submission.</p>
              </div>
              <div className="rounded-xl border border-border bg-card p-4">
                <FileText className="h-5 w-5 text-sky-700" />
                <p className="mt-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">Fees</p>
                <p className="mt-1 text-sm text-foreground">No upfront cost. Transaction fee (3–4%) only on completed sale.</p>
              </div>
            </div>

            <div className="mb-6 flex items-center gap-2 rounded-xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-950 dark:border-sky-900/50 dark:bg-sky-950/40 dark:text-sky-100">
              <LockKeyhole className="h-4 w-4 shrink-0 text-sky-700" />
              <span><strong>Confidential.</strong> Your information is reviewed by S&amp;S and is not published automatically. You choose whether to list after review.</span>
            </div>

            <form onSubmit={submit} className="space-y-5 rounded-2xl border border-border bg-card p-6">
              {/* Property Location */}
              <div>
                <h2 className="font-heading text-lg font-bold text-foreground">Property Location</h2>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="State">
                  <BottomSheetSelect value={form.state} onChange={(v) => set("state", v)} options={STATES} label="State" />
                </Field>
                <Field label="County">
                  <input className="input" value={form.county} onChange={(e) => set("county", e.target.value)} placeholder="e.g. Warren" />
                </Field>
                <Field label="City / Area (optional)">
                  <input className="input" value={form.city} onChange={(e) => set("city", e.target.value)} placeholder="e.g. McMinnville" />
                </Field>
                <Field label="Street Address (optional)">
                  <input className="input" value={form.address} onChange={(e) => set("address", e.target.value)} placeholder="Street or road name" />
                </Field>
              </div>

              {/* Property Details */}
              <div className="border-t border-border pt-5">
                <h2 className="font-heading text-lg font-bold text-foreground">Property Details</h2>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Property Type">
                  <BottomSheetSelect value={form.property_type} onChange={(v) => set("property_type", v)} options={PROPERTY_TYPES} label="Property Type" />
                </Field>
                <Field label="Approximate Acreage">
                  <input className="input" inputMode="decimal" value={form.acreage} onChange={(e) => set("acreage", e.target.value)} placeholder="e.g. 120" />
                </Field>
                <Field label="Rock / Mineral Type">
                  <input className="input" value={form.commodity} onChange={(e) => set("commodity", e.target.value)} placeholder="Limestone, sand & gravel, granite, chert..." />
                </Field>
                <Field label="What are you considering?">
                  <BottomSheetSelect value={form.consideration} onChange={(v) => set("consideration", v)} options={CONSIDERATIONS} label="What are you considering?" />
                </Field>
              </div>
              <Field label="Existing Permits (if any)">
                <textarea className="input min-h-20" value={form.existing_permits} onChange={(e) => set("existing_permits", e.target.value)} placeholder="MSHA ID, TDEC/surface mining permit, NPDES permit, county zoning, or 'None known'" />
              </Field>
              <Field label="Ownership Status">
                <textarea className="input min-h-20" value={form.ownership_status} onChange={(e) => set("ownership_status", e.target.value)} placeholder="Who owns the land? Who owns mineral rights? Current operator or lease? Any liens or encumbrances?" />
              </Field>
              <Field label="Confidentiality Preference">
                <BottomSheetSelect value={form.confidentiality} onChange={(v) => set("confidentiality", v)} options={CONFIDENTIALITY} label="Confidentiality" />
              </Field>

              {/* Contact Information */}
              <div className="border-t border-border pt-5">
                <h2 className="font-heading text-lg font-bold text-foreground">Contact Information</h2>
              </div>
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
                <Field label="Company (optional)">
                  <input className="input" value={form.company} onChange={(e) => set("company", e.target.value)} placeholder="Company or organization" />
                </Field>
              </div>

              {/* Document upload note */}
              <div className="rounded-xl border border-dashed border-border bg-muted/20 p-4">
                <div className="flex items-center gap-2 text-sm font-bold text-foreground">
                  <Upload className="h-4 w-4" /> Document Uploads
                </div>
                <p className="mt-1 text-xs text-muted-foreground">After S&amp;S contacts you, you can securely share deeds, permits, core logs, environmental reports, or other documents. No upload is required to submit this form.</p>
              </div>

              {error && <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200">{error}</div>}

              <div className="border-t border-border pt-4">
                <button type="submit" disabled={saving || !form.name.trim() || !form.email.trim()} className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-5 py-3 font-bold text-white disabled:opacity-50 sm:w-auto">
                  <Building2 className="h-4 w-4" />
                  {saving ? "Submitting…" : "Request Confidential Property Review"}
                </button>
                <p className="mt-3 text-xs text-muted-foreground">No account required. S&amp;S Rock Holdings will contact you within 2 business days. Your information is saved as you type — it will be here if you create an account.</p>
              </div>
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