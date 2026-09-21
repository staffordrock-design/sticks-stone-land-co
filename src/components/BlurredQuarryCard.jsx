import React from "react";
import { Link } from "react-router-dom";
import { MapPin, Mountain, Gem, LockKeyhole, Gauge, Landmark, Leaf, ArrowUpRight } from "lucide-react";

const sourceStyles = {
  MSHA: "bg-stone-900 text-stone-50",
  TDEC: "bg-emerald-100 text-emerald-900 border border-emerald-300",
  "County GIS": "bg-sky-100 text-sky-900 border border-sky-300",
  "Register of Deeds": "bg-indigo-100 text-indigo-900 border border-indigo-300",
  Other: "bg-stone-100 text-stone-800 border border-stone-300",
};

function statusLabel(site) {
  if (site.is_verified_listing && site.listing_id) return "For Sale Listing";
  const s = String(site.mine_status || "").toLowerCase();
  if (s.includes("intermittent") || s.includes("idled") || s.includes("inactive") || s.includes("nonproducing")) return "Inactive / Idled Record";
  if (s.includes("historical") || s.includes("abandon")) return "Historical Record";
  if (s.includes("new mine")) return "New Mine Record";
  if (s.includes("active")) return "Active Quarry Intelligence";
  return "Off-Market Quarry Intelligence";
}

// A blurred placeholder bar — looks like real data but is unreadable.
function BlurBar({ className = "" }) {
  return <div className={`rounded bg-slate-300/80 blur-[5px] ${className}`} />;
}

export default function BlurredQuarryCard({ site }) {
  const location = [site.county ? `${site.county}, ` : "", site.state].join("");

  return (
    <Link to="/subscribe" className="group block h-full">
      <div className="group relative flex h-full flex-col overflow-hidden rounded-2xl border border-border bg-card transition-all duration-300 hover:shadow-xl hover:-translate-y-1">
        {/* Hero — stone gradient with a soft blur so it reads as "locked imagery" */}
        <div className="relative h-40 overflow-hidden bg-gradient-to-br from-stone-300 via-stone-400 to-stone-600">
          <div className="absolute inset-0 flex items-center justify-center">
            <Mountain className="h-10 w-10 text-white/40" />
          </div>
          <div className="absolute inset-0 backdrop-blur-sm bg-stone-900/10" />
          <span className={`absolute left-3 top-3 rounded-full px-3 py-1 text-xs font-semibold tracking-wide ${sourceStyles[site.source] || sourceStyles.Other}`}>
            {site.source}
          </span>
          <span className="absolute right-3 top-3 max-w-[70%] rounded-full bg-slate-900/85 px-3 py-1 text-right text-xs font-semibold text-white backdrop-blur">
            {statusLabel(site)}
          </span>
        </div>

        <div className="flex flex-1 flex-col p-5">
          <div className="flex items-start justify-between gap-2">
            <h3 className="font-heading text-lg font-semibold leading-snug text-foreground">
              {site.mine_name}
            </h3>
            <LockKeyhole className="mt-1 h-4 w-4 shrink-0 text-slate-400" />
          </div>
          <div className="mt-2 flex items-center gap-1.5 text-sm text-muted-foreground">
            <MapPin className="h-3.5 w-3.5" />
            <span>{location || "—"}</span>
          </div>

          {/* Blurred S&S Estimate — the headline value visitors want to see */}
          <div className="mt-3 rounded-xl border border-sky-200 bg-sky-50 p-3">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider text-sky-800">S&amp;S Estimate</span>
              <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-semibold text-sky-700">locked</span>
            </div>
            <div className="mt-1 flex items-center gap-2">
              <BlurBar className="h-7 w-32" />
              <span className="text-[10px] font-bold uppercase tracking-wider text-sky-700">unlock</span>
            </div>
            <div className="mt-1 flex items-center gap-1.5">
              <BlurBar className="h-3 w-20" />
              <span className="text-[10px] text-sky-700">acres</span>
            </div>
          </div>

          {/* Blurred opportunity score */}
          <div className="mt-3 rounded-xl border border-sky-200 bg-sky-50/70 p-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-sky-800">
                <Gauge className="h-3.5 w-3.5" /> Opportunity Score
              </div>
              <BlurBar className="h-5 w-10" />
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <div className="rounded-lg border border-sky-100 bg-white/80 p-2">
                <div className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-slate-500"><Gem className="h-3 w-3" /> Rock</div>
                <div className="mt-1"><BlurBar className="h-3 w-16" /></div>
              </div>
              <div className="rounded-lg border border-sky-100 bg-white/80 p-2">
                <div className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-slate-500"><Landmark className="h-3 w-3" /> Owner</div>
                <div className="mt-1"><BlurBar className="h-3 w-20" /></div>
              </div>
              <div className="rounded-lg border border-sky-100 bg-white/80 p-2">
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Permitted acres</div>
                <div className="mt-1"><BlurBar className="h-3 w-12" /></div>
              </div>
              <div className="rounded-lg border border-sky-100 bg-white/80 p-2">
                <div className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-slate-500"><Leaf className="h-3 w-3" /> Regulatory</div>
                <div className="mt-1"><BlurBar className="h-3 w-14" /></div>
              </div>
            </div>
          </div>

          {/* Real public chips */}
          <div className="mt-3 flex flex-wrap gap-1.5">
            {site.commodity && (
              <span className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-slate-50 px-2 py-0.5 text-xs font-semibold text-slate-700">
                <Gem className="h-3 w-3" />
                {site.commodity}
              </span>
            )}
            <span className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-slate-50 px-2 py-0.5 text-xs font-semibold text-slate-700">
              <LockKeyhole className="h-3 w-3" /> Full record locked
            </span>
          </div>

          {/* CTA */}
          <div className="mt-4 flex items-center justify-between rounded-xl bg-slate-900 px-4 py-3 text-white">
            <span className="text-xs font-bold uppercase tracking-wider">Unlock this record</span>
            <ArrowUpRight className="h-4 w-4" />
          </div>
          <p className="mt-2 text-[10px] leading-4 text-muted-foreground">
            Public-source mine intelligence. Subscribe to view owner/operator, permitted acreage, geology, valuation and opportunity score.
          </p>
        </div>
      </div>
    </Link>
  );
}