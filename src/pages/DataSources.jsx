import React from "react";
import { Link } from "react-router-dom";
import { Database, ShieldCheck, AlertTriangle, RefreshCw, MapPin, FileText, Mountain, Truck, Building2 } from "lucide-react";
import BrandLogo from "@/components/BrandLogo";

const SOURCE_CATEGORIES = [
  {
    icon: Database,
    name: "MSHA (Mine Safety and Health Administration)",
    contributes: "Mine identity, operator names, mine status, inspection records, violation history, employment and production activity signals.",
    refresh: "Synced periodically from MSHA public data services. Records are updated as MSHA publishes new inspection and activity data.",
    limitations: "MSHA records identify mine sites and operators but do not provide parcel boundaries, ownership details or property boundaries. Some records may reflect historical or inactive designations.",
  },
  {
    icon: ShieldCheck,
    name: "State Mining & Environmental Agencies (e.g., TDEC)",
    contributes: "Surface mining permits, NPDES water permits, ARAP permits, permitted acreage, permittee/operator names, permit status, effective and expiration dates.",
    refresh: "Synced from state environmental agency public databases and permit registries. Refresh frequency varies by state agency publication schedule.",
    limitations: "Permit boundaries and acreage may differ from actual parcel boundaries. Permittee names may not match current landowner of record. Some permits may be expired or in transfer.",
  },
  {
    icon: MapPin,
    name: "County GIS / Parcel Records",
    contributes: "Parcel boundaries, parcel IDs, acreage, assessed values, land and improvement values, property addresses and mailing addresses.",
    refresh: "Synced from county GIS and assessor databases where available. Coverage varies by county — not all counties provide public GIS data.",
    limitations: "Parcel data reflects assessor records which may lag deed transfers. Acreage figures are assessor estimates and may differ from surveyed boundaries. Not all counties are covered.",
  },
  {
    icon: FileText,
    name: "Deeds / Ownership Records",
    contributes: "Landowner names, deed book and page references, ownership transfer dates and recorded easements where available.",
    refresh: "Sourced from county register of deeds where digitized records are available. Not all counties provide digitized deed records.",
    limitations: "Ownership data may lag recent transfers. Deed records may not reflect unrecorded agreements, trusts or entity transfers. Independent title verification is recommended for any transaction.",
  },
  {
    icon: Mountain,
    name: "USGS / Geology Datasets",
    contributes: "Rock type, formation name, geologic age, lithology, deposit classification, mineral occurrence data and regional geologic context.",
    refresh: "Synced from USGS MRDS, USGS State Geologic Map Compilation (SGMC) and state geological survey databases.",
    limitations: "Geologic data is regional and may not reflect site-specific conditions. USGS MRDS records may be historical and not reflect current site status. Site-specific geologic investigation is recommended for any acquisition decision.",
  },
  {
    icon: Truck,
    name: "TDOT / Transportation Demand Data",
    contributes: "Aggregate producer plant locations, plant types, regional aggregate demand, transportation project demand and market context.",
    refresh: "Synced from Tennessee Department of Transportation (TDOT) approved producer lists and aggregate demand data where published.",
    limitations: "TDOT data covers Tennessee state transportation demand. Demand figures are state-level and should not be attributed to individual sites. Not all states have equivalent published data.",
  },
  {
    icon: Building2,
    name: "Other Government / Public Datasets",
    contributes: "Environmental records (EPA, NPDES), production estimates, market production context and additional public-source intelligence as available.",
    refresh: "Synced from respective public agency databases and APIs as data is published.",
    limitations: "Coverage varies by source and region. Some datasets are updated infrequently by the source agency.",
  },
];

