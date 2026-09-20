import React from "react";
import { Link } from "react-router-dom";
import {
  Lock, MapPin, Building2, Mountain, FileText, Calendar, ShieldCheck,
  TrendingUp, Gem, Landmark, Leaf, Gauge, AlertTriangle, ArrowRight,
  CheckCircle2, Database, Layers,
} from "lucide-react";

const LOCKED_SECTIONS = [
  { icon: Landmark, label: "Detailed ownership intelligence", desc: "Landowner, operator, controller relationships and linked entities" },
  { icon: Building2, label: "Parcel intelligence", desc: "Parcel ID, acreage, tax assessment, GIS boundary and mailing address" },
  { icon: Gem, label: "Geology analysis", desc: "Primary rock, formation, age, lithology and deposit classification" },
  { icon: ShieldCheck, label: "Permit / compliance intelligence", desc: "TDEC permits, MSHA inspections, violations and environmental records" },
  { icon: TrendingUp, label: "Production intelligence", desc: "Reported tonnage, MSHA activity, USGS market context and estimates" },
  { icon: Layers, label: "TDOT / market demand intelligence", desc: "Transportation demand, nearby producer plants and aggregate market context" },
  { icon: Database, label: "Comparable quarry intelligence", desc: "Nearby quarries, comparable operations and regional benchmarking" },
  { icon: Gauge, label: "Opportunity screening", desc: "S&S opportunity score, screening band and diligence checklist" },
  { icon: AlertTriangle, label: "Saved target / watchlist tools", desc: "Save and track quarries, set alerts and monitor data updates" },
];

