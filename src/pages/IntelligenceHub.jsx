import React from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  Bell,
  BriefcaseBusiness,
  Database,
  FileSearch,
  Gem,
  GitCompareArrows,
  MapPinned,
  Mountain,
  ShieldCheck,
  TrendingUp,
} from "lucide-react";

const tools = [
  {
    to: "/mineral-intelligence",
    icon: MapPinned,
    eyebrow: "USGS + S&S",
    title: "Mineral Intelligence Map",
    description: "Explore Southeast mineral occurrences, matched mine records, historical producers and potential mineral clusters.",
  },
  {
    to: "/compare",
    icon: GitCompareArrows,
    eyebrow: "Decision tool",
    title: "Compare Quarries",
    description: "Put quarry records side by side across status, ownership, acreage, geology, production, compliance and valuation context.",
  },
  {
    to: "/watchlist",
    icon: Bell,
    eyebrow: "Acquisition radar",
    title: "Watchlist & Alerts",
    description: "Save target quarries and create recurring acquisition criteria by state, commodity, acreage and opportunity profile.",
  },
  {
    to: "/opportunities",
    icon: TrendingUp,
    eyebrow: "Buyer workspace",
    title: "Saved Opportunities",
    description: "Keep the quarry records you are actively researching in one place and return directly to their intelligence pages.",
  },
  {
    to: "/mineral-value-guide",
    icon: Gem,
    eyebrow: "Material screening",
    title: "Material Opportunity Analyzer",
    description: "Filter the live quarry database by state and material, then rank targets using activity, geology, permitted acreage and S&S opportunity signals.",
  },
  {
    to: "/deal-investor",
    icon: BriefcaseBusiness,
    eyebrow: "Deal workflow",
    title: "Deal / Investor Intelligence",
    description: "Move from discovery into screening, buyer/seller workflow, diligence and transaction intelligence.",
  },
];

const dataLayers = [
  "MSHA mine identity & operating status",
  "TDEC permits & permitted acreage",
  "Parcel / tax ownership intelligence",
  "Mapped geology & rock type",
  "Production & activity context",
  "Environmental & compliance records",
  "USGS mineral occurrences",
  "Contracts, leases & royalty signals",
  "Quarry opportunity scoring & valuation context",
];

export default function IntelligenceHub() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-slate-950 text-white" style={{ paddingTop: "env(safe-area-inset-top, 16px)" }}>
        <div className="mx-auto max-w-7xl px-6 pb-8 pt-5">
          <Link to="/" className="inline-flex items-center gap-2 text-sm font-semibold text-slate-300 hover:text-white">
            <Mountain className="h-4 w-4" /> Quarry marketplace
          </Link>
          <div className="mt-7 max-w-3xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-sky-400/30 bg-sky-400/10 px-3 py-1 text-xs font-bold uppercase tracking-[0.18em] text-sky-200">
              <Database className="h-3.5 w-3.5" /> S&amp;S Intelligence Center
            </div>
            <h1 className="mt-4 font-heading text-4xl font-bold tracking-tight sm:text-5xl">Quarry intelligence, all in one place.</h1>
            <p className="mt-4 max-w-2xl text-sm leading-6 text-slate-300 sm:text-base">
              Move from finding a quarry to understanding the ground, ownership, permits, geology, production, compliance, opportunity signals and deal workflow without hunting through separate screens.
            </p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-10 pb-28">
        <section>
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-sky-700">Professional toolkit</p>
              <h2 className="mt-1 font-heading text-2xl font-bold">Intelligence tools</h2>
            </div>
            <Link to="/subscribe" className="text-sm font-bold text-sky-800 hover:underline">Membership</Link>
          </div>

          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {tools.map(({ to, icon: Icon, eyebrow, title, description }) => (
              <Link key={to} to={to} className="group rounded-2xl border border-border bg-card p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-slate-900 text-white">
                    <Icon className="h-5 w-5" />
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground transition group-hover:translate-x-1 group-hover:text-sky-700" />
                </div>
                <p className="mt-5 text-[10px] font-bold uppercase tracking-[0.18em] text-sky-700">{eyebrow}</p>
                <h3 className="mt-1 font-heading text-lg font-bold text-foreground">{title}</h3>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p>
              </Link>
            ))}
          </div>
        </section>

        <section className="mt-10 grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="rounded-3xl border border-slate-700 bg-slate-950 p-7 text-white">
            <div className="flex items-center gap-2 text-sky-300"><ShieldCheck className="h-5 w-5" /><span className="text-xs font-bold uppercase tracking-[0.18em]">Full quarry record</span></div>
            <h2 className="mt-3 font-heading text-2xl font-bold">The intelligence stack behind each site</h2>
            <div className="mt-5 grid gap-2 sm:grid-cols-2">
              {dataLayers.map((item) => (
                <div key={item} className="rounded-xl border border-slate-800 bg-slate-900/70 px-4 py-3 text-sm text-slate-200">{item}</div>
              ))}
            </div>
            <p className="mt-5 text-xs leading-5 text-slate-400">Coverage varies by source and property. S&amp;S keeps source identity, confidence and limitations visible instead of presenting screening data as a title opinion, reserve report or appraisal.</p>
          </div>

          <div className="rounded-3xl border border-border bg-card p-7">
            <div className="flex items-center gap-2 text-sky-700"><FileSearch className="h-5 w-5" /><span className="text-xs font-bold uppercase tracking-[0.18em]">Diligence</span></div>
            <h2 className="mt-3 font-heading text-2xl font-bold">Go deeper when a target matters.</h2>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">Use the platform for screening, then move a serious target into a downloadable intelligence report or transaction-focused due-diligence review.</p>
            <div className="mt-6 space-y-3 text-sm">
              <div className="rounded-xl border border-border bg-muted/20 p-4"><strong>Standard Intelligence</strong><div className="mt-1 text-muted-foreground">Ownership, geology, permits, environmental and production context.</div></div>
              <div className="rounded-xl border border-border bg-muted/20 p-4"><strong>Enhanced Intelligence</strong><div className="mt-1 text-muted-foreground">Adds property, market, valuation, mineral-value and logistics screening.</div></div>
              <div className="rounded-xl border border-border bg-muted/20 p-4"><strong>Deal Due Diligence</strong><div className="mt-1 text-muted-foreground">Deeper transaction-focused review for acquisition decisions.</div></div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
