import React, { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { ArrowLeft, BarChart3, Building2, CheckCircle2, Clock, Eye, FileKey2, Loader2, MapPin, Plus, ShieldCheck, XCircle } from "lucide-react";
import PullToRefresh from "@/components/PullToRefresh";

const REQUEST_STATUS_STYLES = {
  "Requested": "bg-slate-100 text-slate-800 border border-slate-300",
  "Qualification Review": "bg-amber-100 text-amber-900 border border-amber-300",
  "NDA Required": "bg-indigo-100 text-indigo-900 border border-indigo-300",
  "Approved": "bg-emerald-100 text-emerald-900 border border-emerald-300",
  "Declined": "bg-red-100 text-red-900 border border-red-300",
  "Expired": "bg-stone-100 text-stone-800 border border-stone-300",
};

const money = (v) => v != null ? Number(v).toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 }) : "—";

export default function SellerDashboard() {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionLoading, setActionLoading] = useState("");

  const loadData = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    setError("");
    try {
      const response = await base44.functions.invoke("get-seller-dashboard", {});
      const result = response?.data || response;
      if (result?.error) throw new Error(result.error);
      setData(result);
    } catch (e) {
      setError(e?.message || "Unable to load dashboard.");
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id) { setLoading(false); return; }
    loadData();
  }, [user?.id, loadData]);

  const handleRequestAction = async (requestId, action) => {
    setActionLoading(`${requestId}-${action}`);
    try {
      const newStatus = action === "approve" ? "Approved" : "Declined";
      await base44.entities.DataRoomRequest.update(requestId, {
        status: newStatus,
        decided_at: new Date().toISOString(),
      });
      await loadData();
    } catch (e) {
      setError(e?.message || `Unable to ${action} request.`);
    } finally {
      setActionLoading("");
    }
  };

  if (!user?.id) {
    return <div className="min-h-screen p-10 text-center text-muted-foreground">Sign in to view your seller dashboard.</div>;
  }

  const summary = data?.summary || {};
  const performance = data?.performance || [];
  const activeRequests = data?.active_requests || [];
  const allRequests = data?.all_requests || [];

  return (
    <PullToRefresh onRefresh={loadData}>
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur" style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}>
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 pb-4">
          <Link to="/seller-portal" className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" /> My Submissions</Link>
          <Link to="/sell" className="inline-flex items-center gap-2 rounded-xl bg-stone-900 px-4 py-2 text-sm font-semibold text-white"><Plus className="h-4 w-4" /> Submit property</Link>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-10">
        <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Seller Dashboard</p>
        <h1 className="mt-2 font-heading text-3xl font-bold">Property Performance &amp; Data Room Monitor</h1>
        <p className="mt-3 max-w-2xl text-sm text-muted-foreground">Track how your listed properties are performing and manage buyer data room access requests in one place.</p>

        {loading ? (
          <div className="flex items-center gap-2 py-16 text-sm text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /> Loading dashboard…</div>
        ) : error ? (
          <div className="mt-8 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900">{error}</div>
        ) : (
          <>
            {/* Summary stats */}
            <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
              {[
                { label: "Properties", value: summary.total_properties || 0, icon: Building2 },
                { label: "Total views", value: summary.total_views || 0, icon: Eye },
                { label: "Data room requests", value: summary.total_data_room_requests || 0, icon: FileKey2 },
                { label: "Pending requests", value: summary.pending_requests || 0, icon: Clock },
              ].map(({ label, value, icon: Icon }) => (
                <div key={label} className="rounded-2xl border border-border bg-card p-5">
                  <Icon className="h-5 w-5 text-sky-700" />
                  <div className="mt-3 font-heading text-2xl font-bold text-foreground">{value}</div>
                  <div className="mt-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</div>
                </div>
              ))}
            </div>

            {/* Active data room requests */}
            <section className="mt-10">
              <div className="mb-4 flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-sky-700" />
                <h2 className="font-heading text-xl font-bold">Active Data Room Access Requests</h2>
                {activeRequests.length > 0 && <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-900">{activeRequests.length} pending</span>}
              </div>
              {activeRequests.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">No pending data room access requests. When buyers request access to your confidential data rooms, they will appear here for review.</div>
              ) : (
                <div className="space-y-3">
                  {activeRequests.map((r) => (
                    <div key={r.id} className="rounded-2xl border border-border bg-card p-5">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <h3 className="font-heading text-base font-bold text-foreground">{r.opportunity_title || "Data room request"}</h3>
                            <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${REQUEST_STATUS_STYLES[r.status] || REQUEST_STATUS_STYLES.Requested}`}>{r.status}</span>
                          </div>
                          {r.buyer_company && <p className="mt-1 text-sm text-muted-foreground">{r.buyer_company}</p>}
                          {r.purpose && <p className="mt-1 text-sm text-muted-foreground">{r.purpose}</p>}
                          <div className="mt-2 flex flex-wrap gap-2 text-xs">
                            {r.nda_agreed && <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-1 text-emerald-800"><CheckCircle2 className="h-3 w-3" /> NDA agreed</span>}
                            {r.requested_at && <span className="rounded-md bg-muted px-2 py-1 text-muted-foreground">Requested {new Date(r.requested_at).toLocaleDateString()}</span>}
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <button onClick={() => handleRequestAction(r.id, "approve")} disabled={!!actionLoading} className="inline-flex min-h-11 items-center gap-1.5 rounded-xl bg-emerald-700 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-800 disabled:opacity-50">
                            {actionLoading === `${r.id}-approve` ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                            Approve
                          </button>
                          <button onClick={() => handleRequestAction(r.id, "decline")} disabled={!!actionLoading} className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-red-300 bg-red-50 px-4 py-2 text-sm font-bold text-red-800 hover:bg-red-100 disabled:opacity-50">
                            {actionLoading === `${r.id}-decline` ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
                            Decline
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* Property performance */}
            <section className="mt-10">
              <div className="mb-4 flex items-center gap-2">
                <BarChart3 className="h-5 w-5 text-sky-700" />
                <h2 className="font-heading text-xl font-bold">Property Performance</h2>
              </div>
              {performance.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-border p-10 text-center">
                  <Building2 className="mx-auto h-10 w-10 text-muted-foreground" />
                  <h3 className="mt-4 font-heading text-lg font-bold">No properties yet</h3>
                  <p className="mt-2 text-sm text-muted-foreground">Submit a property to start tracking performance.</p>
                  <Link to="/sell" className="mt-6 inline-flex items-center gap-2 rounded-xl bg-stone-900 px-5 py-3 text-sm font-semibold text-white"><Plus className="h-4 w-4" /> Submit your first property</Link>
                </div>
              ) : (
                <div className="space-y-4">
                  {performance.map((p) => (
                    <div key={p.submission_id} className="rounded-2xl border border-border bg-card p-5">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <h3 className="font-heading text-lg font-bold text-foreground">{p.property_name}</h3>
                          <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground"><MapPin className="h-3.5 w-3.5" />{[p.county, p.state].filter(Boolean).join(", ") || "—"}</p>
                        </div>
                        <div className="text-right text-sm">
                          <p className="text-xs uppercase tracking-wider text-muted-foreground">Asking</p>
                          <p className="font-display text-lg font-bold text-foreground">{money(p.asking_price)}</p>
                        </div>
                      </div>
                      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                        {[
                          { label: "Views", value: p.views || 0, icon: Eye },
                          { label: "DR requests", value: p.data_room_requests || 0, icon: FileKey2 },
                          { label: "Access granted", value: p.data_room_accesses_granted || 0, icon: ShieldCheck },
                          { label: "NDAs signed", value: p.ndas_signed || 0, icon: CheckCircle2 },
                        ].map(({ label, value, icon: Icon }) => (
                          <div key={label} className="rounded-xl border border-border bg-muted/30 p-3">
                            <Icon className="h-4 w-4 text-muted-foreground" />
                            <div className="mt-1.5 font-display text-lg font-bold text-foreground">{value}</div>
                            <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{label}</div>
                          </div>
                        ))}
                      </div>
                      {p.pending_requests > 0 && (
                        <div className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-900">
                          <Clock className="h-3.5 w-3.5" />
                          {p.pending_requests} pending request{p.pending_requests === 1 ? "" : "s"}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* Request history */}
            {allRequests.length > 0 && (
              <section className="mt-10">
                <h2 className="mb-4 font-heading text-xl font-bold">Request History</h2>
                <div className="overflow-x-auto rounded-2xl border border-border">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50 text-xs uppercase tracking-wider text-muted-foreground">
                      <tr>
                        <th className="px-4 py-3 text-left">Property</th>
                        <th className="px-4 py-3 text-left">Buyer</th>
                        <th className="px-4 py-3 text-left">Status</th>
                        <th className="px-4 py-3 text-left">Requested</th>
                        <th className="px-4 py-3 text-left">Decided</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {allRequests.map((r) => (
                        <tr key={r.id} className="hover:bg-muted/30">
                          <td className="px-4 py-3 font-medium text-foreground">{r.opportunity_title || "—"}</td>
                          <td className="px-4 py-3 text-muted-foreground">{r.buyer_company || "—"}</td>
                          <td className="px-4 py-3"><span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${REQUEST_STATUS_STYLES[r.status] || REQUEST_STATUS_STYLES.Requested}`}>{r.status}</span></td>
                          <td className="px-4 py-3 text-muted-foreground">{r.requested_at ? new Date(r.requested_at).toLocaleDateString() : "—"}</td>
                          <td className="px-4 py-3 text-muted-foreground">{r.decided_at ? new Date(r.decided_at).toLocaleDateString() : "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            )}
          </>
        )}
      </main>
    </div>
    </PullToRefresh>
  );
}