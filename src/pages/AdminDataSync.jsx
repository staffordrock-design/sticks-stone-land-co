import React, { useState } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { ArrowLeft, DatabaseZap, RefreshCw, ShieldCheck } from "lucide-react";
import { useAuth } from "@/lib/AuthContext";

export default function AdminDataSync() {
  const { user } = useAuth();
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");

  if (!user || user.role !== "admin") {
    return <div className="min-h-screen bg-background p-10 text-center text-muted-foreground">Admin access required.</div>;
  }

  const syncMsha = async () => {
    setRunning(true);
    setError("");
    setResult(null);
    try {
      const response = await base44.functions.invoke("sync-msha-employment", {});
      setResult(response?.data || response);
    } catch (e) {
      setError(e?.message || "MSHA sync failed.");
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-background/90 backdrop-blur">
        <div className="mx-auto max-w-5xl px-6 py-4">
          <Link to="/" className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" /> Back to marketplace
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-10">
        <div className="mb-8">
          <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Admin Data Operations</p>
          <h1 className="mt-2 font-heading text-3xl font-bold text-foreground">Quarry Intelligence Sync</h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            Refresh public-source intelligence used by Sticks & Stone Land Co. Data is source-labeled and missing values stay blank rather than being guessed.
          </p>
        </div>

        <section className="rounded-2xl border border-border bg-card p-6">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <DatabaseZap className="h-5 w-5 text-amber-700" />
                <h2 className="font-heading text-xl font-bold text-foreground">MSHA Part 50 Employment</h2>
              </div>
              <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">
                Downloads the latest Metal/Nonmetal mine file, matches Tennessee records by MSHA mine ID, and imports quarterly employee hours and average employees. Quarry tonnage is not invented because MSHA Part 50 production tonnage fields are coal-only.
              </p>
            </div>
            <button
              onClick={syncMsha}
              disabled={running}
              className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-stone-900 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
            >
              <RefreshCw className={`h-4 w-4 ${running ? "animate-spin" : ""}`} />
              {running ? "Syncing…" : "Sync MSHA now"}
            </button>
          </div>

          <div className="mt-5 flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-950">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
            <span>Source-backed fields are updated in place using the MSHA file/quarter/mine ID as the unique source key.</span>
          </div>

          {error && <div className="mt-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900">{error}</div>}

          {result && (
            <div className="mt-5 rounded-xl border border-border bg-muted/20 p-5">
              <div className="grid gap-4 sm:grid-cols-4">
                <div><div className="text-xs uppercase tracking-wider text-muted-foreground">Period</div><div className="mt-1 font-bold">{result.year} Q{result.quarter}</div></div>
                <div><div className="text-xs uppercase tracking-wider text-muted-foreground">Matched</div><div className="mt-1 font-bold">{result.matched ?? 0}</div></div>
                <div><div className="text-xs uppercase tracking-wider text-muted-foreground">Created</div><div className="mt-1 font-bold">{result.created ?? 0}</div></div>
                <div><div className="text-xs uppercase tracking-wider text-muted-foreground">Updated</div><div className="mt-1 font-bold">{result.updated ?? 0}</div></div>
              </div>
              {result.note && <p className="mt-4 text-sm text-muted-foreground">{result.note}</p>}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