function formatDate(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

export default function SampleIntelligenceRecord({ bundle }) {
  if (!bundle?.site) return null;

  const { site, geology, parcel, permits = [], environmental = [], profile } = bundle;
  const location = [site.county ? `${site.county}, ` : "", site.state].join("");
  const refreshDate = formatDate(site.last_source_update || site.updated_date);
  const primaryPermit = permits.find((p) => Number(p?.permitted_acres) > 0) || permits[0] || null;

  // Build "Why This Record Matters" findings dynamically from the sample data
  const findings = [];
  if (site.operator_name && !/pending|unknown|verify/i.test(site.operator_name)) {
    findings.push({
      text: `Operator identified as ${site.operator_name}`,
      source: site.source || "MSHA",
      date: refreshDate,
    });
  }
  if (primaryPermit?.permitted_acres) {
    findings.push({
      text: `Permitted acreage: ${Number(primaryPermit.permitted_acres).toLocaleString()} acres (${primaryPermit.permit_type || "mining permit"})`,
      source: primaryPermit.source_url ? "TDEC" : "State permit record",
      date: formatDate(primaryPermit.last_source_update) || refreshDate,
    });
  }
  if (geology?.primary_rock || geology?.lithology) {
    findings.push({
      text: `Primary rock type: ${geology.primary_rock || geology.lithology}${geology.formation_name ? ` (${geology.formation_name})` : ""}`,
      source: geology.source_agency || "USGS / State Geology",
      date: formatDate(geology.last_source_update) || refreshDate,
    });
  }
  if (findings.length === 0 && site.commodity) {
    findings.push({
      text: `Material/commodity: ${site.commodity}`,
      source: site.source || "MSHA",
      date: refreshDate,
    });
  }
  if (findings.length < 3 && site.msha_mine_id) {
    findings.push({
      text: `MSHA Mine ID ${site.msha_mine_id} linked to site`,
      source: "MSHA",
      date: refreshDate,
    });
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-lg">
      {/* Header */}
      <div className="border-b border-border bg-gradient-to-r from-slate-900 to-slate-800 p-6 text-white">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-2 rounded-full bg-emerald-500/20 px-3 py-1 text-xs font-bold uppercase tracking-wider text-emerald-300">
            <CheckCircle2 className="h-3.5 w-3.5" /> Sample Quarry Intelligence Record
          </span>
        </div>
        <h3 className="mt-3 font-heading text-2xl font-bold">{site.mine_name || "Unnamed Quarry Site"}</h3>
        <div className="mt-2 flex items-center gap-1.5 text-sm text-slate-300">
          <MapPin className="h-4 w-4" />
          {location || "Location pending"}
        </div>
      </div>

      {/* Public info section */}
      <div className="p-6">
        <div className="mb-4 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-700">
          <FileText className="h-4 w-4" /> Public Record Information
        </div>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <InfoField label="Quarry / Site Name" value={site.mine_name} />
          <InfoField label="County, State" value={location} />
          <InfoField label="MSHA Mine ID" value={site.msha_mine_id} />
          <InfoField label="Operator" value={site.operator_name} />
          <InfoField label="Acreage" value={site.acreage ? Number(site.acreage).toLocaleString() + " ac" : null} />
          <InfoField label="Material / Rock Type" value={geology?.primary_rock || geology?.lithology || site.commodity} />
          <InfoField label="Permit Number" value={site.tdec_permit_number || primaryPermit?.permit_number} />
          <InfoField label="Permit Type" value={primaryPermit?.permit_type} />
          <InfoField label="Data Source" value={site.source} />
        </div>
        {refreshDate && (
          <div className="mt-4 flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
            <Calendar className="h-3.5 w-3.5" />
            Last intelligence refresh: {refreshDate}
          </div>
        )}
      </div>

      {/* Why This Record Matters */}
      <div className="border-t border-border bg-slate-50/50 p-6">
        <h4 className="font-heading text-lg font-bold text-foreground">Why This Record Matters</h4>
        <p className="mt-1 text-sm text-muted-foreground">S&S organizes public records into useful quarry intelligence. Here's what this record tells us:</p>

        <div className="mt-4 space-y-3">
          {findings.slice(0, 3).map((f, i) => (
            <div key={i} className="flex items-start gap-3 rounded-lg border border-emerald-200 bg-white p-3">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
              <div>
                <p className="text-sm font-medium text-foreground">{f.text}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">Source: {f.source}{f.date ? ` · ${f.date}` : ""}</p>
              </div>
            </div>
          ))}

          <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
            <div>
              <p className="text-sm font-medium text-foreground">Requires verification</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {parcel?.owner_name
                  ? "Parcel ownership should be independently verified with county records — assessor data may lag deed transfers."
                  : "Parcel ownership and exact boundary require verification with county GIS and deed records."}
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3 rounded-lg border border-sky-200 bg-sky-50 p-3">
            <ArrowRight className="mt-0.5 h-4 w-4 shrink-0 text-sky-600" />
            <div>
              <p className="text-sm font-medium text-foreground">Recommended next diligence step</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {primaryPermit?.expiration_date
                  ? `Verify current permit status and review expiration date (${formatDate(primaryPermit.expiration_date) || "date pending"}) with the state regulatory agency.`
                  : "Verify current permit status and boundary with the state regulatory agency before any site visit or offer."}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Locked intelligence sections */}
      <div className="border-t border-border p-6">
        <div className="mb-4 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-700">
          <Lock className="h-4 w-4" /> Full Intelligence — Locked
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          {LOCKED_SECTIONS.map(({ icon: Icon, label, desc }) => (
            <div key={label} className="flex items-start gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
              <div className="mt-0.5 rounded-md bg-slate-200 p-1.5">
                <Icon className="h-3.5 w-3.5 text-slate-500" />
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-slate-700">{label}</span>
                  <Lock className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                </div>
                <p className="mt-0.5 text-xs text-slate-500">{desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* CTA */}
      <div className="border-t border-border bg-slate-950 p-6 text-center">
        <Link to="/subscribe" className="inline-flex min-h-12 items-center gap-2 rounded-xl bg-sky-600 px-8 py-3 text-sm font-bold text-white shadow-lg transition hover:bg-sky-500">
          <TrendingUp className="h-4 w-4" /> Unlock Full Quarry Intelligence — $69/month
        </Link>
        <p className="mt-3 text-xs text-slate-400">Cancel anytime. No account required to subscribe on web. Full database access for paid members only.</p>
      </div>
    </div>
  );
}

function InfoField({ label, value }) {
  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm font-semibold text-foreground">{value || "—"}</p>
    </div>
  );
}