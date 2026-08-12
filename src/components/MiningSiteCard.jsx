import React from "react";
import { Link } from "react-router-dom";
import { MapPin, Mountain, ArrowUpRight, BadgeCheck, Camera, DollarSign } from "lucide-react";
import { formatCompactMoney } from "@/utils/quarryValuation";

function worldImageryTile(lat, lng, zoom = 14) {
  if (!Number.isFinite(Number(lat)) || !Number.isFinite(Number(lng))) return null;
  const z = Math.max(1, Math.min(19, zoom));
  const n = 2 ** z;
  const x = Math.floor(((Number(lng) + 180) / 360) * n);
  const latRad = (Number(lat) * Math.PI) / 180;
  const y = Math.floor((1 - Math.asinh(Math.tan(latRad)) / Math.PI) / 2 * n);
  return `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`; // Esri cached imagery tile endpoint
}

const sourceStyles = {
  MSHA: "bg-stone-900 text-stone-50",
  TDEC: "bg-emerald-100 text-emerald-900 border border-emerald-300",
  "County GIS": "bg-amber-100 text-amber-900 border border-amber-300",
  "Register of Deeds": "bg-indigo-100 text-indigo-900 border border-indigo-300",
  Other: "bg-stone-100 text-stone-800 border border-stone-300",
};

function opportunityLabel(site) {
  if (site.is_verified_listing && site.listing_id) return "Verified Listing";
  const s = String(site.mine_status || "").toLowerCase();
  if (s.includes("intermittent") || s.includes("temporarily idled") || s.includes("nonproducing") || s.includes("non-producing") || s.includes("inactive")) return "Off-Market · Inactive / Idled";
  if (s.includes("historical") || s.includes("abandon")) return "Off-Market · Historical / Abandoned";
  if (s.includes("new mine") || !s.trim()) return "Potential Opportunity";
  return "Operating Site";
}

export default function MiningSiteCard({ site, valuation }) {
  const location = [site.county ? `${site.county}, ` : "", site.state].join("");
  const verified = site.is_verified_listing && site.listing_id;
  const aerialPreview = worldImageryTile(site.latitude, site.longitude);
  const heroImage = site.site_images?.[0] || aerialPreview;
  const heroLabel = site.site_images?.[0] ? "Property photo" : aerialPreview ? "Aerial location preview" : null;

  const body = (
    <div className="group flex h-full flex-col overflow-hidden rounded-2xl border border-border bg-card transition-all duration-300 hover:shadow-xl hover:-translate-y-1">
      <div className="relative h-40 overflow-hidden bg-gradient-to-br from-stone-200 to-stone-100">
        {heroImage ? (
          <>
            <img src={heroImage} alt={site.mine_name || "Quarry opportunity"} className="h-full w-full object-cover transition duration-500 group-hover:scale-105" />
            {heroLabel && <div className="absolute bottom-2 left-2 rounded-md bg-stone-950/75 px-2 py-1 text-[10px] font-medium text-white backdrop-blur">{heroLabel}{heroLabel === "Aerial location preview" ? " · Esri World Imagery" : ""}</div>}
          </>
        ) : (
          <div className="flex h-full w-full items-center justify-center text-stone-400">
            <Mountain className="h-10 w-10" />
          </div>
        )}
        <div className="absolute left-3 top-3">
          <span
            className={`rounded-full px-3 py-1 text-xs font-semibold tracking-wide ${
              sourceStyles[site.source] || sourceStyles.Other
            }`}
          >
            {site.source}
          </span>
        </div>
        <div className="absolute right-3 top-3 max-w-[70%] rounded-full bg-amber-500/90 px-3 py-1 text-right text-xs font-semibold text-white backdrop-blur">
          {opportunityLabel(site)}
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

        {!verified && (
          <div className="mt-3 rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-[11px] leading-relaxed text-stone-600">
            Public-source opportunity intelligence only. This property is not represented as being for sale unless the owner creates a verified listing.
          </div>
        )}

        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50/70 p-3">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-amber-800"><DollarSign className="h-3.5 w-3.5" /> Indicative opportunity value</div>
          {valuation?.available ? (
            <>
              <div className="mt-1 font-display text-lg font-bold text-amber-950">{formatCompactMoney(valuation.low)}–{formatCompactMoney(valuation.high)}</div>
              <div className="mt-0.5 text-xs text-amber-900/80">{valuation.confidence} confidence · screening estimate</div>
            </>
          ) : (
            <div className="mt-1 text-sm font-semibold text-amber-950">Pricing data pending</div>
          )}
        </div>

        {site.site_images?.length > 0 && (
          <div className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground"><Camera className="h-3.5 w-3.5" /> {site.site_images.length} property photo{site.site_images.length === 1 ? "" : "s"}</div>
        )}

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