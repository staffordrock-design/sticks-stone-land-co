import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, CheckCircle2, FileText, Loader2, ShieldAlert } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";

function fmt(value) {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleString();
}

export default function AdminReports() {
  const { user } = useAuth();
  const [orders, setOrders] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [deliveries, setDeliveries] = useState([]);
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (user?.role !== "admin") { setLoading(false); return; }
    (async () => {
      try {
        const [o, j, d, r] = await Promise.all([
          base44.entities.IntelligenceReportOrder.list("-requested_at", 100),
          base44.entities.ReportGenerationJob.list("-created_date", 100),
          base44.entities.ReportDelivery.list("-delivered_at", 100),
          base44.entities.ReportReview.list("-created_date", 100),
        ]);
        setOrders(o || []); setJobs(j || []); setDeliveries(d || []); setReviews(r || []);
      } catch (e) { setError(e?.message || "Unable to load report operations."); }
      finally { setLoading(false); }
    })();
  }, [user?.role]);

  const summary = useMemo(() => ({
    total: orders.length,
    ready: orders.filter((o) => ["Ready", "Delivered"].includes(o.status)).length,
    processing: orders.filter((o) => ["Requested", "Pending Payment", "Processing"].includes(o.status)).length,
    failed: jobs.filter((j) => j.status === "Failed").length,
  }), [orders, jobs]);

  if (user?.role !== "admin") return <div className="min-h-screen p-10 text-center text-muted-foreground">Admin access required.</div>;
  if (loading) return <div className="min-h-screen p-10 text-center text-muted-foreground"><Loader2 className="mx-auto h-6 w-6 animate-spin" /></div>;

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border"><div className="mx-auto max-w-7xl px-6 py-4"><Link to="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground"><ArrowLeft className="h-4 w-4" />Back to marketplace</Link></div></header>
      <main className="mx-auto max-w-7xl px-6 py-10">
        <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Operations</p>
        <h1 className="mt-2 font-heading text-3xl font-bold">Report Queue</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">Customer report generation, source snapshots, delivery and review status in one place.</p>
        {error && <div className="mt-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div>}

        <div className="mt-8 grid gap-4 sm:grid-cols-4">
          <div className="rounded-2xl border border-border bg-card p-5"><div className="text-xs uppercase text-muted-foreground">Recent reports</div><div className="mt-2 text-3xl font-bold">{summary.total}</div></div>
          <div className="rounded-2xl border border-border bg-card p-5"><div className="text-xs uppercase text-muted-foreground">Ready / delivered</div><div className="mt-2 flex items-center gap-2 text-3xl font-bold"><CheckCircle2 className="h-6 w-6 text-emerald-600" />{summary.ready}</div></div>
          <div className="rounded-2xl border border-border bg-card p-5"><div className="text-xs uppercase text-muted-foreground">In process</div><div className="mt-2 text-3xl font-bold">{summary.processing}</div></div>
          <div className="rounded-2xl border border-border bg-card p-5"><div className="text-xs uppercase text-muted-foreground">Failed jobs</div><div className="mt-2 flex items-center gap-2 text-3xl font-bold"><ShieldAlert className="h-6 w-6 text-red-600" />{summary.failed}</div></div>
        </div>

        <div className="mt-8 overflow-hidden rounded-2xl border border-border bg-card">
          <div className="border-b border-border px-5 py-4 font-heading text-lg font-bold">Latest report orders</div>
          <div className="overflow-x-auto"><table className="w-full min-w-[900px] text-left text-sm"><thead className="bg-muted/40 text-xs uppercase text-muted-foreground"><tr><th className="px-5 py-3">Report</th><th className="px-5 py-3">Customer</th><th className="px-5 py-3">Type</th><th className="px-5 py-3">Status</th><th className="px-5 py-3">Job</th><th className="px-5 py-3">Delivery</th><th className="px-5 py-3">Review</th><th className="px-5 py-3">Requested</th></tr></thead><tbody>
            {orders.map((o) => {
              const job = jobs.find((j) => j.report_order_id === o.id);
              const delivery = deliveries.find((d) => d.report_order_id === o.id);
              const review = reviews.find((r) => r.report_order_id === o.id);
              return <tr key={o.id} className="border-t border-border/70"><td className="px-5 py-4"><div className="flex items-start gap-2"><FileText className="mt-0.5 h-4 w-4 text-amber-700" /><div><div className="font-semibold">{o.site_name || "Unnamed site"}</div><div className="mt-1 text-xs text-muted-foreground">{o.id}</div></div></div></td><td className="px-5 py-4">{o.customer_email || "—"}</td><td className="px-5 py-4">{o.report_type}</td><td className="px-5 py-4 font-semibold">{o.status}</td><td className="px-5 py-4">{job?.status || "—"}{job?.error_message ? <div className="mt-1 max-w-xs text-xs text-red-700">{job.error_message}</div> : null}</td><td className="px-5 py-4">{delivery ? `${delivery.delivery_method} · ${fmt(delivery.delivered_at)}` : "—"}</td><td className="px-5 py-4">{review?.review_status || "Not required"}</td><td className="px-5 py-4">{fmt(o.requested_at)}</td></tr>;
            })}
            {!orders.length && <tr><td colSpan={8} className="px-5 py-12 text-center text-muted-foreground">No customer reports have been generated yet.</td></tr>}
          </tbody></table></div>
        </div>
      </main>
    </div>
  );
}
