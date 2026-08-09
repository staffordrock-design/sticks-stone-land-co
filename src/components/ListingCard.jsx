import React from "react";
import { Link } from "react-router-dom";
import { MapPin, Layers, ArrowUpRight } from "lucide-react";

const tierStyles = {
  Quarry: "bg-stone-900 text-stone-50",
  Aggregate: "bg-amber-100 text-amber-900 border border-amber-300",
  "Mineral Rights": "bg-emerald-100 text-emerald-900 border border-emerald-300",
  Royalty: "bg-indigo-100 text-indigo-900 border border-indigo-300",
};

export default function ListingCard({ listing }) {
  return (
    <Link
      to={`/listings/${listing.id}`}
      className="group flex flex-col overflow-hidden rounded-2xl border border-border bg-card transition-all duration-300 hover:shadow-xl hover:-translate-y-1"
    >
      <div className="relative h-48 overflow-hidden bg-stone-100">
        {listing.primary_image ? (
          <img
            src={listing.primary_image}
            alt={listing.title}
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-stone-400">
            <Layers className="h-10 w-10" />
          </div>
        )}
        <div className="absolute left-3 top-3">
          <span
            className={`rounded-full px-3 py-1 text-xs font-semibold tracking-wide ${
              tierStyles[listing.tier] || "bg-stone-100 text-stone-800"
            }`}
          >
            {listing.tier}
          </span>
        </div>
        <div className="absolute right-3 top-3 rounded-full bg-white/90 px-3 py-1 text-xs font-medium text-stone-700 backdrop-blur">
          {listing.status}
        </div>
      </div>

      <div className="flex flex-1 flex-col p-5">
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-heading text-lg font-semibold leading-snug text-foreground">
            {listing.title}
          </h3>
          <ArrowUpRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
        </div>
        <div className="mt-2 flex items-center gap-1.5 text-sm text-muted-foreground">
          <MapPin className="h-3.5 w-3.5" />
          <span>
            {listing.county ? `${listing.county}, ` : ""}
            {listing.state}
          </span>
        </div>

        <div className="mt-4 flex items-end justify-between border-t border-border pt-4">
          <div>
            <p className="text-xs uppercase tracking-wider text-muted-foreground">Acreage</p>
            <p className="font-display text-base font-semibold text-foreground">
              {Number(listing.acreage).toLocaleString()} ac
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">Asking</p>
            <p className="font-display text-lg font-bold text-foreground">
              ${Number(listing.asking_price).toLocaleString()}
            </p>
          </div>
        </div>
      </div>
    </Link>
  );
}