import React from "react";
import { Link } from "react-router-dom";
import { BriefcaseBusiness, Check } from "lucide-react";

export default function DealTierCard(){
 const features=["Everything in Professional","Quarry Compare","Watchlists & acquisition alerts","Valuation/comparable context","Buyer/seller deal workflow"];
 return <div className="rounded-2xl border border-slate-300 bg-slate-950 p-6 text-white"><div className="flex items-center gap-2"><BriefcaseBusiness className="h-5 w-5 text-sky-300"/><div className="text-lg font-bold">Deal / Investor</div></div><p className="mt-2 text-sm leading-6 text-slate-300">Higher-value acquisition intelligence for serious buyers, investors and operators. Staged separately while the current App Store products remain under review.</p><div className="mt-5 space-y-2">{features.map(f=><div key={f} className="flex gap-2 text-sm"><Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400"/><span>{f}</span></div>)}</div><Link to="/deal-investor" className="mt-6 inline-flex rounded-xl bg-white px-4 py-2.5 text-sm font-bold text-slate-950">Preview Deal / Investor</Link></div>
}
