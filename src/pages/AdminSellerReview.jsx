import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { ArrowLeft, Loader2, Check, X, Eye } from "lucide-react";

export default function AdminSellerReview() {
  const { user } = useAuth();
  const [subs, setSubs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState("");
  const [openId, setOpenId] = useState("");

  useEffect(() => {
    base44.entities.SellerSubmission.list("-submitted_at", 200)
      .then((d) => setSubs(d || []))
      .finally(() => setLoading(false));
  }, []);

  const setStatus = async (id, status) => {
    setUpdating(id);
    const prevSub = subs.find((s) => s.id === id);
    if (!prevSub) return;
    setSubs((curr) => curr.map((s) => (s.id === id ? { ...s, status } : s)));
    try {
      await base44.entities.SellerSubmission.update(id, { status });
    } catch {
      setSubs((curr) => curr.map((s) => (s.id === id ? { ...s, status: prevSub.status } : s)));
    } finally {
      setUpdating("");
    }
  };

  if (user?.role !== "admin") {
    return <div className="min-h-screen p-10 text-center text-muted-foreground">Admin access required.</div>;
  }

  const money = (v) => (v != null ? Number(v).toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 }) : "—");

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur" style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}>
        <div className="mx-auto max-w-6xl px-6 pb-4"><Link to="/" className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" /> Marketplace</Link></div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-10">
        <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Admin</p>
        <h1 className="mt-2 font-heading text-3xl font-bold">Seller Submission Review</h1>
        <p className="mt-3 max-w-2xl text-sm text-muted-foreground">Review seller-submitted properties. Approve to move them into the S&S marketing pipeline and the live marketplace map.</p>

        {loading ? (
          <div className="flex items-center gap-2 py-16 text-sm text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /> Loading submissions…</div>
        ) : subs.length === 0 ? (
          <div className="mt-8 rounded-2xl border border-dashed border-border p-16 text-center text-muted-foreground">No seller submissions yet.</div>
        ) : (
          <div className="mt-8 space-y-3">
            {subs.map((s) => (
              <div key={s.id} className="rounded-2xl border border-border bg-card p-5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-heading text-lg font-bold text-foreground">{s.property_name}</h3>
                      <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-semibold text-foreground">{s.status}</span>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">{[s.county, s.state].filter(Boolean).join(", ")} · {s.asset_type} · {money(s.asking_price)}{s.acreage != null ? ` · ${Number(s.acreage).toLocaleString()} ac` : ""}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{s.seller_name || s.seller_email} {s.company ? `· ${s.company}` : ""}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button onClick={() => setOpenId(openId === s.id ? "" : s.id)} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-semibold"><Eye className="h-3.5 w-3.5" /> Details</button>
                    {s.status !== "Reviewing" && <button onClick={() => setStatus(s.id, "Reviewing")} disabled={!!updating} className="rounded-lg bg-amber-100 px-3 py-2 text-xs font-semibold text-amber-900 disabled:opacity-50">Mark Reviewing</button>}
                    {s.status !== "Approved" && <button onClick={() => setStatus(s.id, "Approved")} disabled={!!updating} className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"><Check className="h-3.5 w-3.5" /> Approve</button>}
                    {s.status !== "Declined" && <button onClick={() => setStatus(s.id, "Declined")} disabled={!!updating} className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"><X className="h-3.5 w-3.5" /> Decline</button>}
                  </div>
                </div>

                {openId === s.id && (
                  <div className="mt-4 grid gap-4 border-t border-border pt-4 text-sm sm:grid-cols-2">
                    <Detail label="Commodity" value={s.commodity} />
                    <Detail label="Acreage" value={s.acreage != null ? Number(s.acreage).toLocaleString() : null} />
                    <Detail label="Asking price" value={money(s.asking_price)} />
                    <Detail label="Submitted" value={s.submitted_at ? new Date(s.submitted_at).toLocaleString() : null} />
                    <div className="sm:col-span-2"><span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Ownership summary</span><p className="mt-1 text-foreground">{s.ownership_summary || "—"}</p></div>
                    <div className="sm:col-span-2"><span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Public description</span><p className="mt-1 whitespace-pre-line text-foreground">{s.description || "—"}</p></div>
                    <div className="sm:col-span-2"><span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Confidential notes</span><p className="mt-1 whitespace-pre-line text-foreground">{s.confidential_notes || "—"}</p></div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

function Detail({ label, value }) {
  return <div><span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</span><p className="mt-1 text-foreground">{value || "—"}</p></div>;
}