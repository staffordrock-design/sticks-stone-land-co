import React from "react";
import { Link } from "react-router-dom";
import { MapPin, Mountain, ArrowUpRight, BadgeCheck } from "lucide-react";

const sourceStyles = {
  MSHA: "bg-stone-900 text-stone-50",
  TDEC: "bg-emerald-100 text-emerald-900 border border-emerald-300",
  "County GIS": "bg-amber-100 text-amber-900 border border-amber-300",
  "Register of Deeds": "bg-indigo-100 text-indigo-900 border border-indigo-300",
  Other: "bg-stone-100 text-stone-800 border border-stone-300",
};

export default function MiningSiteCard({ site }) {
  const location = [site.county ? `${site.county}, ` : "", site.state].join("");
  const verified = site.is_verified_listing && site.listing_id;

  const body = (
    <div className="group flex h-full flex-col overflow-hidden rounded-2xl border border-border bg-card transition-all duration-300 hover:shadow-xl hover:-translate-y-1">
      <div className="relative h-40 overflow-hidden bg-gradient-to-br from-stone-200 to-stone-100">
        <div className="flex h-full w-full items-center justify-center text-stone-400">
          <Mountain className="h-10 w-10" />
        </div>
        <div className="absolute left-3 top-3">
          <span
            className={`rounded-full px-3 py-1 text-xs font-semibold tracking-wide ${
              sourceStyles[site.source] || sourceStyles.Other
            }`}
          >
            {site.source}
          </span>
        </div>
        <div className="absolute right-3 top-3 rounded-full bg-amber-500/90 px-3 py-1 text-xs font-semibold text-white backdrop-blur">
          Potential
        </div>
      </div>

      <div className="flex flex-1 flex-col p-5">
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-heading text-lg font-semibold leading-snug text-foreground">
            {site.mine_name}
          </h3>
          {verified ? (
            <BadgeCheck className="mt-1 h-5 w-5 shrink-0 text-emerald-600" />
          ) : (
            <ArrowUpRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" />
          )}
        </div>
        <div className="mt-2 flex items-center gap-1.5 text-sm text-muted-foreground">
          <MapPin className="h-3.5 w-3.5" />
          <span>{location || "—"}</span>
        </div>

        <div className="mt-3 flex flex-wrap gap-1.5">
          {site.commodity && (
            <span className="rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground">
              {site.commodity}
            </span>
          )}
          {site.mine_type && (
            <span className="rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground">
              {site.mine_type}
            </span>
          )}
          {site.mine_status && (
            <span className="rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground">
              {site.mine_status}
            </span>
          )}
        </div>

        <div className="mt-4 flex items-end justify-between border-t border-border pt-4">
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">
              Operator
            </p>
            <p className="truncate font-display text-sm font-semibold text-foreground">
              {site.operator_name || "—"}
            </p>
          </div>
          {site.acreage != null && (
            <div className="text-right">
              <p className="text-xs uppercase tracking-wider text-muted-foreground">
                Acreage
              </p>
              <p className="font-display text-base font-bold text-foreground">
                {Number(site.acreage).toLocaleString()}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  return verified ? (
    <Link to={`/listings/${site.listing_id}`} className="block h-full">
      {body}
    </Link>
  ) : (
    <Link to={`/mines/${site.id}`} className="block h-full">
      {body}
    </Link>
  );
}