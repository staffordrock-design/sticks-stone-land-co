import React, { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import ParcelMap from "@/components/ParcelMap";
import NdaGate from "@/components/NdaGate";
import ParcelRecords from "@/components/ParcelRecords";
import DealActions from "@/components/DealActions";
import { Mountain, MapPin, ArrowLeft, Layers, Ruler, FileBadge, Coins } from "lucide-react";

const tierStyles = {
  Quarry: "bg-stone-900 text-stone-50",
  Aggregate: "bg-sky-100 text-sky-900 border border-sky-300",
  "Mineral Rights": "bg-emerald-100 text-emerald-900 border border-emerald-300",
  Royalty: "bg-indigo-100 text-indigo-900 border border-indigo-300",
};

export default function ListingDetail() {
  const { id } = useParams();
  const [listing, setListing] = useState(null);
  const [loading, setLoading] = useState(true);
  const [parcelData, setParcelData] = useState(null);
  const [parcelLoading, setParcelLoading] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const data = await base44.entities.Listing.get(id);
        setListing(data);
      } catch (e) {
        /* ignore */
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  useEffect(() => {
    if (!listing?.lat || !listing?.lng) return;
    let active = true;
    (async () => {
      setParcelLoading(true);
      try {
        const res = await base44.functions.invoke("fetch-parcel-data", {
          lat: listing.lat,
          lng: listing.lng,
        });
        if (active) setParcelData(res.data);
      } catch (e) {
        /* ignore */
      } finally {
        if (active) setParcelLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [listing?.id]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-stone-200 border-t-stone-800" />
      </div>
    );
  }

  if (!listing) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-32 text-center">
        <h1 className="font-heading text-2xl font-bold text-foreground">Parcel not found</h1>
        <Link to="/" className="mt-4 inline-block text-sm text-sky-700 underline">
          Back to marketplace
        </Link>
      </div>
    );
  }

  const specs = [
    { icon: Ruler, label: "Acreage", value: `${Number(listing.acreage).toLocaleString()} acres` },
    { icon: MapPin, label: "Location", value: `${listing.county ? listing.county + ", " : ""}${listing.state}` },
    { icon: Layers, label: "Zoning", value: listing.zoning || "—" },
    { icon: FileBadge, label: "Mineral Rights", value: listing.mineral_rights },
    { icon: Coins, label: "Royalty Terms", value: listing.royalty_terms || "—" },
  ];

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <Link to="/" className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-stone-900 text-stone-50">
              <Mountain className="h-5 w-5" />
            </div>
            <span className="font-heading text-base font-bold tracking-tight text-foreground">
              S&amp;S Rock Holdings
            </span>
          </Link>
          <Link
            to="/"
            className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" /> Marketplace
          </Link>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-6 py-10">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <span
              className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold tracking-wide ${
                tierStyles[listing.tier] || "bg-stone-100 text-stone-800"
              }`}
            >
              {listing.tier}
            </span>
            <h1 className="mt-3 font-heading text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
              {listing.title}
            </h1>
            <p className="mt-2 flex items-center gap-1.5 text-muted-foreground">
              <MapPin className="h-4 w-4" />
              {listing.location_name || `${listing.county}, ${listing.state}`}
            </p>
          </div>
          <div className="rounded-2xl border border-border bg-card px-6 py-4 text-right">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">Asking Price</p>
            <p className="font-display text-3xl font-bold text-foreground">
              ${Number(listing.asking_price).toLocaleString()}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">{listing.status}</p>
          </div>
        </div>

        {/* Image */}
        {listing.primary_image && (
          <div className="mt-8 overflow-hidden rounded-2xl border border-border">
            <img
              src={listing.primary_image}
              alt={listing.title}
              className="h-72 w-full object-cover sm:h-96"
            />
          </div>
        )}

        {/* Map + specs */}
        <div className="mt-10 grid gap-8 lg:grid-cols-5">
          <div className="lg:col-span-3">
            <h2 className="mb-3 font-heading text-xl font-bold text-foreground">
              Parcel Boundary (GIS)
            </h2>
            <ParcelMap
              lat={listing.lat}
              lng={listing.lng}
              polygon={parcelData?.boundary?.length ? parcelData.boundary : listing.polygon_boundary}
              height={400}
            />
            <p className="mt-2 text-xs text-muted-foreground">
              {parcelData?.boundary?.length
                ? "Official parcel boundary from Regrid (register of deeds / tax map). Centroid marker shown for reference."
                : "Interactive polygon reflects recorded boundary survey. Centroid marker shown for reference."}
            </p>
          </div>

          <div className="lg:col-span-2">
            <h2 className="mb-3 font-heading text-xl font-bold text-foreground">Parcel Specifications</h2>
            <div className="divide-y divide-border rounded-2xl border border-border bg-card">
              {specs.map((s) => (
                <div key={s.label} className="flex items-center gap-3 px-5 py-4">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                    <s.icon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs uppercase tracking-wider text-muted-foreground">
                      {s.label}
                    </p>
                    <p className="truncate font-medium text-foreground">{s.value}</p>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-6">
              <ParcelRecords data={parcelData} loading={parcelLoading} />
            </div>
          </div>
        </div>

        {/* Description */}
        {listing.description && (
          <div className="mt-10 rounded-2xl border border-border bg-card p-8">
            <h2 className="mb-3 font-heading text-xl font-bold text-foreground">Overview</h2>
            <p className="whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
              {listing.description}
            </p>
          </div>
        )}

        <DealActions listing={listing} />

        {/* Seller-provided confidential due diligence */}
        <div className="mt-10">
          <h2 className="mb-2 font-heading text-xl font-bold text-foreground">
            Seller Confidential Data Room
          </h2>
          <p className="mb-4 max-w-3xl text-sm leading-relaxed text-muted-foreground">
            Separate from S&S Quarry Intelligence. This area contains only confidential documents actually supplied by the seller, owner, operator, or their professional advisers. Availability varies by listing.
          </p>
          <NdaGate listing={listing} />
        </div>
      </div>
    </div>
  );
}