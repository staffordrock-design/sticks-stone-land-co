import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { ArrowLeft, Building2, Plus, Loader2, MapPin, Layers, Ruler } from "lucide-react";

const STATUS_STYLES = {
  Submitted: "bg-slate-100 text-slate-800 border border-slate-300",
  Reviewing: "bg-amber-100 text-amber-900 border border-amber-300",
  Approved: "bg-emerald-100 text-emerald-900 border border-emerald-300",
  Marketing: "bg-sky-100 text-sky-900 border border-sky-300",
  "Under Offer": "bg-indigo-100 text-indigo-900 border border-indigo-300",
  Closed: "bg-stone-200 text-stone-800 border border-stone-300",
  Declined: "bg-red-100 text-red-900 border border-red-300",
};

const PIPELINE = ["Submitted", "Reviewing", "Approved", "Marketing", "Under Offer", "Closed"];

export default function SellerPortal() {
  const { user } = useAuth();
  const [subs, setSubs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.id) { setLoading(false); return; }
    base44.entities.SellerSubmission.filter({ user_id: user.id }, "-submitted_at", 100)
      .then((d) => setSubs(d || []))
      .finally(() => setLoading(false));
  }, [user?.id]);

  if (!user?.id) {
    return <div className="min-h-screen p-10 text-center text-muted-foreground">Sign in to view your submissions.</div>;
  }

  const money = (v) => (v != null ? Number(v).toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 }) : "—");

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur" style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}>
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 pb-4">
          <Link to="/" className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" /> Marketplace</Link>
          <Link to="/sell" className="inline-flex items-center gap-2 rounded-xl bg-stone-900 px-4 py-2 text-sm font-semibold text-white"><Plus className="h-4 w-4" /> Submit property</Link>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-10">
        <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Seller Portal</p>
        <h1 className="mt-2 font-heading text-3xl font-bold">My Property Submissions</h1>
        <p className="mt-3 max-w-2xl text-sm text-muted-foreground">Track the review status of properties you've submitted. Approved properties move into the S&S marketing pipeline and the live marketplace map.</p>

        {loading ? (
          <div className="flex items-center gap-2 py-16 text-sm text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /> Loading your submissions…</div>
        ) : subs.length === 0 ? (
          <div className="mt-8 rounded-2xl border border-dashed border-border p-16 text-center">
            <Building2 className="mx-auto h-10 w-10 text-muted-foreground" />
            <h2 className="mt-4 font-heading text-xl font-bold">No submissions yet</h2>
            <p className="mt-2 text-sm text-muted-foreground">Submit a quarry, aggregate, or mineral property for S&S review.</p>
            <Link to="/sell" className="mt-6 inline-flex items-center gap-2 rounded-xl bg-stone-900 px-5 py-3 text-sm font-semibold text-white"><Plus className="h-4 w-4" /> Submit your first property</Link>
          </div>
        ) : (
          <div className="mt-8 space-y-4">
            {subs.map((s) => {
              const stepIndex = PIPELINE.indexOf(s.status);
              return (
                <div key={s.id} className="rounded-2xl border border-border bg-card p-5">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-heading text-lg font-bold text-foreground">{s.property_name}</h3>
                        <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_STYLES[s.status] || STATUS_STYLES.Submitted}`}>{s.status}</span>
                      </div>
                      <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground"><MapPin className="h-3.5 w-3.5" />{[s.county, s.state].filter(Boolean).join(", ") || "—"}</p>
                    </div>
                    <div className="text-right text-sm">
                      <p className="text-xs uppercase tracking-wider text-muted-foreground">Asking</p>
                      <p className="font-display text-lg font-bold text-foreground">{money(s.asking_price)}</p>
                    </div>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2 text-xs">
                    <span className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-1 text-muted-foreground"><Layers className="h-3 w-3" />{s.asset_type}</span>
                    {s.commodity && <span className="rounded-md bg-muted px-2 py-1 text-muted-foreground">{s.commodity}</span>}
                    {s.acreage != null && <span className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-1 text-muted-foreground"><Ruler className="h-3 w-3" />{Number(s.acreage).toLocaleString()} ac</span>}
                  </div>

                  {s.status !== "Declined" && stepIndex >= 0 && (
                    <div className="mt-5">
                      <div className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                        {PIPELINE.map((p, i) => (
                          <span key={p} className={i <= stepIndex ? "text-foreground" : ""}>{p}</span>
                        ))}
                      </div>
                      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                        <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${((stepIndex + 1) / PIPELINE.length) * 100}%` }} />
                      </div>
                    </div>
                  )}

                  {s.submitted_at && <p className="mt-4 text-xs text-muted-foreground">Submitted {new Date(s.submitted_at).toLocaleDateString()}</p>}
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}