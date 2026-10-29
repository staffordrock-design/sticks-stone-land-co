import React from "react";
import { Link } from "react-router-dom";
import { ArrowUpRight, ChevronDown, Loader2, MapPin, X } from "lucide-react";
import { rockCategoryColor } from "@/lib/rockTypes";
import { formatAcreage, statusGroup, statusStyle } from "@/lib/quarryStatus";

function ResultRow({ site, selected, onChoose, onHover }) {
  const acres = formatAcreage(site.acreage);
  return (
    <button
      type="button"
      onClick={() => onChoose(site.id)}
      onMouseEnter={() => onHover?.(site.id)}
      onMouseLeave={() => onHover?.(null)}
      className={
        "group w-full rounded-xl border p-3 text-left transition " +
        (selected ? "border-blue-600 bg-blue-50 shadow-sm" : "border-slate-200 bg-white hover:border-blue-300 hover:bg-slate-50")
      }
    >
      <div className="flex items-start justify-between gap-2">
        <span className="line-clamp-2 text-sm font-bold leading-5 text-slate-950">{site.mine_name || "Quarry / mine site"}</span>
        <MapPin className={"mt-0.5 h-4 w-4 shrink-0 " + (selected ? "text-blue-700" : "text-slate-400")} />
      </div>
      <p className="mt-0.5 text-xs text-slate-600">
        {[site.county ? site.county + " County" : null, site.state].filter(Boolean).join(", ") || "Location on record"}
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-1">
        <span className={"rounded-full px-2 py-0.5 text-[10px] font-bold " + statusStyle(site.mine_status)}>
          {statusGroup(site.mine_status)}
        </span>
        {site.commodity && (
          <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-700">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: rockCategoryColor(site.commodity) }} />
            <span className="max-w-[130px] truncate">{site.commodity}</span>
          </span>
        )}
        {acres && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-700">{acres}</span>}
      </div>
    </button>
  );
}

export default function ResultsPanel({
  variant = "sidebar",
  sites = [],
  total = 0,
  loading = false,
  query = "",
  stateCode,
  selectedId,
  limit = 30,
  hasProfessional,
  onChoose,
  onHover,
  onClose,
  onClear,
  onShowMore,
  sampleId,
}) {
  const shell =
    variant === "sidebar"
      ? "hidden w-[360px] shrink-0 flex-col border-r border-slate-200 bg-white lg:flex"
      : "absolute inset-x-2 bottom-2 top-14 z-[550] flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl lg:hidden";

  return (
    <aside aria-label="Quarry search results" className={shell}>
      <div className="flex items-start justify-between gap-2 border-b border-slate-100 px-4 py-3">
        <div className="min-w-0">
          <h2 className="text-base font-extrabold text-slate-950">{query ? "Search results" : "Quarries on this map"}</h2>
          <p className="mt-0.5 text-xs text-slate-500">
            {loading
              ? "Loading records…"
              : sites.length.toLocaleString() +
                (query ? " matching records in " + stateCode : " in view · " + total.toLocaleString() + " matches")}
          </p>
        </div>
        {variant === "overlay" && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close results"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-700"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
        {loading ? (
          <div className="flex items-center gap-2 p-4 text-sm text-slate-600">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading quarries…
          </div>
        ) : sites.length === 0 ? (
          <div className="p-5 text-center text-sm leading-6 text-slate-600">
            No matching records. Try another search term, move the map, or pick a different state.
            <button type="button" onClick={onClear} className="mt-3 block w-full rounded-xl bg-blue-700 px-3 py-2.5 text-xs font-bold text-white">
              Clear filters
            </button>
          </div>
        ) : (
          <>
            {sites.slice(0, limit).map((site) => (
              <ResultRow
                key={site.id}
                site={site}
                selected={site.id === selectedId}
                onChoose={onChoose}
                onHover={onHover}
              />
            ))}
            {sites.length > limit && (
              <button
                type="button"
                onClick={onShowMore}
                className="flex w-full items-center justify-center gap-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-xs font-bold text-slate-800"
              >
                Show more quarries <ChevronDown className="h-4 w-4" />
              </button>
            )}
          </>
        )}
      </div>

      {!hasProfessional && sampleId && (
        <Link
          to={"/mines/" + sampleId}
          className="flex items-center justify-center gap-1 border-t border-slate-100 px-4 py-3 text-center text-xs font-bold text-blue-700"
        >
          Explore a complete sample record <ArrowUpRight className="h-3.5 w-3.5" />
        </Link>
      )}
    </aside>
  );
}