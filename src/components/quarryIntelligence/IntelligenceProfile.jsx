import React from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangle, BarChart3, Building2, CheckCircle2, ExternalLink, FileKey2,
  Gauge, Gem, Globe, Landmark, Leaf, LockKeyhole, MapPinned, Mountain,
  ShieldCheck, TrendingUp,
} from "lucide-react";
import IntelligenceSection from "./IntelligenceSection";
import { calculateOpportunityScore, opportunityBandClasses } from "@/utils/opportunityScore";
import { calculateIndicativeQuarryValue, formatCompactMoney } from "@/utils/quarryValuation";

function money(v) {
  if (v == null || v === "") return "—";
  return Number(v).toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}
function dateStr(v) {
  if (!v) return "—";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? String(v) : d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}
function confidenceBadge(c) {
  const cls = c === "High" ? "border-emerald-300 bg-emerald-50 text-emerald-800"
    : c === "Medium" ? "border-sky-300 bg-sky-50 text-sky-800"
    : "border-slate-300 bg-slate-50 text-slate-600";
  return <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold ${cls}`}>{c || "Low"}</span>;
}

function Field({ label, value, source }) {
  return (
    <div className="grid grid-cols-[140px_1fr] gap-3 border-b border-border/50 py-2 last:border-0">
      <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="text-sm text-foreground">
        {value || "—"}
        {source && <span className="ml-2 text-[10px] text-muted-foreground">{source}</span>}
      </div>
    </div>
  );
}

function NotAvailable({ label }) {
  return (
    <div className="rounded-lg border border-dashed border-border bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
      {label || "Data not yet available. S&S imports this from official sources — check back after the next refresh or request an admin import."}
    </div>
  );
}

function compileSources({ site, parcel, geology, permits, environmental, profile, liveParcel }) {
  const sources = [];
  const add = (agency, url, checked, confidence = "Medium") => {
    if (!agency) return;
    sources.push({ agency, url, checked, confidence });
  };
  add(site?.source, site?.source_url, site?.last_source_update, "High");
  add(parcel?.source_name || (liveParcel?.source ? "TN Comptroller IMPACT" : null), parcel?.source_url || liveParcel?.source_url, parcel?.last_source_update || liveParcel?.source_updated, "High");
  add(geology?.source_agency, geology?.source_url, geology?.last_source_update, geology?.confidence || "Medium");
  if (permits?.length) permits.forEach((p) => add("TDEC", p.source_url, p.last_source_update || p.acreage_last_verified, "High"));
  if (environmental?.length) environmental.forEach((r) => add(r.agency || "EPA ECHO", r.source_url, r.last_source_update, "Medium"));
  add(profile ? "S&S Quarry Potential Profile" : null, null, profile?.last_scored, profile?.confidence || "Low");
  // Deduplicate by agency+url
  const seen = new Set();
  return sources.filter((s) => {
    const key = `${s.agency}-${s.url}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export default function IntelligenceProfile({
  site, parcel, liveParcel, geology, permits = [], environmental = [],
  inspections = [], violations = [], profile, production = [], usgsOccurrences = [],
  tdotDemand = [], tdotProducer, nearbySites = [], hasProfessional,
}) {
  if (!site) return null;

  const opportunity = calculateOpportunityScore({ site, parcel: parcel || liveParcel, geology, permits, environmental, profile });
  const valuation = calculateIndicativeQuarryValue({ site, parcel: parcel || liveParcel, profile, geology });
  const sources = compileSources({ site, parcel, liveParcel, geology, permits, environmental, profile });

  const landOwner = parcel?.owner_name || liveParcel?.owner || site.parcel_owner || null;
  const operator = site.operator_name && !/pending|unknown|verify/i.test(site.operator_name) ? site.operator_name : null;
  const controller = site.controller_name || null;
  const permittee = permits?.find((p) => p.permittee_name)?.permittee_name || site.permittee_name || null;
  const primaryPermit = permits?.find((p) => Number(p?.permitted_acres) > 0) || permits?.[0] || null;
  const permittedAcreage = primaryPermit?.permitted_acres ?? site.permitted_acres;
  const parcelAcreage = parcel?.acreage ?? liveParcel?.acreage ?? site.acreage;
  const rockType = geology?.primary_rock || geology?.lithology || site.commodity || null;
  const totalTdotDemand = (tdotDemand || []).reduce((sum, r) => sum + Number(r.quantity || 0), 0);

  return (
    <div className="space-y-5">
      {/* Header summary — always visible */}
      <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-sky-700">Quarry &amp; Land Intelligence</p>
            <h1 className="mt-1 font-heading text-2xl font-bold text-foreground sm:text-3xl">{site.mine_name || "Location Search"}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {[site.county, site.state].filter(Boolean).join(", ") || "Tennessee"}
            </p>
          </div>
          {opportunity && (
            <div className={`rounded-2xl border px-5 py-3 text-center ${opportunityBandClasses(opportunity.band)}`}>
              <div className="text-3xl font-black">{opportunity.score}<span className="text-base font-bold">/100</span></div>
              <div className="text-[10px] font-bold uppercase tracking-wider">{opportunity.band} Opportunity</div>
            </div>
          )}
        </div>
        <div className="mt-5 grid grid-cols-2 gap-4 border-t border-border pt-5 sm:grid-cols-4">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Status</div>
            <div className="mt-1 text-sm font-semibold text-foreground">{site.mine_status || "Not recorded"}</div>
          </div>
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Rock / Geology</div>
            <div className="mt-1 text-sm font-semibold text-foreground">{rockType || "Not mapped"}</div>
          </div>
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Acreage</div>
            <div className="mt-1 text-sm font-semibold text-foreground">
              {Number(parcelAcreage) > 0 ? `${Number(parcelAcreage).toLocaleString()} ac` : "Not available"}
            </div>
          </div>
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">MSHA ID</div>
            <div className="mt-1 text-sm font-semibold text-foreground">{site.msha_mine_id || "Not linked"}</div>
          </div>
        </div>
      </div>

      {hasProfessional ? (
        <>
          {/* OPPORTUNITY SCREEN */}
          <IntelligenceSection title="Opportunity Screen" icon={Gauge} defaultOpen badge="Screening tool — not an appraisal">
            <div className="rounded-xl border border-sky-200 bg-sky-50 p-5">
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-xs font-bold uppercase tracking-wider text-sky-800">S&amp;S Opportunity Score</div>
                  <div className="mt-1 text-3xl font-bold text-sky-950">{opportunity?.score ?? "—"}<span className="text-sm font-semibold text-sky-700">/100</span></div>
                  <div className="mt-1 text-sm font-semibold text-sky-900">{opportunity?.band || "Early"} screening signal</div>
                </div>
                <div className="text-right text-xs leading-5 text-sky-900/80">
                  <div>{opportunity?.connected?.length || 0} source layers connected</div>
                  <div>{opportunity?.violations ? `${opportunity.violations} violation flags` : "No violation flags"}</div>
                </div>
              </div>
              <p className="mt-3 text-xs leading-5 text-sky-900/75">{opportunity?.note}</p>
            </div>
            {profile && (
              <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <div className="rounded-lg border border-border p-3"><div className="text-[10px] font-bold uppercase text-muted-foreground">Geology Score</div><div className="mt-1 text-xl font-bold text-foreground">{profile.geology_score ?? "—"}</div></div>
                <div className="rounded-lg border border-border p-3"><div className="text-[10px] font-bold uppercase text-muted-foreground">Parcel Score</div><div className="mt-1 text-xl font-bold text-foreground">{profile.parcel_score ?? "—"}</div></div>
                <div className="rounded-lg border border-border p-3"><div className="text-[10px] font-bold uppercase text-muted-foreground">Access Score</div><div className="mt-1 text-xl font-bold text-foreground">{profile.access_score ?? "—"}</div></div>
                <div className="rounded-lg border border-border p-3"><div className="text-[10px] font-bold uppercase text-muted-foreground">Regulatory Score</div><div className="mt-1 text-xl font-bold text-foreground">{profile.regulatory_score ?? "—"}</div></div>
                <div className="rounded-lg border border-border p-3"><div className="text-[10px] font-bold uppercase text-muted-foreground">Market Score</div><div className="mt-1 text-xl font-bold text-foreground">{profile.market_score ?? "—"}</div></div>
                <div className="rounded-lg border border-border p-3"><div className="text-[10px] font-bold uppercase text-muted-foreground">Confidence</div><div className="mt-1">{confidenceBadge(profile.confidence)}</div></div>
              </div>
            )}
            {!profile && <NotAvailable label="No quarry-potential profile has been scored for this location yet. S&S scores profiles from connected geology, parcel, permit, access and market data." />}
            <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900">
              <strong>Screening tool only.</strong> This score is not a reserve calculation, professional appraisal, title opinion, or guarantee of commercially recoverable stone. It does not represent that the property is for sale or available.
            </div>
          </IntelligenceSection>

          {/* PROPERTY */}
          <IntelligenceSection title="Property" icon={Landmark}>
            {(parcel || liveParcel || site.parcel_id) ? (
              <div>
                <Field label="Parcel number" value={parcel?.parcel_id || liveParcel?.parcel_id || liveParcel?.parcel_display_id || site.parcel_id} />
                <Field label="Owner" value={landOwner} />
                <Field label="Acreage" value={Number(parcelAcreage) > 0 ? `${Number(parcelAcreage).toLocaleString()} acres` : null} />
                <Field label="Assessed value" value={money(parcel?.assessed_value ?? liveParcel?.assessed_value)} />
                <Field label="Land value" value={money(parcel?.land_value ?? liveParcel?.land_value)} />
                <Field label="Improvement value" value={money(parcel?.improvement_value ?? liveParcel?.improvement_value)} />
                <Field label="County" value={parcel?.county || site.county} />
                <Field label="Property address" value={parcel?.property_address || liveParcel?.situs_address || site.address} />
                <Field label="Mailing address" value={parcel?.mailing_address || liveParcel?.mailing_address} />
                <Field label="Deed reference" value={parcel?.deed_book_page || liveParcel?.deed_book_page} />
                <Field label="Tax year" value={parcel?.tax_year || liveParcel?.tax_year} />
                <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                  <Globe className="h-3.5 w-3.5" />
                  Source: {parcel?.source_name || liveParcel?.source || "County/State parcel records"}
                  {(parcel?.source_url || liveParcel?.source_url) && <a href={parcel?.source_url || liveParcel?.source_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-semibold text-sky-700 hover:underline">Open source <ExternalLink className="h-3 w-3" /></a>}
                  {parcel?.last_source_update && <span>· Checked {dateStr(parcel.last_source_update)}</span>}
                </div>
              </div>
            ) : <NotAvailable label="No parcel record connected. S&S imports Tennessee parcels from the TN Comptroller IMPACT GIS. Tap the map on a property to trigger a live parcel lookup." />}
          </IntelligenceSection>

          {/* GEOLOGY */}
          <IntelligenceSection title="Geology" icon={Gem}>
            {geology ? (
              <div>
                <Field label="Geologic unit" value={geology.geologic_unit} />
                <Field label="Formation" value={geology.formation_name || "Not separately identified in mapped source"} />
                <Field label="Primary rock" value={geology.primary_rock} />
                <Field label="Lithology" value={geology.lithology} />
                <Field label="Geologic age" value={geology.geologic_age} />
                <Field label="Interpretation" value={geology.commodity_interpretation} />
                <Field label="Map-match confidence" value={geology.confidence ? confidenceBadge(geology.confidence) : null} />
                <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                  <Globe className="h-3.5 w-3.5" />
                  Source: {geology.source_agency || "USGS National Geologic Map Database"}
                  {geology.source_url && <a href={geology.source_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-semibold text-sky-700 hover:underline">Open source <ExternalLink className="h-3 w-3" /></a>}
                  {geology.last_source_update && <span>· Checked {dateStr(geology.last_source_update)}</span>}
                </div>
                <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900">
                  <strong>Mapped geology is not a proven reserve.</strong> Rock type and lithology are from mapped surficial/bedrock geology, not from drilling, core sampling, or a reserve study.
                </div>
              </div>
            ) : <NotAvailable label="No mapped geology record connected. S&S imports Tennessee bedrock/lithology from the USGS National Geologic Map Database and Tennessee Geological Survey." />}
          </IntelligenceSection>

          {/* NEARBY USGS MRDS */}
          <IntelligenceSection title="Nearby USGS MRDS Occurrences" icon={Mountain} badge={usgsOccurrences.length ? `${usgsOccurrences.length} found` : undefined}>
            {usgsOccurrences.length ? (
              <div className="space-y-3">
                {usgsOccurrences.slice(0, 8).map((occ) => (
                  <div key={occ.id} className="rounded-lg border border-border p-3">
                    <div className="flex items-start justify-between">
                      <div className="font-semibold text-sm text-foreground">{occ.occurrence_name}</div>
                      {occ.development_status && <span className="rounded-full border border-border bg-muted/30 px-2 py-0.5 text-[10px] font-medium">{occ.development_status}</span>}
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">USGS MRDS · {occ.mrds_id}{occ.distance_meters != null ? ` · ${Number(occ.distance_meters).toLocaleString()} m` : ""}</div>
                    <div className="mt-2 grid gap-1 text-xs sm:grid-cols-2">
                      <div>Commodity: <strong className="text-foreground">{occ.commodity || "—"}</strong></div>
                      <div>Deposit type: <strong className="text-foreground">{occ.deposit_type || "—"}</strong></div>
                      <div>Mineralogy: <strong className="text-foreground">{occ.mineralogy || "—"}</strong></div>
                      <div>Production size: <strong className="text-foreground">{occ.production_size || "—"}</strong></div>
                    </div>
                    {occ.source_url && <a href={occ.source_url} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-sky-700 hover:underline">Open MRDS record <ExternalLink className="h-3 w-3" /></a>}
                  </div>
                ))}
                <p className="text-xs text-muted-foreground">USGS MRDS (Mineral Resources Data System) occurrences matched by proximity. Historical records — not an indication of current activity.</p>
              </div>
            ) : <NotAvailable label="No USGS MRDS occurrences linked. S&S matches MRDS records by proximity to the site coordinates." />}
          </IntelligenceSection>

          {/* MINING & PERMITS */}
          <IntelligenceSection title="Mining & Permits" icon={ShieldCheck} badge={permits.length ? `${permits.length} permit${permits.length === 1 ? "" : "s"}` : undefined}>
            <div>
              <Field label="MSHA Mine ID" value={site.msha_mine_id} />
              <Field label="Mine status" value={site.mine_status} />
              <Field label="Operator" value={operator} />
              <Field label="Controller" value={controller} />
              <Field label="Mine type" value={site.mine_type} />
              <Field label="Commodity" value={site.commodity} />
            </div>
            <div className="mt-4 border-t border-border pt-4">
              <div className="mb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">TDEC Permits</div>
              {permits.length ? permits.map((p) => (
                <div key={p.id} className="mb-3 rounded-lg border border-border p-3 last:mb-0">
                  <div className="font-semibold text-sm text-foreground">{p.permit_number} · {p.permit_type}</div>
                  <div className="mt-1 text-xs text-muted-foreground">{p.status || "Status not loaded"}</div>
                  <div className="mt-2 grid gap-1 text-xs sm:grid-cols-2">
                    <div>Permittee: <strong className="text-foreground">{p.permittee_name || "—"}</strong></div>
                    <div>Landowner: <strong className="text-foreground">{p.landowner_name || "—"}</strong></div>
                    <div>Operator: <strong className="text-foreground">{p.operator_name || "—"}</strong></div>
                    <div>Permitted acres: <strong className="text-foreground">{Number(p.permitted_acres) > 0 ? Number(p.permitted_acres).toLocaleString() : "Not stated by permit"}</strong></div>
                    <div>Effective: <strong className="text-foreground">{dateStr(p.effective_date)}</strong></div>
                    <div>Expires: <strong className="text-foreground">{dateStr(p.expiration_date)}</strong></div>
                  </div>
                  {p.source_url && <a href={p.source_url} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-sky-700 hover:underline">Open TDEC source <ExternalLink className="h-3 w-3" /></a>}
                </div>
              )) : <NotAvailable label="No TDEC permit record connected. S&S imports Tennessee mining permits from TDEC DMGR." />}
            </div>
            <div className="mt-4 border-t border-border pt-4">
              <div className="mb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">MSHA Inspections & Violations</div>
              <div className="grid gap-2 sm:grid-cols-2">
                <div className="rounded-lg border border-border p-3"><div className="text-2xl font-bold text-foreground">{inspections.length}</div><div className="text-xs text-muted-foreground">Inspections on record</div></div>
                <div className="rounded-lg border border-border p-3"><div className="text-2xl font-bold text-foreground">{violations.length}</div><div className="text-xs text-muted-foreground">Violations on record</div></div>
              </div>
              {violations.length > 0 && (
                <div className="mt-2 space-y-1">
                  {violations.slice(0, 5).map((v) => (
                    <div key={v.id} className="rounded-lg border border-border px-3 py-2 text-xs">
                      <div className="font-semibold text-foreground">{v.violation_type || v.action_type || "Violation"}</div>
                      <div className="text-muted-foreground">{dateStr(v.violation_date || v.action_date)} · {v.current_violation_status || v.status || ""}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </IntelligenceSection>

          {/* ENVIRONMENTAL SCREEN */}
          <IntelligenceSection title="Environmental Screen" icon={Leaf} badge={environmental.length ? `${environmental.length} record${environmental.length === 1 ? "" : "s"}` : undefined}>
            {environmental.length ? (
              <div className="space-y-2">
                {environmental.slice(0, 8).map((r) => (
                  <div key={r.id} className="rounded-lg border border-border p-3">
                    <div className="font-semibold text-sm text-foreground">{r.program} · {r.status || r.record_type || "Record"}</div>
                    <div className="mt-1 grid gap-1 text-xs text-muted-foreground sm:grid-cols-2">
                      <div>NPDES: <strong className="text-foreground">{r.npdes_permit_number || "—"}</strong></div>
                      <div>Agency: <strong className="text-foreground">{r.agency || "EPA ECHO"}</strong></div>
                      <div>Violations: <strong className="text-foreground">{r.violation_count ?? 0}</strong></div>
                      <div>Enforcement: <strong className="text-foreground">{r.enforcement_action || "None"}</strong></div>
                      <div>Expires: <strong className="text-foreground">{dateStr(r.expiration_date)}</strong></div>
                      <div>Checked: <strong className="text-foreground">{dateStr(r.last_source_update)}</strong></div>
                    </div>
                    {r.source_url && <a href={r.source_url} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-sky-700 hover:underline">Open ECHO record <ExternalLink className="h-3 w-3" /></a>}
                  </div>
                ))}
              </div>
            ) : <NotAvailable label="No EPA ECHO or NPDES environmental records connected. S&S imports environmental records from EPA ECHO. FEMA flood and USFWS wetland screening will be added when those GIS layers are connected." />}
          </IntelligenceSection>

          {/* ACCESS & MARKET */}
          <IntelligenceSection title="Access & Market" icon={TrendingUp}>
            <div className="space-y-4">
              <div>
                <div className="mb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">Nearby Active Quarries</div>
                {nearbySites.length ? (
                  <div className="space-y-1">
                    {nearbySites.slice(0, 5).map((s) => (
                      <div key={s.id} className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-xs">
                        <span className="font-medium text-foreground">{s.mine_name}</span>
                        <span className="text-muted-foreground">{s.county} · {s.mine_status || "—"}</span>
                      </div>
                    ))}
                  </div>
                ) : <NotAvailable label="No nearby active quarry records found in the loaded working set." />}
              </div>
              <div className="border-t border-border pt-4">
                <div className="mb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">TDOT Aggregate Demand · {site.county} County</div>
                {totalTdotDemand > 0 ? (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                    <div className="text-2xl font-bold text-amber-950">{totalTdotDemand.toLocaleString()} tons</div>
                    <div className="text-xs text-amber-900">Aggregate/stone quantities from TDOT letting documents. This is project demand, not quarry production.</div>
                  </div>
                ) : <NotAvailable label="No TDOT aggregate demand loaded for this county. S&S imports TDOT letting quantities when published." />}
              </div>
              {tdotProducer && (
                <div className="border-t border-border pt-4">
                  <div className="mb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">TDOT Producer Match</div>
                  <div className="rounded-lg border border-sky-200 bg-sky-50 p-3">
                    <div className="font-semibold text-sm text-sky-950">{tdotProducer.producer_name}</div>
                    <div className="text-xs text-sky-900">Code {tdotProducer.producer_code || "—"} · {tdotProducer.status || "Status not listed"}</div>
                  </div>
                </div>
              )}
            </div>
          </IntelligenceSection>

          {/* OWNERSHIP */}
          <IntelligenceSection title="Ownership" icon={Building2}>
            <div>
              <Field label="Parcel owner" value={landOwner} source={parcel?.source_name ? `(from ${parcel.source_name})` : ""} />
              <Field label="MSHA operator" value={operator} source="(from MSHA)" />
              <Field label="Controller" value={controller} source="(from MSHA)" />
              <Field label="Permittee" value={permittee} source="(from TDEC)" />
              <Field label="Permit landowner" value={primaryPermit?.landowner_name} source="(from TDEC)" />
            </div>
            <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900">
              Ownership fields are kept separate by source. Parcel owner comes from the county assessor; operator/controller from MSHA; permittee/landowner from TDEC. These may differ and should be reconciled during title diligence.
            </div>
          </IntelligenceSection>

          {/* SOURCES & CONFIDENCE */}
          <IntelligenceSection title="Sources & Confidence" icon={FileKey2} defaultOpen>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border text-left">
                    <th className="pb-2 pr-3 font-bold uppercase tracking-wider text-muted-foreground">Source Agency</th>
                    <th className="pb-2 pr-3 font-bold uppercase tracking-wider text-muted-foreground">Last Checked</th>
                    <th className="pb-2 pr-3 font-bold uppercase tracking-wider text-muted-foreground">Confidence</th>
                    <th className="pb-2 font-bold uppercase tracking-wider text-muted-foreground">Link</th>
                  </tr>
                </thead>
                <tbody>
                  {sources.length ? sources.map((s, i) => (
                    <tr key={i} className="border-b border-border/50 last:border-0">
                      <td className="py-2 pr-3 font-medium text-foreground">{s.agency}</td>
                      <td className="py-2 pr-3 text-muted-foreground">{dateStr(s.checked)}</td>
                      <td className="py-2 pr-3">{confidenceBadge(s.confidence)}</td>
                      <td className="py-2">{s.url ? <a href={s.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-semibold text-sky-700 hover:underline">Open <ExternalLink className="h-3 w-3" /></a> : "—"}</td>
                    </tr>
                  )) : (
                    <tr><td colSpan={4} className="py-4 text-center text-muted-foreground">No sources connected yet for this location.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="mt-4 rounded-lg border border-border bg-muted/20 p-3 text-xs leading-5 text-muted-foreground">
              <strong className="text-foreground">Source priority:</strong> County/State assessor → TDEC → MSHA → USGS NGMDB → USGS MRDS → EPA ECHO → TDOT → Census → FEMA/USFWS. S&S does not invent missing information. Fields without a connected source show "Data not yet available."
            </div>
          </IntelligenceSection>
        </>
      ) : (
        <div className="rounded-2xl border border-sky-200 bg-sky-50/70 p-7 text-center">
          <LockKeyhole className="mx-auto h-8 w-8 text-slate-800" />
          <h2 className="mt-3 font-heading text-xl font-bold text-slate-950">Full intelligence starts here</h2>
          <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-slate-700">
            The summary above is free. Full Quarry &amp; Land Intelligence unlocks property records, geology, permits, environmental screen, market access, ownership, opportunity scores and source-level confidence for every section.
          </p>
          <Link to={`/subscribe?returnTo=${encodeURIComponent(`/quarry-intelligence`)}`} className="mt-5 inline-flex rounded-xl bg-slate-900 px-5 py-3 text-sm font-bold text-white">
            Unlock Full Access
          </Link>
        </div>
      )}
    </div>
  );
}