import React, { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, BadgeCheck, Droplets, MapPin, Route, Ruler } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { Image } from "@/components/ui/image";
import AppLoadingScreen from "@/components/AppLoadingScreen";
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
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm font-bold text-foreground">{value}</p>
    </div>
  );
}

export default function LandPropertyDetail() {
  const { id } = useParams();
  const [property, setProperty] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const record = await base44.entities.LandProperty.get(id);
        if (!cancelled) setProperty(record || null);
      } catch (error) {
        console.error("Land listing load failed", error);
        if (!cancelled) setProperty(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [id]);

  useEffect(() => {
    document.title = property
      ? `${property.title} | S&S Rock Holdings`
      : "Land Listing | S&S Rock Holdings";
  }, [property]);

  useEffect(() => {
    if (loading || property) return undefined;
    const tag = document.createElement("meta");
    tag.setAttribute("name", "prerender-status-code");
    tag.setAttribute("content", "404");
    document.head.appendChild(tag);
    return () => { document.head.removeChild(tag); };
  }, [loading, property]);

  if (loading) return <AppLoadingScreen message="Loading land listing…" />;

  if (!property) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-20 text-center">
        <h1 className="font-heading text-2xl font-bold text-foreground">Listing not found</h1>
        <p className="mt-2 text-sm text-muted-foreground">This property may have sold or been removed from the marketplace.</p>
        <Link to="/" className="mt-6 inline-flex min-h-11 items-center rounded-xl bg-slate-900 px-5 text-sm font-bold text-white">
          Browse the map
        </Link>
      </div>
    );
  }

  const acres = formatAcreage(property.acreage);
  const price = formatPrice(property.asking_price);
  const perAcre = formatPricePerAcre(property);
  const features = Array.isArray(property.features) ? property.features : [];
  const uses = Array.isArray(property.use_types) ? property.use_types : [];

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card" style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}>
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link to="/" className="inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" /> Back to the map
          </Link>
          <Link to="/sell" className="text-sm font-semibold text-emerald-800 hover:underline">List land</Link>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-8">
        {property.primary_image && (
          <div className="mb-6 h-64 overflow-hidden rounded-2xl border border-border sm:h-80">
            <Image src={property.primary_image} alt={property.title} fittingType="fill" className="h-full w-full" />
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <span className={"rounded-full px-3 py-1 text-xs font-bold " + landStatusStyle(property.status)}>{property.status}</span>
          <span className={"rounded-full px-3 py-1 text-xs font-bold " + landTypeStyle(property.property_type)}>{property.property_type}</span>
          {property.is_example && (
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-700">Example listing</span>
          )}
        </div>

        <h1 className="mt-4 font-heading text-3xl font-black leading-tight text-foreground sm:text-4xl">{property.title}</h1>
        <p className="mt-2 flex items-center gap-1.5 text-sm text-muted-foreground">
          <MapPin className="h-4 w-4" />
          {[property.city, property.county ? property.county + " County" : null, property.state].filter(Boolean).join(", ")}
        </p>

        <div className="mt-6 flex flex-wrap items-end gap-6 rounded-2xl border border-border bg-card p-5">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Asking price</p>
            <p className="font-heading text-2xl font-bold text-foreground">{price || "Call for price"}</p>
          </div>
          {perAcre && (
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Per acre</p>
              <p className="text-lg font-bold text-foreground">{perAcre}</p>
            </div>
          )}
          {acres && (
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Acreage</p>
              <p className="text-lg font-bold text-foreground">{acres}</p>
            </div>
          )}
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Fact label="Mineral rights" value={property.mineral_rights} />
          <Fact label="Water" value={property.water_features} />
          <Fact label="Access" value={property.road_frontage} />
          <Fact label="Listing source" value={property.listing_source} />
        </div>

        {property.description && (
          <section className="mt-8">
            <h2 className="font-heading text-xl font-bold text-foreground">About this property</h2>
            <p className="mt-3 whitespace-pre-line text-sm leading-7 text-muted-foreground">{property.description}</p>
          </section>
        )}

        {uses.length > 0 && (
          <section className="mt-8">
            <h2 className="font-heading text-xl font-bold text-foreground">Best uses</h2>
            <div className="mt-3 flex flex-wrap gap-2">
              {uses.map((use) => (
                <span key={use} className="rounded-full border border-border bg-card px-3 py-1.5 text-xs font-semibold text-foreground">
                  {use}
                </span>
              ))}
            </div>
          </section>
        )}

        {features.length > 0 && (
          <section className="mt-8">
            <h2 className="font-heading text-xl font-bold text-foreground">Highlights</h2>
            <ul className="mt-3 grid gap-2 sm:grid-cols-2">
              {features.map((feature) => (
                <li key={feature} className="flex items-start gap-2 rounded-xl border border-border bg-card p-3 text-sm text-foreground">
                  <BadgeCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" />
                  {feature}
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="mt-10 rounded-2xl border border-emerald-200 bg-emerald-50 p-6">
          <h2 className="font-heading text-lg font-bold text-emerald-950">Interested in this property?</h2>
          <p className="mt-1 text-sm text-emerald-900">
            S&amp;S Rock Holdings handles questions, showings and offers for every land listing on the marketplace.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Link to="/due-diligence" className="inline-flex min-h-11 items-center rounded-xl bg-emerald-800 px-5 text-sm font-bold text-white hover:bg-emerald-900">
              Request information
            </Link>
            <Link to="/sell" className="inline-flex min-h-11 items-center rounded-xl border border-emerald-300 bg-white px-5 text-sm font-bold text-emerald-900">
              List your own land
            </Link>
          </div>
        </section>

        <div className="mt-6 flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
          {property.water_features && <span className="inline-flex items-center gap-1.5"><Droplets className="h-3.5 w-3.5" />{property.water_features}</span>}
          {property.road_frontage && <span className="inline-flex items-center gap-1.5"><Route className="h-3.5 w-3.5" />{property.road_frontage}</span>}
          {acres && <span className="inline-flex items-center gap-1.5"><Ruler className="h-3.5 w-3.5" />{acres}</span>}
        </div>
        <p className="mt-4 text-xs leading-5 text-muted-foreground">
          Listing information is supplied by the seller and organized by S&amp;S Rock Holdings. Acreage, boundary, price, mineral rights and access should be independently verified before purchase.
        </p>
      </main>
    </div>
  );
}