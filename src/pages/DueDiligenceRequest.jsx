import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { ArrowLeft, FileSearch, CheckCircle2, Clock, Shield } from "lucide-react";
import BottomSheetSelect from "@/components/BottomSheetSelect";

const STATES = ["TN", "GA", "AL", "KY", "NC", "SC", "FL", "MS", "VA", "WV", "Other"];
const DELIVERABLES = [
  "Ownership & title summary",
  "Permit status review",
  "Geology & rock type report",
  "Market demand analysis",
  "Valuation screening",
  "Full due-diligence package",
  "Not sure yet — please advise",
];
const TIME_FRAMES = ["Immediately", "1–2 weeks", "3–4 weeks", "1–2 months", "3+ months", "Flexible"];

const STORAGE_KEY = "ss_due_diligence_draft";

export default function DueDiligenceRequest() {
  const { user } = useAuth();
  const [form, setForm] = useState({
    property_name: "",
    state: "TN",
    county: "",
    research_objective: "",
    deliverable: "Full due-diligence package",
    time_frame: "1–2 weeks",
    target_states: "",
    target_counties: "",
    target_commodities: "",
    name: "",
    email: "",
    phone: "",
    company: "",
  });
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  // Restore draft from sessionStorage (preserves entry through account creation)
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

  // Save draft to sessionStorage on every change
  useEffect(() => {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(form));
    } catch { /* ignore */ }
  }, [form]);

  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }));

  const submit = async (e) => {
    e.preventDefault();
    if (!form.name.trim() || !form.email.trim()) {
      setError("Please provide your name and email so we can follow up.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const response = await base44.functions.invoke("submit-due-diligence-request", {
        ...form,
        name: form.name.trim(),
        email: form.email.trim(),
      });
      const payload = response?.data || response || {};
      if (payload?.error) throw new Error(payload.error);
      setDone(true);
      try { sessionStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
      if (typeof window !== "undefined" && window.gtag) {
        window.gtag("event", "conversion", { send_to: "AW-18504553803/XWMZCIb8yZcdEMuq1PdE" });
      }
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
            <p className="mt-2 text-sm text-emerald-900 dark:text-emerald-200">
              Thank you, {form.name.split(" ")[0]}. An S&amp;S Rock Holdings analyst will review your request and contact you at {form.email} within <strong>2 business days</strong>.
            </p>
            <div className="mx-auto mt-6 max-w-md rounded-2xl border border-slate-300 bg-white p-5 text-left dark:border-border dark:bg-card">
              <h3 className="text-sm font-bold text-foreground">What happens next</h3>
              <ol className="mt-3 space-y-2 text-xs text-muted-foreground">
                <li className="flex gap-2"><span className="font-bold text-slate-900">1.</span> An S&amp;S analyst reviews your target and research objective.</li>
                <li className="flex gap-2"><span className="font-bold text-slate-900">2.</span> We contact you to confirm scope, timeline, and any fees.</li>
                <li className="flex gap-2"><span className="font-bold text-slate-900">3.</span> Research begins once scope is agreed. Typical turnaround: 5–10 business days.</li>
              </ol>
            </div>
            {!user?.id && (
              <div className="mx-auto mt-5 max-w-md">
                <p className="text-sm font-bold text-foreground">Want to track your request?</p>
                <p className="mt-1 text-xs text-muted-foreground">Create a free account to see request status and sync across devices.</p>
                <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                  <Link to={`/register?returnTo=${encodeURIComponent("/")}`} className="inline-flex min-h-11 flex-1 items-center justify-center rounded-xl bg-sky-700 px-4 text-xs font-bold text-white hover:bg-sky-800">Create Free Account</Link>
                  <Link to="/" className="inline-flex min-h-11 flex-1 items-center justify-center rounded-xl border border-slate-300 bg-white px-4 text-xs font-bold text-slate-900 hover:bg-slate-50 dark:border-border dark:bg-card dark:text-foreground dark:hover:bg-muted">Back to Marketplace</Link>
                </div>
              </div>
            )}
            {user?.id && <Link to="/" className="mt-5 inline-flex items-center gap-2 rounded-xl bg-stone-900 px-5 py-2.5 text-sm font-semibold text-white">Back to Marketplace</Link>}
          </div>
        ) : (
          <>
            <div className="mb-8 text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-900 text-white"><FileSearch className="h-7 w-7" /></div>
              <p className="mt-6 text-xs font-bold uppercase tracking-[0.2em] text-sky-700">Due Diligence & Research</p>
              <h1 className="mt-2 font-heading text-3xl font-bold text-foreground">Request Property Research</h1>
              <p className="mx-auto mt-4 max-w-2xl text-sm leading-6 text-muted-foreground">
                Tell us what you need to investigate. No account required — we'll review your request and contact you within 2 business days.
              </p>
            </div>

            {/* What happens after submission */}
            <div className="mb-6 grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl border border-border bg-card p-4">
                <Clock className="h-5 w-5 text-sky-700" />
                <p className="mt-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">Review Time</p>
                <p className="mt-1 text-sm text-foreground">2 business days for initial response</p>
              </div>
              <div className="rounded-xl border border-border bg-card p-4">
                <Shield className="h-5 w-5 text-sky-700" />
                <p className="mt-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">Confidential</p>
                <p className="mt-1 text-sm text-foreground">Your request is reviewed by S&amp;S only</p>
              </div>
              <div className="rounded-xl border border-border bg-card p-4">
                <FileSearch className="h-5 w-5 text-sky-700" />
                <p className="mt-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">Fees</p>
                <p className="mt-1 text-sm text-foreground">Scope and pricing confirmed before work begins</p>
              </div>
            </div>

            <form onSubmit={submit} className="space-y-5 rounded-2xl border border-border bg-card p-6">
              <div>
                <h2 className="font-heading text-lg font-bold text-foreground">Property or Quarry</h2>
                <p className="mt-1 text-xs text-muted-foreground">Tell us what you want researched. You can name a specific quarry or describe a market.</p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Property or Quarry Name">
                  <input className="input" value={form.property_name} onChange={(e) => set("property_name", e.target.value)} placeholder="e.g. Smithville Quarry, or describe a target area" />
                </Field>
                <Field label="State">
                  <BottomSheetSelect value={form.state} onChange={(v) => set("state", v)} options={STATES} label="State" />
                </Field>
                <Field label="County / Area">
                  <input className="input" value={form.county} onChange={(e) => set("county", e.target.value)} placeholder="e.g. Warren County, Chattanooga area" />
                </Field>
                <Field label="Target States (if market-wide)">
                  <input className="input" value={form.target_states} onChange={(e) => set("target_states", e.target.value)} placeholder="TN, GA, AL..." />
                </Field>
              </div>

              <div className="border-t border-border pt-5">
                <h2 className="font-heading text-lg font-bold text-foreground">Research Objective</h2>
                <p className="mt-1 text-xs text-muted-foreground">What questions do you need answered?</p>
              </div>
              <Field label="What should S&S investigate?">
                <textarea className="input min-h-28" value={form.research_objective} onChange={(e) => set("research_objective", e.target.value)} placeholder="Example: Confirm current ownership and permit status, assess market demand within 30 miles, evaluate reserve potential, identify possible sellers..." />
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Desired Deliverable">
                  <BottomSheetSelect value={form.deliverable} onChange={(v) => set("deliverable", v)} options={DELIVERABLES} label="Deliverable" />
                </Field>
                <Field label="Time Frame">
                  <BottomSheetSelect value={form.time_frame} onChange={(v) => set("time_frame", v)} options={TIME_FRAMES} label="Time Frame" />
                </Field>
              </div>

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

              {error && <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200">{error}</div>}

              <div className="border-t border-border pt-4">
                <button type="submit" disabled={saving || !form.name.trim() || !form.email.trim()} className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-5 py-3 font-bold text-white disabled:opacity-50 sm:w-auto">
                  <FileSearch className="h-4 w-4" />
                  {saving ? "Submitting…" : "Submit Research Request"}
                </button>
                <p className="mt-3 text-xs text-muted-foreground">No account required. Your information is confidential and reviewed by S&amp;S only. We'll respond within 2 business days.</p>
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