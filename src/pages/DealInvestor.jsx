import React from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, BriefcaseBusiness, Check, Crown, FileSearch, GitCompareArrows, ShieldCheck } from "lucide-react";

export default function DealInvestor(){
 const features=[
  "Everything in Professional Intelligence",
  "Quarry comparison and portfolio screening",
  "Saved quarry watchlists and acquisition alerts",
  "Advanced valuation and comparable-sale context",
  "Buyer/seller matching and deal-opportunity workflow",
  "Priority access to data-room and diligence services",
  "Report credits and custom research options as offered",
 ];
 return <div className="min-h-screen bg-background"><header className="border-b border-border"><div className="mx-auto max-w-5xl px-6 py-4"><Link to="/subscribe" className="inline-flex items-center gap-2 text-sm text-muted-foreground"><ArrowLeft className="h-4 w-4"/>Membership plans</Link></div></header><main className="mx-auto max-w-5xl px-6 py-12"><div className="rounded-3xl border border-slate-300 bg-slate-950 p-8 text-white sm:p-10"><div className="flex items-center gap-3"><BriefcaseBusiness className="h-7 w-7 text-sky-300"/><div><p className="text-xs font-bold uppercase tracking-[0.2em] text-sky-300">Coming next</p><h1 className="font-heading text-3xl font-bold">Deal / Investor Intelligence</h1></div></div><p className="mt-4 max-w-3xl text-sm leading-6 text-slate-300">Built for acquisition teams, investors and operators who need to move from quarry discovery into comparison, monitoring, diligence and transaction workflow. This tier is being staged separately so the current App Store subscription products are not changed while review is pending.</p><div className="mt-7 grid gap-3 sm:grid-cols-2">{features.map(f=><div key={f} className="flex gap-2 rounded-xl border border-slate-800 bg-slate-900/70 p-4 text-sm"><Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400"/><span>{f}</span></div>)}</div><div className="mt-8 flex flex-wrap gap-3"><Link to="/compare" className="inline-flex items-center gap-2 rounded-xl bg-white px-5 py-3 text-sm font-bold text-slate-950"><GitCompareArrows className="h-4 w-4"/>Try Quarry Compare</Link><Link to="/watchlist" className="inline-flex items-center gap-2 rounded-xl border border-slate-700 px-5 py-3 text-sm font-bold text-white"><ShieldCheck className="h-4 w-4"/>Open Watchlist</Link><Link to="/support" className="inline-flex items-center gap-2 rounded-xl border border-slate-700 px-5 py-3 text-sm font-bold text-white"><FileSearch className="h-4 w-4"/>Ask about Deal access</Link></div></div><div className="mt-6 rounded-2xl border border-border bg-card p-6"><div className="flex items-center gap-2 font-bold"><Crown className="h-5 w-5 text-sky-700"/>Why this tier matters</div><p className="mt-2 text-sm leading-6 text-muted-foreground">Quarry Access answers “what is there?” Professional answers “what do we know about it?” Deal / Investor is designed to answer “which one should I pursue, what changed, and what do I do next?” That is the highest-value part of S&amp;S.</p></div></main></div>
}
