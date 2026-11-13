import React, { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, CheckCircle2, Loader2, Mail, SearchCheck } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { trackFunnelEvent } from "@/lib/funnelTracking";

const INTERESTS = [
  "Quarry or mineral intelligence report",
  "Buying a quarry or mineral property",
  "Selling or leasing quarry / land",
  "Enterprise data or licensing",
  "Other quarry or land question",
];

const INITIAL_FORM = { name: "", email: "", company: "", phone: "", interest: INTERESTS[0], details: "", website: "" };

export default function HomepageLeadForm({ user }) {
  const [form, setForm] = useState(INITIAL_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");

  const change = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }));
    if (error) setError("");
  };

  const submit = async (event) => {
    event.preventDefault();
    if (submitting || submitted) return;
    if (!form.name.trim() || !form.email.trim()) {
      setError("Please enter your name and email address.");
      return;
    }
    // Hidden honeypot for basic automated-form filtering.
    if (form.website.trim()) {
      setSubmitted(true);
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const details = [
        "Inquiry type: " + form.interest,
        form.details.trim() ? "Details: " + form.details.trim() : "Please contact me with more information.",
      ].join("\n");
      const result = await base44.functions.invoke("submit-enterprise-inquiry", {
        name: form.name.trim(),
        email: form.email.trim().toLowerCase(),
        company: form.company.trim(),
        phone: form.phone.trim(),
        interestType: form.interest,
        message: details,
        source: "Homepage Lead Form",
      });
      const data = result?.data || result || {};
      if (data.error || data.success !== true) {
        throw new Error(data.error || "Your request could not be confirmed. Please try again.");
      }
      setSubmitted(true);
      try {
        trackFunnelEvent({ page_type: "lead_capture", resource_id: "homepage_lead_submitted", path: "/", user });
      } catch (trackingError) {
        console.warn("Lead saved; optional analytics unavailable", trackingError);
      }
    } catch (err) {
      setError(err?.message || "Could not send your request. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section id="quarry-inquiry" className="scroll-mt-28 border-b border-slate-200 bg-gradient-to-br from-sky-50 via-white to-slate-100">
      <div className="mx-auto grid max-w-7xl gap-8 px-5 py-10 sm:px-6 lg:grid-cols-[0.9fr_1.1fr] lg:items-center lg:gap-12 lg:py-14">
        <div>
          <span className="inline-flex items-center gap-2 rounded-full border border-sky-200 bg-white px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-sky-800">
            <SearchCheck className="h-4 w-4" /> Free initial inquiry
          </span>
          <h2 className="mt-4 font-heading text-2xl font-black leading-tight text-slate-950 sm:text-3xl">Looking for a quarry, land, or mineral information?</h2>
          <p className="mt-3 max-w-xl text-sm leading-6 text-slate-700 sm:text-base">
            Tell S&amp;S Rock Holdings what you need. Ask about a specific quarry, a property you want to sell, a potential acquisition, or a custom research report.
          </p>
          <p className="mt-3 text-sm font-semibold text-sky-800">No subscription or account required to inquire.</p>
          <p className="mt-5 text-xs leading-5 text-slate-600">Research reports and specialist services may be quoted separately. Sending an inquiry does not place an order.</p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-lg sm:p-7">
          {submitted ? (
            <div role="status" className="py-5 text-center">
              <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-600" />
              <h3 className="mt-4 text-xl font-bold text-slate-950">Your inquiry was received</h3>
              <p className="mt-2 text-sm leading-6 text-slate-700">Thank you. S&amp;S Rock Holdings has your details and can follow up about your request.</p>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-4">
              <div>
                <h3 className="text-lg font-bold text-slate-950">Tell us what you're looking for</h3>
                <p className="mt-1 text-xs text-slate-500">Required fields are marked *.</p>
              </div>
              <div>
                <label htmlFor="lead-interest" className="mb-1 block text-sm font-semibold text-slate-800">What can we help with? *</label>
                <select id="lead-interest" value={form.interest} onChange={(e) => change("interest", e.target.value)} required className="input w-full">
                  {INTERESTS.map((interest) => <option key={interest} value={interest}>{interest}</option>)}
                </select>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label htmlFor="lead-name" className="mb-1 block text-sm font-semibold text-slate-800">Name *</label>
                  <input id="lead-name" type="text" autoComplete="name" maxLength={120} required value={form.name} onChange={(e) => change("name", e.target.value)} className="input w-full" placeholder="Your name" />
                </div>
                <div>
                  <label htmlFor="lead-email" className="mb-1 block text-sm font-semibold text-slate-800">Email *</label>
                  <input id="lead-email" type="email" autoComplete="email" maxLength={254} required value={form.email} onChange={(e) => change("email", e.target.value)} className="input w-full" placeholder="you@company.com" />
                </div>
                <div>
                  <label htmlFor="lead-company" className="mb-1 block text-sm font-semibold text-slate-800">Company <span className="font-normal text-slate-500">(optional)</span></label>
                  <input id="lead-company" autoComplete="organization" maxLength={120} value={form.company} onChange={(e) => change("company", e.target.value)} className="input w-full" placeholder="Company / organization" />
                </div>
                <div>
                  <label htmlFor="lead-phone" className="mb-1 block text-sm font-semibold text-slate-800">Phone <span className="font-normal text-slate-500">(optional)</span></label>
                  <input id="lead-phone" type="tel" autoComplete="tel" maxLength={40} value={form.phone} onChange={(e) => change("phone", e.target.value)} className="input w-full" placeholder="Best callback number" />
                </div>
              </div>
              <div>
                <label htmlFor="lead-details" className="mb-1 block text-sm font-semibold text-slate-800">Which property, county, or question? <span className="font-normal text-slate-500">(optional)</span></label>
                <textarea id="lead-details" maxLength={1500} rows={3} value={form.details} onChange={(e) => change("details", e.target.value)} className="input min-h-24 w-full" placeholder="Example: looking for limestone quarry sites in East Tennessee..." />
              </div>
              <div className="absolute -left-[9999px] h-px w-px overflow-hidden" aria-hidden="true">
                <label htmlFor="lead-website">Leave this field blank</label>
                <input id="lead-website" tabIndex={-1} autoComplete="off" value={form.website} onChange={(e) => change("website", e.target.value)} />
              </div>
              {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
              <button type="submit" disabled={submitting} className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-sky-700 px-5 py-3 text-sm font-bold text-white shadow-sm hover:bg-sky-800 disabled:opacity-60">
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
                {submitting ? "Sending inquiry..." : "Request Information"}
                {!submitting && <ArrowRight className="h-4 w-4" />}
              </button>
              <p className="text-xs leading-5 text-slate-600">By submitting, you agree S&amp;S Rock Holdings may contact you about this inquiry. No marketing subscription is required. <Link to="/privacy" className="font-semibold text-sky-800 underline">Privacy Policy</Link></p>
            </form>
          )}
        </div>
      </div>
    </section>
  );
}
