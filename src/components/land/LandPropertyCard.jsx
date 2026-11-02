import React from "react";
import { Link } from "react-router-dom";
import { ArrowUpRight, MapPin, X } from "lucide-react";
import {
  formatAcreage,
  formatPrice,
  formatPricePerAcre,
  landStatusStyle,
  landTypeStyle,
} from "@/lib/landTypes";

function Fact({ label, value }) {
  if (!value) return null;
  return (
    <div className="min-w-0">
      <dt className="text-[10px] font-bold uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="mt-0.5 break-words text-xs font-semibold leading-4 text-slate-900">{value}</dd>
    </div>
  );
}

export default function LandPropertyCard({ property, onClose }) {
  if (!property) return null;
  const acres = formatAcreage(property.acreage);
  const price = formatPrice(property.asking_price);
  const perAcre = formatPricePerAcre(property);
  const highlights = Array.isArray(property.features) ? property.features.slice(0, 4) : [];

  return (
    <section
      aria-label="Selected land listing"
      className="pointer-events-auto flex max-h-[62dvh] w-full flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl sm:max-h-[78dvh]"
    >
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="relative bg-gradient-to-br from-emerald-900 via-slate-800 to-slate-900 px-4 pb-4 pt-4 text-white">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-emerald-200">
                {property.is_example ? "Example land listing" : "Land for sale"}
              </p>
              <h2 className="mt-1 line-clamp-2 text-lg font-extrabold leading-6">{property.title}</h2>
              <p className="mt-1 flex items-center gap-1 text-xs text-slate-300">
                <MapPin className="h-3.5 w-3.5" />
                {[property.county ? property.county + " County" : null, property.state].filter(Boolean).join(", ") || "Mapped location"}
              </p>
            </div>
            {onClose && (
              <button
                type="button"
                onClick={onClose}
                aria-label="Close listing"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/15 text-white hover:bg-white/25"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          <div className="mt-3 flex flex-wrap gap-1.5">
            <span className={"rounded-full px-2.5 py-1 text-[10px] font-bold " + landStatusStyle(property.status)}>
              {property.status || "For Sale"}
            </span>
            <span className={"rounded-full px-2.5 py-1 text-[10px] font-bold " + landTypeStyle(property.property_type)}>
              {property.property_type}
            </span>
            {acres && <span className="rounded-full bg-white/15 px-2.5 py-1 text-[10px] font-bold text-white">{acres}</span>}
          </div>
        </div>

        <div className="px-4 py-3">
          <dl className="grid grid-cols-2 gap-x-3 gap-y-3">
            <Fact label="Asking price" value={price || "Call for price"} />
            <Fact label="Per acre" value={perAcre} />
            <Fact label="Acreage" value={acres} />
            <Fact label="Mineral rights" value={property.mineral_rights} />
            <Fact label="Water" value={property.water_features} />
            <Fact label="Access" value={property.road_frontage} />
          </dl>

          {highlights.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5 border-t border-slate-100 pt-3">
              {highlights.map((feature) => (
                <span key={feature} className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-700">
                  {feature}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="border-t border-slate-100 bg-slate-50 px-3 py-3">
        <Link
          to={"/land/" + property.id}
          className="inline-flex min-h-11 w-full items-center justify-center gap-1.5 rounded-xl bg-emerald-800 px-4 text-sm font-bold text-white hover:bg-emerald-900"
        >
          View listing <ArrowUpRight className="h-4 w-4" />
        </Link>
        <p className="mt-2 text-[10px] leading-4 text-slate-500">
          Seller-supplied listing. Acreage, price and rights should be verified before purchase.
        </p>
      </div>
    </section>
  );
}