import React, { useState } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { ArrowLeft, FileText, Landmark, Loader2 } from "lucide-react";
import CourthouseDisclaimer from "@/components/courthouse/CourthouseDisclaimer";
import DeedSearchForm from "@/components/courthouse/DeedSearchForm";
import DeedChainTimeline from "@/components/courthouse/DeedChainTimeline";
import CourthouseRelatedRecords from "@/components/courthouse/CourthouseRelatedRecords";
import DeedUploadPanel from "@/components/courthouse/DeedUploadPanel";

const EMPTY_FILTERS = { county: "", parcel_id: "", name: "", book: "", page: "" };

export default function CourthouseRecords() {
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [results, setResults] = useState([]);
  const [searched, setSearched] = useState(false);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState(null);
  const [chain, setChain] = useState({ deeds: [], plats: [], surveys: [] });
  const [chainLoading, setChainLoading] = useState(false);
  const [message, setMessage] = useState("");

  const loadChain = async ({ deed_id, parcel_id }) => {
    setChainLoading(true);
    try {
      const response = await base44.functions.invoke("courthouse-records", { operation: "chain", deed_id, parcel_id });
      const payload = response?.data ?? response;
      if (payload?.error) throw new Error(payload.error);
      setChain({ deeds: payload?.deeds || [], plats: payload?.plats || [], surveys: payload?.surveys || [] });
    } catch (error) {
      setMessage(error?.message || "Could not load the chain of title.");
      setChain({ deeds: [], plats: [], surveys: [] });
    } finally {
      setChainLoading(false);
    }
  };

  const runSearch = async (activeFilters) => {
    const query = activeFilters || filters;
    setSearching(true); setMessage("");
    setSelected(null); setChain({ deeds: [], plats: [], surveys: [] });
    try {
      const response = await base44.functions.invoke("courthouse-records", { operation: "search", ...query });
      const payload = response?.data ?? response;
      if (payload?.error) throw new Error(payload.error);
      const deeds = payload?.deeds || [];
      setResults(deeds); setSearched(true);
      if (deeds.length) {
        setSelected(deeds[0]);
        await loadChain({ deed_id: deeds[0].id, parcel_id: deeds[0].parcel_ids || "" });
      }
    } catch (error) {
      setMessage(error?.message || "Search failed.");
      setResults([]); setSearched(true);
    } finally {
      setSearching(false);
    }
  };

  const selectDeed = async (deed) => {
    setSelected(deed);
    setChain({ deeds: [], plats: [], surveys: [] });
    await loadChain({ deed_id: deed.id, parcel_id: deed.parcel_ids || "" });
  };

  const resetSearch = () => {
    setFilters(EMPTY_FILTERS);
    setResults([]); setSearched(false); setSelected(null);
    setChain({ deeds: [], plats: [], surveys: [] });
    setMessage("");
  };

  const handleDeedSaved = async (record) => {
    const nextFilters = { ...EMPTY_FILTERS, county: filters.county, parcel_id: record.parcel_ids || filters.parcel_id };
    setFilters(nextFilters);
    await runSearch(nextFilters);
  };

  return (
    <div className="min-h-screen bg-background pb-24">
      <header className="border-b border-border">
        <div className="mx-auto max-w-7xl px-6 py-4">
          <Link to="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground"><ArrowLeft className="h-4 w-4" />Back to marketplace</Link>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-10">
        <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">S&amp;S Rock Holdings · Courthouse Records</p>
        <h1 className="mt-2 flex items-center gap-3 font-heading text-3xl font-bold"><Landmark className="h-7 w-7 text-sky-700" />Courthouse Records</h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground">Search recorded deeds by county, parcel, party or book/page, review a chain-of-title timeline, and keep plats and surveys with the parcels they describe. Deed data here is machine-derived from uploaded documents and is never marked verified.</p>

        <div className="mt-6"><CourthouseDisclaimer /></div>

        <section className="mt-8 rounded-2xl border border-border bg-card p-6">
          <h2 className="font-heading text-xl font-bold">Search deeds</h2>
          <DeedSearchForm filters={filters} onChange={setFilters} onSearch={() => runSearch()} onReset={resetSearch} loading={searching} />
        </section>

        {message && <p role="status" className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">{message}</p>}

        <section className="mt-8">
          <h2 className="font-heading text-xl font-bold">Deeds{searched && !searching ? ` (${results.length})` : ""}</h2>
          {searching ? (
            <p role="status" className="mt-4 flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Searching the deed library…</p>
          ) : !searched ? (
            <p className="mt-4 rounded-2xl border border-dashed border-border p-6 text-sm text-muted-foreground">Search by county, parcel ID, grantor/grantee, or book/page to list recorded deeds.</p>
          ) : results.length === 0 ? (
            <p className="mt-4 rounded-2xl border border-dashed border-border p-6 text-sm text-muted-foreground">No deeds match this search yet. Upload a deed below to start the library.</p>
          ) : (
            <ul className="mt-4 grid gap-3 sm:grid-cols-2">
              {results.map((deed) => (
                <li key={deed.id}>
                  <button
                    type="button"
                    onClick={() => selectDeed(deed)}
                    className={`w-full rounded-xl border p-4 text-left transition ${selected?.id === deed.id ? "border-sky-700 bg-sky-50" : "border-border bg-card hover:bg-muted/40"}`}
                  >
                    <p className="text-sm font-bold text-foreground">{deed.grantors || "Unknown grantor"} → {deed.grantees || "Unknown grantee"}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {[deed.county ? `${deed.county} County` : null, deed.state, deed.book ? `Book ${deed.book}` : null, deed.page ? `Page ${deed.page}` : null, deed.recording_date ? `Recorded ${deed.recording_date}` : null].filter(Boolean).join(" · ") || "No recording details"}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">{[deed.document_type, deed.parcel_ids ? `Parcels ${deed.parcel_ids}` : null].filter(Boolean).join(" · ")}</p>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        {selected && (
          <section className="mt-8 rounded-2xl border border-border bg-card p-6">
            <h2 className="flex items-center gap-2 font-heading text-xl font-bold"><FileText className="h-5 w-5 text-sky-700" /> Chain of title</h2>
            <p className="mt-2 text-sm text-muted-foreground">{selected.parcel_ids ? `Parcel(s) ${selected.parcel_ids}` : "No parcel ID recorded on the selected deed."} · ordered oldest to newest</p>
            {chainLoading ? (
              <p role="status" className="mt-4 flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Building the timeline…</p>
            ) : (
              <DeedChainTimeline deeds={chain.deeds} />
            )}
          </section>
        )}

        {selected && !chainLoading && (
          <div className="mt-8">
            <CourthouseRelatedRecords
              plats={chain.plats}
              surveys={chain.surveys}
              defaultParcelId={selected.parcel_ids || ""}
              onAttached={() => loadChain({ deed_id: selected.id, parcel_id: selected.parcel_ids || "" })}
            />
          </div>
        )}

        <div className="mt-8"><DeedUploadPanel onSaved={handleDeedSaved} /></div>
      </main>
    </div>
  );
}