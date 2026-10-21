import React, { useEffect, useState } from "react";
import { Layers, Loader2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import USGeologyMap from "@/components/USGeologyMap";
import { useProfessionalAccess } from "@/hooks/useProfessionalAccess";

export default function USGeologyMapPage() {
  const [sites, setSites] = useState([]);
  const [listings, setListings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  // Public page: the map, basemaps, quarry markers and listings are free to view.
  // The premium overlays and geologic-unit detail are locked in place by the map
  // component, which receives the access answer only once it belongs to the
  // identity currently signed in (useProfessionalAccess stamps it with the user id).
  const { hasProfessional, checking } = useProfessionalAccess();
  const locked = !hasProfessional;
  const showUnlockPrompt = !checking && !hasProfessional;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError("");
      try {
        const [publicRes, listingRows] = await Promise.all([
          base44.functions.invoke("get-public-quarry-list", { state: "ALL" }),
          base44.entities.Listing.list("-updated_date", 200).catch(() => []),
        ]);
        if (cancelled) return;
        const publicSites = publicRes?.data?.sites || publicRes?.sites || [];
        setSites(publicSites.filter((s) => s?.id && Number.isFinite(Number(s.latitude)) && Number.isFinite(Number(s.longitude))));
        setListings(listingRows || []);
      } catch (e) {
        if (!cancelled) setError(e?.message || "The geology map could not load its data.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 border-b border-border bg-background/95 shadow-sm backdrop-blur" style={{ paddingTop: "env(safe-area-inset-top, 16px)" }}>
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 pb-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-900 text-slate-50 shadow-sm">
              <Layers className="h-5 w-5" />
            </div>
            <div className="leading-none">
              <p className="font-heading text-base font-bold tracking-tight text-foreground">US Geology Map</p>
              <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">National bedrock · MRDS · quarries</p>
            </div>
          </div>
          <a href="/" className="text-sm font-medium text-muted-foreground hover:text-foreground">← Back to home</a>
        </div>
      </header>

      <section className="mx-auto max-w-7xl px-6 pt-8 pb-4">
        <h1 className="font-heading text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
          National Geology & Mineral Deposit Map
        </h1>
        <p className="mt-3 max-w-3xl text-base leading-relaxed text-muted-foreground">
          {locked
            ? "Explore Southeast quarry sites and verified S&S listings on the national map. Basemaps and quarry markers are free to browse; the USGS geology and mineral-deposit overlays and the click-anywhere geologic-unit lookup are part of Full Quarry Intelligence."
            : "Explore USGS bedrock geology and MRDS mineral deposits across the continental United States, with Southeast quarry sites and verified S&S listings overlaid. Click any location to look up the mapped geologic unit from Macrostrat."}
        </p>
      </section>

      <section className="mx-auto max-w-7xl px-6 pb-12">
        {loading ? (
          <div className="flex h-[640px] items-center justify-center rounded-2xl border border-border bg-muted/30">
            <Loader2 className="h-7 w-7 animate-spin text-muted-foreground" />
          </div>
        ) : error ? (
          <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-8 text-center">
            <p className="text-sm font-medium text-destructive">{error}</p>
          </div>
        ) : (
          <USGeologyMap
            sites={sites}
            listings={listings}
            height={640}
            locked={locked}
            showUnlockPrompt={showUnlockPrompt}
          />
        )}
        <p className="mt-3 text-xs text-muted-foreground">
          Quarry sites show Southeast US data (TN, GA, AL, KY, NC, SC, FL, MS).
          {locked
            ? " Basemaps and quarry markers are public; the geology and mineral-deposit layers unlock with Full Quarry Intelligence."
            : " Geology and MRDS layers are national. Click anywhere on the map for the Macrostrat geologic unit at that point."}
        </p>
      </section>
    </div>
  );
}