import React, { useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight, Building2, CheckCircle2, FileSearch, FileText, Gem,
  Handshake, Layers, LineChart, Loader2, MapPin, Truck, Users,
} from "lucide-react";
import { base44 } from "@/api/base44Client";

const INTELLIGENCE_ITEMS = [
  { icon: MapPin, title: "County and state parcel searches" },
  { icon: Layers, title: "USGS mineral and geological records" },
  { icon: Gem, title: "Potential limestone, granite, sandstone, and other mineral resources" },
  { icon: FileText, title: "Landowner and deed information — where verified and legally usable" },
  { icon: Truck, title: "Nearby operating quarries and transportation routes" },
  { icon: FileSearch, title: "Research reports available for purchase" },
];

const WHO_ITEMS = [
  { icon: Building2, title: "Aggregates producers planning expansion or acquisitions" },
  { icon: LineChart, title: "Investors and private equity evaluating quarry assets" },
  { icon: Handshake, title: "M&A advisors valuing and marketing quarry operations" },
  { icon: Users, title: "Engineering and construction consultants serving the industry" },
];

export default function Enterprise() {
  const [form, setForm] = useState({ name: "", company: "", email: "", message: "" });
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");
  // Only the Quarry Site Workup CTA changes this, so the SalesLead records which
  // offer the inquiry came from. General inquiries keep the enterprise-page source.
  const [inquirySource, setInquirySource] = useState("Enterprise Page");

  const handleChange = (e) => setForm((f) => ({ ...f, [e.target.name]: e.target.value }));

  const handleWorkupOrder = () => setInquirySource("Enterprise Page — Workup");

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim() || !form.email.trim() || !form.message.trim()) {
      setError("Please fill in your name, email, and what you're looking for.");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const res = await base44.functions.invoke("submit-enterprise-inquiry", {
        name: form.name.trim(),
        company: form.company.trim(),
        email: form.email.trim(),
        message: form.message.trim(),
        source: inquirySource,
      });
      const payload = res?.data || res || {};
      if (payload?.error) throw new Error(payload.error);
      setSubmitted(true);
    } catch (err) {
      setError(err?.message || "Could not submit. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* HERO */}
      <section className="border-b border-border bg-gradient-to-b from-sky-50/60 to-background">
        <div className="mx-auto max-w-5xl px-6 py-16 text-center sm:py-20">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-sky-700">For Companies</p>
          <h1 className="mt-3 font-heading text-3xl font-black leading-tight tracking-tight text-foreground sm:text-4xl lg:text-5xl">
            Southeast Quarry Intelligence, Built by People Who Know Quarries
          </h1>
          <p className="mx-auto mt-5 max-w-3xl text-base font-medium leading-7 text-muted-foreground sm:text-lg">
            22,506 mining sites. 18,394 mineral occurrences. Permits, ownership, and parcel records across eight states — verified by a team raised in the aggregates business.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <a href="#contact" className="inline-flex min-h-12 items-center gap-2 rounded-xl bg-sky-700 px-6 py-3 text-sm font-bold text-white shadow-sm hover:bg-sky-800">Talk to us <ArrowRight className="h-4 w-4" /></a>
            <Link to="/subscribe" className="inline-flex min-h-12 items-center rounded-xl border border-border bg-card px-6 py-3 text-sm font-bold text-foreground hover:bg-muted">View Professional plan — $39/mo</Link>
          </div>
        </div>
      </section>

      {/* THE INTELLIGENCE SECTION */}
      <section className="mx-auto max-w-7xl px-6 py-14">
        <h2 className="font-heading text-2xl font-bold text-foreground sm:text-3xl">The Intelligence</h2>
        <p className="mt-2 max-w-3xl text-sm text-muted-foreground">Everything S&amp;S Rock Holdings organizes, in one platform.</p>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {INTELLIGENCE_ITEMS.map((it) => {
            const Icon = it.icon;
            return (
              <div key={it.title} className="rounded-2xl border border-border bg-card p-6">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-900 text-white">
                  <Icon className="h-5 w-5" />
                </div>
                <p className="mt-4 text-sm font-semibold leading-6 text-foreground">{it.title}</p>
              </div>
            );
          })}
        </div>
      </section>

      {/* WHO IT'S FOR */}
      <section className="border-y border-border bg-muted/30">
        <div className="mx-auto max-w-7xl px-6 py-14">
          <h2 className="font-heading text-2xl font-bold text-foreground sm:text-3xl">Who It's For</h2>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {WHO_ITEMS.map((it) => {
              const Icon = it.icon;
              return (
                <div key={it.title} className="rounded-2xl border border-border bg-card p-6">
                  <Icon className="h-6 w-6 text-sky-700" />
                  <p className="mt-3 text-sm font-semibold leading-6 text-foreground">{it.title}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* QUARRY SITE WORKUP — single-site research offer */}
      <section className="mx-auto max-w-7xl px-6 py-14">
        <div className="overflow-hidden rounded-3xl border border-slate-700 bg-slate-950 p-8 text-white sm:p-10">
          <div className="grid gap-8 lg:grid-cols-[minmax(0,1.5fr)_minmax(280px,1fr)]">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-sky-300">Site-level research</p>
              <h2 className="mt-2 font-heading text-2xl font-black sm:text-3xl">Quarry Site Workup</h2>
              <p className="mt-3 text-sm font-semibold leading-6 text-slate-200">One site, fully worked up.</p>
              <ul className="mt-5 space-y-2.5 text-sm leading-6 text-slate-200">
                <li className="flex gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-sky-300" />Current ownership and chain of title from courthouse records</li>
                <li className="flex gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-sky-300" />Permits and regulatory status</li>
                <li className="flex gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-sky-300" />Geology and mineral potential (limestone, granite, sandstone and other resources)</li>
                <li className="flex gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-sky-300" />Nearby operating quarries and transportation routes</li>
              </ul>
              <p className="mt-5 text-sm leading-6 text-slate-300">Delivered as a written research report.</p>
            </div>
            <div className="flex flex-col justify-center gap-4 rounded-2xl border border-slate-700 bg-slate-900/60 p-6">
              <div>
                <p className="font-heading text-3xl font-black text-white">$1,950 per site</p>
                <p className="mt-2 text-sm font-semibold text-sky-200">5-business-day turnaround</p>
              </div>
              <a href="#contact" onClick={handleWorkupOrder} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-sky-600 px-5 py-3 text-sm font-bold text-white shadow-sm hover:bg-sky-500">Order a Site Workup <ArrowRight className="h-4 w-4" /></a>
              <p className="text-sm leading-6 text-slate-300">Need the whole Southeast, not one site? That's the Enterprise license.</p>
            </div>
          </div>
        </div>
      </section>

      {/* TIERS */}
      <section className="mx-auto max-w-7xl px-6 py-14">
        <h2 className="font-heading text-2xl font-bold text-foreground sm:text-3xl">Tiers</h2>
        <div className="mt-8 grid gap-6 lg:grid-cols-3">
          <div className="rounded-2xl border border-border bg-card p-7">
            <h3 className="font-heading text-lg font-bold text-foreground">Professional</h3>
            <p className="mt-1 font-heading text-3xl font-black text-foreground">$39<span className="text-base font-bold text-muted-foreground">/month</span></p>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">Full platform access for individuals.</p>
            <Link to="/subscribe" className="mt-6 inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-sky-700 px-4 py-3 text-sm font-bold text-white hover:bg-sky-800">Subscribe</Link>
          </div>
          <div className="rounded-2xl border border-sky-300 bg-sky-50/40 p-7">
            <h3 className="font-heading text-lg font-bold text-foreground">Enterprise</h3>
            <p className="mt-1 font-heading text-3xl font-black text-foreground">Contact us for pricing</p>
            <ul className="mt-4 space-y-2 text-sm leading-6 text-muted-foreground">
              <li>Multi-seat access for your team</li>
              <li>API data feed</li>
              <li>Quarterly bulk data refresh</li>
              <li>Priority support</li>
            </ul>
            <a href="#contact" className="mt-6 inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-slate-900 px-4 py-3 text-sm font-bold text-white hover:bg-slate-800">Contact us</a>
          </div>
          <div className="rounded-2xl border border-border bg-card p-7">
            <h3 className="font-heading text-lg font-bold text-foreground">Deals &amp; Advisory</h3>
            <p className="mt-1 font-heading text-3xl font-black text-foreground">Custom</p>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">Off-market deal flow, acquisition screening, valuation support. Priced per engagement.</p>
            <a href="#contact" className="mt-6 inline-flex min-h-12 w-full items-center justify-center rounded-xl border border-border bg-card px-4 py-3 text-sm font-bold text-foreground hover:bg-muted">Inquire</a>
          </div>
        </div>
      </section>

      {/* WHY S&S ROCK HOLDINGS */}
      <section className="border-y border-border bg-muted/30">
        <div className="mx-auto max-w-4xl px-6 py-14">
          <h2 className="font-heading text-2xl font-bold text-foreground sm:text-3xl">Why S&amp;S Rock Holdings</h2>
          <blockquote className="mt-6 rounded-2xl border border-border bg-card p-8 text-base leading-8 text-foreground">
            "I was raised in the quarry business. My family operated S&amp;S Rock, Inc. and Old Fort Quarry in Polk County, Tennessee. I'm a licensed real estate agent with deep experience in land records, mineral rights, and quarry permits. This data isn't scraped by a vendor — it's built by someone who knows what a quarry is worth and why."
            <footer className="mt-5 text-sm font-semibold text-muted-foreground">— Kari Stafford, Founder</footer>
          </blockquote>
        </div>
      </section>

      {/* CONTACT FORM */}
      <section id="contact" className="mx-auto max-w-3xl scroll-mt-24 px-6 py-16">
        <h2 className="font-heading text-2xl font-bold text-foreground sm:text-3xl">Talk to us about your data needs.</h2>
        <p className="mt-2 text-sm text-muted-foreground">Tell us what you're looking for and we'll be in touch.</p>
        {submitted ? (
          <div className="mt-8 rounded-2xl border border-emerald-200 bg-emerald-50 p-8 text-center">
            <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-600" />
            <p className="mt-3 font-heading text-xl font-bold text-emerald-950">Thank you — your message is in.</p>
            <p className="mt-2 text-sm text-emerald-800">We'll review your inquiry and reach out within one business day.</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-8 grid gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="name" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Name</label>
                <input id="name" name="name" value={form.name} onChange={handleChange} required className="mt-1.5 min-h-12 w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring" />
              </div>
              <div>
                <label htmlFor="company" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Company</label>
                <input id="company" name="company" value={form.company} onChange={handleChange} className="mt-1.5 min-h-12 w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring" />
              </div>
            </div>
            <div>
              <label htmlFor="email" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Email</label>
              <input id="email" name="email" type="email" value={form.email} onChange={handleChange} required className="mt-1.5 min-h-12 w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring" />
            </div>
            <div>
              <label htmlFor="message" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">What you're looking for</label>
              <textarea id="message" name="message" value={form.message} onChange={handleChange} required rows={5} className="mt-1.5 w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring" />
            </div>
            {error && <p className="text-sm font-semibold text-red-700">{error}</p>}
            <button type="submit" disabled={submitting} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-sky-700 px-6 py-3 text-sm font-bold text-white shadow-sm hover:bg-sky-800 disabled:opacity-60">
              {submitting ? <><Loader2 className="h-4 w-4 animate-spin" /> Sending…</> : "Send inquiry"}
            </button>
          </form>
        )}
      </section>

      <footer className="border-t border-border bg-muted">
        <div className="mx-auto max-w-7xl px-6 py-8 text-center text-xs text-muted-foreground">
          &copy; {new Date().getFullYear()} S&amp;S Rock Holdings LLC · Quarry marketplace + industrial intelligence
        </div>
      </footer>
    </div>
  );
}