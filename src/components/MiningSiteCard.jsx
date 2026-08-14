import React from "react";
import { Link } from "react-router-dom";
import { MapPin, Mountain, ArrowUpRight, BadgeCheck, Camera, Gem, ShieldCheck } from "lucide-react";
import { classifyRock } from "../../base44/shared/rockTypes.js";

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
  "County GIS": "bg-sky-100 text-sky-900 border border-sky-300",
  "Register of Deeds": "bg-indigo-100 text-indigo-900 border border-indigo-300",
  Other: "bg-stone-100 text-stone-800 border border-stone-300",
};

function recordStatusLabel(site) {
  if (site.is_verified_listing && site.listing_id) return "Verified Listing";
  const s = String(site.mine_status || "").toLowerCase();
  if (s.includes("intermittent") || s.includes("temporarily idled") || s.includes("nonproducing") || s.includes("non-producing") || s.includes("inactive")) return "Inactive / Idled Record";
  if (s.includes("historical") || s.includes("abandon")) return "Historical Record";
  if (s.includes("new mine")) return "New Mine Record";
  if (s.includes("active")) return "Active Mine Record";
  return "Mine Record";
}

function displayDate(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

export default function MiningSiteCard({ site, valuation, geology }) {
  const rockClass = geology ? classifyRock(geology.primary_rock || geology.lithology) : null;
  const rockChip = geology?.primary_rock || geology?.lithology || site.commodity;
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
        <div className="absolute right-3 top-3 max-w-[70%] rounded-full bg-slate-900/85 px-3 py-1 text-right text-xs font-semibold text-white backdrop-blur">
          {recordStatusLabel(site)}
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
          {site.opportunity_availability && (
            <span className="rounded-md border border-sky-200 bg-sky-50 px-2 py-0.5 text-xs font-semibold text-sky-900">{site.opportunity_availability}</span>
          )}
          {site.opportunity_score != null && (
            <span className="rounded-md border border-border bg-card px-2 py-0.5 text-xs font-semibold text-foreground">Opportunity {Number(site.opportunity_score).toFixed(0)}/100 · {site.opportunity_band || "Screening"}</span>
          )}
          {rockChip && (
            <span className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-slate-50 px-2 py-0.5 text-xs font-semibold text-slate-700">
              <Gem className="h-3 w-3" />
              {rockChip}
              {geology?.geologic_age ? ` · ${geology.geologic_age}` : ""}
            </span>
          )}
          {rockClass?.category && (
            <span className="rounded-md bg-stone-800 px-2 py-0.5 text-xs font-semibold text-stone-50">
              {rockClass.category}
            </span>
          )}
          {site.commodity && site.commodity !== rockChip && (
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
            Public-source mine intelligence. This record does not mean the property is for sale, available, or controlled by S&S.
          </div>
        )}

        <div className="mt-4 rounded-xl border border-slate-300 bg-slate-100/70 p-3">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-700"><ShieldCheck className="h-3.5 w-3.5" /> Source record</div>
          <div className="mt-1 text-sm font-semibold text-slate-900">{site.msha_mine_id ? `MSHA Mine ID ${site.msha_mine_id}` : site.tdec_permit_number ? `TDEC ${site.tdec_permit_number}` : site.source}</div>
          <div className="mt-0.5 text-xs text-slate-600">{displayDate(site.last_source_update || site.updated_date) ? `Checked ${displayDate(site.last_source_update || site.updated_date)}` : "Source date not yet verified"}</div>
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