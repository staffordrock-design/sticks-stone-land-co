import React from "react";
import { Link } from "react-router-dom";
import { Building2, Layers, TrendingUp, FileSearch, ArrowRight } from "lucide-react";

const PATHS = [
  {
    icon: Building2,
    title: "Find Quarry Opportunities",
    description: "Browse quarry properties and off-market targets by location, rock type, operating status, acreage and source records.",
    cta: "Find Opportunities",
    to: "/#quarry-intelligence",
  },
  {
    icon: Layers,
    title: "List a Quarry Property",
    description: "Submit an operating quarry, aggregate business, mineral interest or quarry-capable property for review.",
    cta: "List a Property",
    to: "/sell",
  },
  {
    icon: TrendingUp,
    title: "Map & Research",
    description: "Explore quarry locations, geology, permits and nearby market signals in one property-focused view.",
    cta: "Open the Map",
    to: "/mineral-intelligence",
  },
  {
    icon: FileSearch,
    title: "Request Property Research",
    description: "Request deeper due diligence on a quarry, land parcel, operator or potential acquisition.",
    cta: "Request Research",
    to: "/get-started?mode=report",
  },
];

export default function AudiencePaths() {
  return (
    <section className="mx-auto max-w-7xl px-6 py-14">
      <div className="mb-8 text-center">
        <h2 className="font-heading text-2xl font-bold text-foreground sm:text-3xl">Quarry Real Estate, Built for Decisions</h2>
        <p className="mt-2 max-w-2xl mx-auto text-sm text-muted-foreground">Search opportunities, compare property facts, map the land, save targets and connect with sellers from one focused marketplace.</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {PATHS.map(({ icon: Icon, title, description, cta, to }) => (
          <Link
            key={title}
            to={to}
            className="group flex flex-col rounded-2xl border border-border bg-card p-6 shadow-sm transition hover:shadow-lg hover:-translate-y-1"
          >
            <div className="flex items-center justify-between">
              <div className="rounded-xl bg-slate-900 p-3 text-white">
                <Icon className="h-6 w-6" />
              </div>
              <ArrowRight className="h-5 w-5 text-muted-foreground transition group-hover:translate-x-1 group-hover:text-sky-600" />
            </div>
            <h3 className="mt-4 font-heading text-lg font-bold text-foreground">{title}</h3>
            <p className="mt-2 flex-1 text-sm leading-6 text-muted-foreground">{description}</p>
            <div className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-xl bg-slate-100 px-4 py-2 text-sm font-bold text-slate-900 transition group-hover:bg-sky-600 group-hover:text-white">
              {cta}
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}