import React from "react";
import { Link } from "react-router-dom";
import { MapPin, Mountain, ArrowUpRight, BadgeCheck, Camera, Gem, ShieldCheck, Gauge, Landmark, Leaf } from "lucide-react";
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

export default function MiningSiteCard({ site, valuation, geology, parcel, permits = [], environmental = [], opportunity, emphasizeOpportunity = false }) {
  const rockClass = geology ? classifyRock(geology.primary_rock || geology.lithology) : null;
  const rockChip = geology?.primary_rock || geology?.lithology || site.commodity;
  const location = [site.county ? `${site.county}, ` : "", site.state].join("");
  const verified = site.is_verified_listing && site.listing_id;
  const aerialPreview = worldImageryTile(site.latitude, site.longitude);
  const heroImage = site.site_images?.[0] || aerialPreview;
  const heroLabel = site.site_images?.[0] ? "Property photo" : aerialPreview ? "Aerial location preview" : null;
  const showOpportunity = Boolean(opportunity) && (emphasizeOpportunity || ["New / Potential", "Inactive / Idled"].includes(opportunity.status));
  const owner = parcel?.owner_name || site.parcel_owner;
  const parcelAcreage = parcel?.acreage ?? site.acreage;
  const primaryPermit = permits.find((p) => Number(p?.permitted_acres) > 0) || permits[0] || null;
  const permitOperator = primaryPermit?.operator_name && !/pending|unknown|verify|requires verification/i.test(primaryPermit.operator_name) ? primaryPermit.operator_name : null;
  const operator = permitOperator || site.operator_name;
  const permittedAcreage = primaryPermit?.permitted_acres ?? site.permitted_acres;
  const regulatoryLabel = permits.length
    ? `${permits.length} permit${permits.length === 1 ? "" : "s"}`
    : site.tdec_permit_number || site.npdes_permit_number
      ? "Permit linked"
      : "Permit pending";

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

        {showOpportunity && (
          <div className="mt-4 rounded-xl border border-sky-200 bg-sky-50/70 p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.14em] text-sky-800">
                <Gauge className="h-4 w-4" /> S&amp;S Opportunity Score
              </div>
              <div className="text-right">
                <div className="text-2xl font-bold text-sky-950">{opportunity.score}<span className="text-xs font-semibold text-sky-700">/100</span></div>
                <div className="text-[10px] font-bold uppercase tracking-wider text-sky-700">{opportunity.band}</div>
              </div>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
              <div className="rounded-lg border border-sky-100 bg-white/80 p-2">
                <div className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-slate-500"><Gem className="h-3 w-3" /> Rock</div>
                <div className="mt-1 line-clamp-2 font-semibold text-slate-900">{opportunity.rock || "Geology pending"}</div>
              </div>
              <div className="rounded-lg border border-sky-100 bg-white/80 p-2">
                <div className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-slate-500"><Landmark className="h-3 w-3" /> Owner / Parcel</div>
                <div className="mt-1 line-clamp-2 font-semibold text-slate-900">{owner && !/pending|unknown|verify/i.test(owner) ? owner : opportunity.parcelId || "Parcel pending"}</div>
              </div>
              <div className="rounded-lg border border-sky-100 bg-white/80 p-2">
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Permitted acres</div>
                <div className="mt-1 font-semibold text-slate-900">{Number(permittedAcreage) > 0 ? Number(permittedAcreage).toLocaleString() : "Permit record pending"}</div>
              </div>
              <div className="rounded-lg border border-sky-100 bg-white/80 p-2">
                <div className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-slate-500"><Leaf className="h-3 w-3" /> Regulatory</div>
                <div className="mt-1 font-semibold text-slate-900">{regulatoryLabel}{environmental.length ? ` · ${environmental.length} env.` : ""}</div>
              </div>
            </div>
            <p className="mt-3 text-[10px] leading-4 text-sky-900/70">Source-linked screening signal only. Not an appraisal, reserve estimate, title opinion or sale recommendation.</p>
          </div>
        )}

        <div className="mt-3 flex flex-wrap gap-1.5">
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
          <div className="mt-0.5 text-xs text-slate-600">{displayDate(site.last_source_update) ? `Source checked ${displayDate(site.last_source_update)}` : "Source date not yet verified"}</div>
        </div>

        {site.site_images?.length > 0 && (
          <div className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground"><Camera className="h-3.5 w-3.5" /> {site.site_images.length} property photo{site.site_images.length === 1 ? "" : "s"}</div>
        )}

        <div className="mt-4 grid grid-cols-3 gap-3 border-t border-border pt-4">
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Land owner</p>
            <p className="mt-1 line-clamp-2 font-display text-xs font-semibold text-foreground">{owner || "Owner pending"}</p>
            {Number(parcelAcreage) > 0 && <p className="mt-1 text-[10px] text-muted-foreground">Parcel: {Number(parcelAcreage).toLocaleString()} ac</p>}
          </div>
          <div className="min-w-0 border-l border-border pl-3">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Operator</p>
            <p className="mt-1 line-clamp-2 font-display text-xs font-semibold text-foreground">{operator || "Operator pending"}</p>
          </div>
          <div className="min-w-0 border-l border-border pl-3 text-right">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Permitted acres</p>
            <p className="mt-1 font-display text-base font-bold text-foreground">{Number(permittedAcreage) > 0 ? Number(permittedAcreage).toLocaleString() : "—"}</p>
            <p className="mt-1 text-[10px] text-muted-foreground">{primaryPermit?.acreage_basis || site.permitted_acres_basis || "TDEC acreage pending"}</p>
          </div>
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