import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import ListingCard from "@/components/ListingCard";
import ParcelMap from "@/components/ParcelMap";
import { Search, Mountain, Layers, ShieldCheck, TrendingUp } from "lucide-react";

const TIERS = ["All", "Quarry", "Aggregate", "Mineral Rights", "Royalty"];

export default function Home() {
  const [listings, setListings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [tier, setTier] = useState("All");

  useEffect(() => {
    (async () => {
      try {
        const data = await base44.entities.Listing.list("-created_date", 50);
        setListings(data);
      } catch (e) {
        /* ignore */
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const filtered = listings.filter((l) => {
    const matchesTier = tier === "All" || l.tier === tier;
    const q = query.toLowerCase();
    const matchesQuery =
      !q ||
      l.title?.toLowerCase().includes(q) ||
      l.state?.toLowerCase().includes(q) ||
      l.county?.toLowerCase().includes(q);
    return matchesTier && matchesQuery;
  });

  const featured = listings.filter((l) => l.featured).slice(0, 1)[0];

  return (
    <div className="min-h-screen bg-background">
      {/* Top bar */}
      <header className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-stone-900 text-stone-50">
              <Mountain className="h-5 w-5" />
            </div>
            <div className="leading-none">
              <p className="font-heading text-base font-bold tracking-tight text-foreground">
                Sticks &amp; Stone
              </p>
              <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                Land Co.
              </p>
            </div>
          </div>
          <nav className="hidden items-center gap-8 text-sm text-muted-foreground sm:flex">
            <span className="font-medium text-foreground">Marketplace</span>
            <span className="cursor-default">How it works</span>
            <span className="cursor-default">For Sellers</span>
          </nav>
          <div className="text-sm font-medium text-foreground">Sign in</div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden border-b border-border bg-gradient-to-br from-stone-900 via-stone-800 to-amber-900/80 text-stone-50">
        <div className="mx-auto max-w-7xl px-6 py-20 sm:py-28">
          <div className="max-w-2xl">
            <span className="inline-flex items-center gap-2 rounded-full border border-amber-300/30 bg-amber-100/10 px-3 py-1 text-xs font-medium uppercase tracking-wider text-amber-200">
              <Layers className="h-3.5 w-3.5" />
              Industrial Land &amp; Mineral Marketplace
            </span>
            <h1 className="mt-6 font-heading text-4xl font-bold leading-tight tracking-tight sm:text-6xl">
              Where quarry, aggregate &amp; mineral land changes hands.
            </h1>
            <p className="mt-5 max-w-xl text-base text-stone-300 sm:text-lg">
              A GIS-mapped marketplace built for the extraction industry —
              polygon-tracked parcels, NDA-gated data rooms, and royalty-grade
              due diligence, all in one place.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-6 text-sm text-stone-300">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-amber-300" />
                NDA-gated data rooms
              </div>
              <div className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-amber-300" />
                Royalty &amp; mineral rights
              </div>
              <div className="flex items-center gap-2">
                <Layers className="h-4 w-4 text-amber-300" />
                GIS boundary tracking
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Featured parcel with map */}
      {featured && (
        <section className="mx-auto max-w-7xl px-6 py-14">
          <div className="mb-6 flex items-end justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                Featured Parcel
              </p>
              <h2 className="mt-1 font-heading text-2xl font-bold text-foreground">
                {featured.title}
              </h2>
            </div>
          </div>
          <div className="grid gap-6 lg:grid-cols-2">
            <ParcelMap
              lat={featured.lat}
              lng={featured.lng}
              polygon={featured.polygon_boundary}
              height={420}
            />
            <div className="flex flex-col justify-center rounded-2xl border border-border bg-card p-8">
              <span className="inline-flex w-fit items-center rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-900">
                {featured.tier}
              </span>
              <h3 className="mt-4 font-heading text-2xl font-bold text-foreground">
                {featured.location_name || `${featured.county}, ${featured.state}`}
              </h3>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                {featured.description}
              </p>
              <div className="mt-6 grid grid-cols-3 gap-4 border-t border-border pt-6">
                <div>
                  <p className="text-xs uppercase tracking-wider text-muted-foreground">Acreage</p>
                  <p className="mt-1 font-display text-lg font-bold text-foreground">
                    {Number(featured.acreage).toLocaleString()}
                  </p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wider text-muted-foreground">Zoning</p>
                  <p className="mt-1 font-display text-sm font-semibold text-foreground">
                    {featured.zoning || "—"}
                  </p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wider text-muted-foreground">Asking</p>
                  <p className="mt-1 font-display text-lg font-bold text-foreground">
                    ${Number(featured.asking_price).toLocaleString()}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Marketplace */}
      <section className="mx-auto max-w-7xl px-6 pb-24">
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="font-heading text-2xl font-bold text-foreground">
            Available Parcels
          </h2>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by title, state, or county…"
                className="w-full rounded-lg border border-input bg-card py-2 pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-ring sm:w-64"
              />
            </div>
            <div className="flex flex-wrap gap-1.5">
              {TIERS.map((t) => (
                <button
                  key={t}
                  onClick={() => setTier(t)}
                  className={`rounded-full px-3.5 py-1.5 text-xs font-medium transition ${
                    tier === t
                      ? "bg-stone-900 text-stone-50"
                      : "border border-border bg-card text-muted-foreground hover:bg-muted"
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
        </div>

        {loading ? (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {[...Array(6)].map((_, i) => (
              <div
                key={i}
                className="h-72 animate-pulse rounded-2xl border border-border bg-muted/40"
              />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border p-16 text-center text-muted-foreground">
            No parcels match your search.
          </div>
        ) : (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((l) => (
              <ListingCard key={l.id} listing={l} />
            ))}
          </div>
        )}
      </section>

      <footer className="border-t border-border bg-stone-50">
        <div className="mx-auto max-w-7xl px-6 py-8 text-center text-sm text-muted-foreground">
          Sticks &amp; Stone Land Co. — Industrial land &amp; mineral marketplace
        </div>
      </footer>
    </div>
  );
}