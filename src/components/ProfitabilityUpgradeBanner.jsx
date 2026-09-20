import React from "react";
import { Link } from "react-router-dom";
import { Bell, BriefcaseBusiness } from "lucide-react";

export default function ProfitabilityUpgradeBanner(){
 return <section className="border-y border-slate-800 bg-slate-950 text-white"><div className="mx-auto grid max-w-7xl gap-4 px-6 py-6 md:grid-cols-2"><Link to="/watchlist" className="group rounded-2xl border border-slate-800 bg-slate-900/70 p-5 hover:border-sky-500"><Bell className="h-5 w-5 text-sky-300"/><div className="mt-3 font-heading text-lg font-bold">Watch the market</div><p className="mt-1 text-sm leading-6 text-slate-400">Save quarry targets and define acquisition alerts so S&amp;S becomes recurring intelligence instead of a one-time search.</p></Link><Link to="/deal-investor" className="group rounded-2xl border border-slate-800 bg-slate-900/70 p-5 hover:border-sky-500"><BriefcaseBusiness className="h-5 w-5 text-sky-300"/><div className="mt-3 font-heading text-lg font-bold">Move from data to deal</div><p className="mt-1 text-sm leading-6 text-slate-400">Use Deal / Investor intelligence for valuation context, matching, diligence and transaction workflow.</p></Link></div></section>
}
