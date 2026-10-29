import React from "react";
import { Link } from "react-router-dom";
import { ArrowUpRight, Lock, MapPin, X } from "lucide-react";
import WatchQuarryButton from "@/components/WatchQuarryButton";
import { rockCategoryColor, rockCategoryFor } from "@/lib/rockTypes";
import { formatAcreage, statusGroup, statusStyle } from "@/lib/quarryStatus";

function Fact({ label, value }) {
  if (!value) return null;
  return (
    <div className="min-w-0">
      <dt className="text-[10px] font-bold uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="mt-0.5 break-words text-xs font-semibold leading-4 text-slate-900">{value}</dd>
    </div>
  );
}

function LockedFact({ label }) {
  return (
    <div className="min-w-0">
      <dt className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{label}</dt>
      <dd className="mt-0.5 flex items-center gap-1 text-xs font-semibold text-slate-400">
        <Lock className="h-3 w-3" /> Member data
      </dd>
    </div>
  );
}

export default function PropertyCard({ site, parcel, verification, permits = [], geology, premium, onClose }) {
  const rock = geology?.primary_rock || geology?.lithology || site.commodity;
  const rockLabel = rockCategoryFor(rock);
  const acres = formatAcreage(parcel?.acreage || site.acreage);
  const owner = verification?.owner_name || parcel?.owner_name;
  const parcelId = verification?.parcel_id || parcel?.parcel_id || site.parcel_id;
  const deed = verification?.deed_book_page || parcel?.deed_book_page;
  const operator = site.operator_name || verification?.operator_name || parcel?.owner_name;
  const permitNumbers = Array.from(new Set(permits.map((permit) => permit.permit_number).filter(Boolean))).slice(0, 3);
  const score = Number(site.screening_opportunity_score);
  const isListing = site.is_verified_listing && site.listing_id;
  const recordHref = isListing ? "/listings/" + site.listing_id : "/mines/" + site.id;

  return (
    <section
      aria-label="Selected quarry record"
      className="pointer-events-auto flex max-h-[62dvh] w-full flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl sm:max-h-[78dvh]"
    >
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="relative bg-gradient-to-br from-slate-900 via-slate-800 to-blue-900 px-4 pb-4 pt-4 text-white">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-blue-200">
                {isListing ? "Verified seller listing" : "Quarry intelligence record"}
              </p>
              <h2 className="mt-1 line-clamp-2 text-lg font-extrabold leading-6">{site.mine_name || "Quarry / mine site"}</h2>
              <p className="mt-1 flex items-center gap-1 text-xs text-slate-300">
                <MapPin className="h-3.5 w-3.5" />
                {[site.county ? site.county + " County" : null, site.state].filter(Boolean).join(", ") || "Mapped location"}
              </p>
            </div>
            {onClose && (
              <button
                type="button"
                onClick={onClose}
                aria-label="Close record"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/15 text-white hover:bg-white/25"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          <div className="mt-3 flex flex-wrap gap-1.5">
            <span className={"rounded-full px-2.5 py-1 text-[10px] font-bold " + statusStyle(site.mine_status)}>
              {statusGroup(site.mine_status)}
            </span>
            {rock && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-2.5 py-1 text-[10px] font-bold text-white">
                <span className="h-2 w-2 rounded-full border border-white/70" style={{ backgroundColor: rockCategoryColor(rock) }} />
                {rockLabel || rock}
              </span>
            )}
            {acres && <span className="rounded-full bg-white/15 px-2.5 py-1 text-[10px] font-bold text-white">{acres}</span>}
          </div>
        </div>

        <div className="px-4 py-3">
          <dl className="grid grid-cols-2 gap-x-3 gap-y-3">
            <Fact label="Operating status" value={site.mine_status || statusGroup(site.mine_status)} />
            <Fact label="Material" value={site.commodity || rock} />
            <Fact label="MSHA ID" value={site.msha_mine_id} />
            <Fact label="Parcel acreage" value={acres} />
          </dl>

          {premium ? (
            <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-3 border-t border-slate-100 pt-3">
              <Fact label="Owner on record" value={owner} />
              <Fact label="Parcel ID" value={parcelId} />
              <Fact label="Deed reference" value={deed} />
              <Fact label="Operator" value={operator} />
              <Fact label="Permits" value={permitNumbers.join(" · ")} />
              <Fact label="Geologic unit" value={geology?.geologic_unit || geology?.formation_name} />
              <Fact
                label="S&amp;S opportunity score"
                value={Number.isFinite(score) && score > 0 ? score.toFixed(0) + " / 100" : null}
              />
              <Fact label="County" value={site.county} />
            </dl>
          ) : (
            <div className="mt-3 border-t border-slate-100 pt-3">
              <dl className="grid grid-cols-2 gap-x-3 gap-y-3">
                <LockedFact label="Owner on record" />
                <LockedFact label="Parcel ID" />
                <LockedFact label="Deed reference" />
                <LockedFact label="Permits" />
              </dl>
              <div className="mt-3 rounded-xl border border-blue-200 bg-blue-50 p-3">
                <p className="text-[11px] leading-4 text-blue-900">
                  Available ownership, parcel, deed, geology, permit and production detail unlock with Full Quarry
                  Intelligence.
                </p>
                <Link
                  to="/subscribe"
                  className="mt-2 inline-flex min-h-9 items-center rounded-lg bg-blue-700 px-3 text-[11px] font-bold text-white hover:bg-blue-800"
                >
                  Unlock — $39/month
                </Link>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="border-t border-slate-100 bg-slate-50 px-3 py-3">
        <Link
          to={recordHref}
          className="inline-flex min-h-11 w-full items-center justify-center gap-1.5 rounded-xl bg-blue-700 px-4 text-sm font-bold text-white hover:bg-blue-800"
        >
          Open full record <ArrowUpRight className="h-4 w-4" />
        </Link>
        <div className="mt-2 flex items-center justify-between gap-2">
          <WatchQuarryButton site={site} className="min-h-9 !rounded-lg !px-3 !text-[11px]" />
          <Link to="/data-sources" className="text-[10px] font-semibold text-slate-500 hover:text-slate-800">
            Data sources
          </Link>
        </div>
        <p className="mt-2 text-[10px] leading-4 text-slate-500">
          Source-linked screening data; not a survey, title opinion or reserve estimate.
        </p>
      </div>
    </section>
  );
}