export default function DataSources() {
  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 border-b border-border bg-background/95 shadow-sm backdrop-blur" style={{ paddingTop: "env(safe-area-inset-top, 16px)" }}>
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 pb-4">
          <Link to="/"><BrandLogo /></Link>
          <Link to="/subscribe" className="inline-flex min-h-10 items-center rounded-xl bg-sky-600 px-4 py-2 text-sm font-bold text-white hover:bg-sky-500">Full Intelligence — $69/mo</Link>
        </div>
      </header>

      <section className="mx-auto max-w-4xl px-6 py-12">
        <div className="mb-8">
          <span className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-xs font-bold uppercase tracking-wider text-slate-700">
            <Database className="h-3.5 w-3.5" /> Transparency
          </span>
          <h1 className="mt-4 font-heading text-3xl font-bold text-foreground sm:text-4xl">Data Sources & Methodology</h1>
          <p className="mt-4 text-base leading-7 text-muted-foreground">
            S&S Rock Holdings organizes public-source and derived intelligence for the quarry, aggregate and mineral-property industries. We connect data from government agencies and public records into a single quarry intelligence platform. This page explains what each source contributes, how it is refreshed, and what limitations apply.
          </p>
          <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
              <div>
                <p className="text-sm font-bold text-amber-900">Important</p>
                <p className="mt-1 text-sm text-amber-800">
                  S&S Rock Holdings organizes public-source intelligence. We do not represent that every property listed is for sale. Source data may require independent verification before any transaction, investment or operational decision.
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          {SOURCE_CATEGORIES.map(({ icon: Icon, name, contributes, refresh, limitations }) => (
            <div key={name} className="rounded-2xl border border-border bg-card p-6 shadow-sm">
              <div className="flex items-start gap-4">
                <div className="rounded-xl bg-slate-900 p-3 text-white shrink-0">
                  <Icon className="h-6 w-6" />
                </div>
                <div className="flex-1">
                  <h2 className="font-heading text-lg font-bold text-foreground">{name}</h2>
                  <div className="mt-3 space-y-3">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-wider text-slate-500">What it contributes</p>
                      <p className="mt-1 text-sm leading-6 text-foreground">{contributes}</p>
                    </div>
                    <div>
                      <p className="text-xs font-bold uppercase tracking-wider text-slate-500"><RefreshCw className="inline h-3 w-3" /> Refresh method</p>
                      <p className="mt-1 text-sm leading-6 text-muted-foreground">{refresh}</p>
                    </div>
                    <div>
                      <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Coverage limitations</p>
                      <p className="mt-1 text-sm leading-6 text-muted-foreground">{limitations}</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-10 rounded-2xl border border-slate-700 bg-slate-950 p-8 text-white">
          <h2 className="font-heading text-xl font-bold">Our Methodology</h2>
          <p className="mt-3 text-sm leading-6 text-slate-300">
            S&S Rock Holdings does not own or control the source data. We organize, connect and present public-source intelligence in a format that helps quarry buyers, sellers, operators, investors and industry professionals make better decisions. Our process:
          </p>
          <ul className="mt-4 space-y-2 text-sm text-slate-300">
            <li className="flex items-start gap-2"><span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-sky-400" /> Collect public-source data from government agencies and public records</li>
            <li className="flex items-start gap-2"><span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-sky-400" /> Link records across sources by mine ID, parcel ID, coordinates and name matching</li>
            <li className="flex items-start gap-2"><span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-sky-400" /> Organize intelligence into quarry-property records with ownership, geology, permits, compliance, production and market context</li>
            <li className="flex items-start gap-2"><span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-sky-400" /> Apply screening and opportunity scoring based on available source coverage</li>
            <li className="flex items-start gap-2"><span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-sky-400" /> Clearly label source dates and flag items requiring independent verification</li>
          </ul>
          <p className="mt-4 text-xs text-slate-400">
            S&S Rock Holdings LLC · ssrockholdings.com · contact@ssrockholdings.com
          </p>
        </div>

        <div className="mt-8 text-center">
          <Link to="/subscribe" className="inline-flex min-h-12 items-center gap-2 rounded-xl bg-sky-600 px-8 py-3 text-sm font-bold text-white shadow-lg hover:bg-sky-500">
            Unlock Full Quarry Intelligence — $69/month
          </Link>
        </div>
      </section>
    </div>
  );
}