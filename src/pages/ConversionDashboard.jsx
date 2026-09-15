import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Loader2, Users, Eye, MousePointerClick, CreditCard, CheckCircle2, TrendingUp, DollarSign, ArrowLeft } from "lucide-react";
import { base44 } from "@/api/base44Client";

function MetricCard({ icon: Icon, label, value, sublabel }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
        <Icon className="h-4 w-4 text-sky-700" />
        {label}
      </div>
      <div className="mt-2 font-heading text-3xl font-bold text-foreground">{value}</div>
      {sublabel && <div className="mt-1 text-xs text-muted-foreground">{sublabel}</div>}
    </div>
  );
}

function ConversionRow({ label, value, color }) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-border bg-muted/30 px-4 py-3">
      <span className="text-sm font-medium text-foreground">{label}</span>
      <span className={`text-sm font-bold ${color || "text-foreground"}`}>{value}%</span>
    </div>
  );
}

function SourceBreakdown({ sources, paidSources }) {
  const sorted = Object.entries(sources || {}).sort((a, b) => b[1] - a[1]);
  if (!sorted.length) return <p className="text-sm text-muted-foreground">No traffic sources recorded yet.</p>;
  return (
    <div className="space-y-2">
      {sorted.map(([source, count]) => (
        <div key={source} className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm">
          <span className="font-medium text-foreground">{source}</span>
          <div className="flex items-center gap-3">
            <span className="text-muted-foreground">{count} visitors</span>
            {paidSources?.[source] > 0 && <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-800">{paidSources[source]} paid</span>}
          </div>
        </div>
      ))}
    </div>
  );
}

function PeriodSection({ title, data }) {
  if (!data) return null;
  return (
    <div className="mb-10">
      <h2 className="mb-4 font-heading text-2xl font-bold text-foreground">{title}</h2>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        <MetricCard icon={Users} label="Visitors" value={data.unique_visitors} />
        <MetricCard icon={Eye} label="Paywall Views" value={data.paywall_viewed} />
        <MetricCard icon={MousePointerClick} label="Subscribe Clicks" value={data.subscribe_clicked} />
        <MetricCard icon={CreditCard} label="Checkout Starts" value={data.checkout_started + data.apple_product_loaded} />
        <MetricCard icon={CheckCircle2} label="Paid Subscribers" value={data.paid_subscribers} />
        <MetricCard icon={DollarSign} label="Revenue" value={`$${data.revenue.toLocaleString()}`} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <div>
          <h3 className="mb-3 font-heading text-lg font-bold text-foreground">Conversion Rates</h3>
          <div className="space-y-2">
            <ConversionRow label="Visitor → Paywall" value={data.conversion?.visitor_to_paywall} color="text-sky-700" />
            <ConversionRow label="Paywall → Subscribe Click" value={data.conversion?.paywall_to_subscribe} color="text-sky-700" />
            <ConversionRow label="Subscribe Click → Checkout" value={data.conversion?.subscribe_to_checkout} color="text-sky-700" />
            <ConversionRow label="Checkout → Paid" value={data.conversion?.checkout_to_paid} color="text-emerald-700" />
            <ConversionRow label="Visitor → Paid (overall)" value={data.conversion?.visitor_to_paid} color="text-emerald-700" />
          </div>
        </div>
        <div>
          <h3 className="mb-3 font-heading text-lg font-bold text-foreground">Traffic Sources</h3>
          <SourceBreakdown sources={data.by_source} paidSources={data.by_source_paid} />
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-lg border border-border bg-muted/20 px-3 py-2 text-xs">
          <span className="font-semibold text-foreground">Homepage views:</span> <span className="text-muted-foreground">{data.homepage_viewed}</span>
        </div>
        <div className="rounded-lg border border-border bg-muted/20 px-3 py-2 text-xs">
          <span className="font-semibold text-foreground">Quarry teaser views:</span> <span className="text-muted-foreground">{data.quarry_teaser_viewed}</span>
        </div>
        <div className="rounded-lg border border-border bg-muted/20 px-3 py-2 text-xs">
          <span className="font-semibold text-foreground">Premium attempts:</span> <span className="text-muted-foreground">{data.premium_intelligence_attempted}</span>
        </div>
        <div className="rounded-lg border border-border bg-muted/20 px-3 py-2 text-xs">
          <span className="font-semibold text-foreground">Apple sheet opened:</span> <span className="text-muted-foreground">{data.apple_purchase_sheet_opened}</span>
        </div>
      </div>
    </div>
  );
}

export default function ConversionDashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await base44.functions.invoke("get-conversion-funnel", {});
        const payload = response?.data || response;
        if (payload?.error) throw new Error(payload.error);
        if (!cancelled) setData(payload);
      } catch (e) {
        if (!cancelled) setError(e?.message || "Failed to load conversion data.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur" style={{ paddingTop: "env(safe-area-inset-top, 16px)" }}>
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 pb-4">
          <Link to="/admin/leads" className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" /> Admin
          </Link>
          <h1 className="font-heading text-xl font-bold text-foreground">Conversion Analytics</h1>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-10">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-7 w-7 animate-spin text-slate-700" />
          </div>
        ) : error ? (
          <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-6 text-center text-destructive">{error}</div>
        ) : data ? (
          <>
            <div className="mb-8 rounded-2xl border border-sky-200 bg-sky-50/60 p-5">
              <div className="flex items-center gap-2 text-sm font-bold text-sky-950">
                <TrendingUp className="h-5 w-5" /> Qualified / Human Traffic
              </div>
              <p className="mt-1 text-xs text-sky-900/80">{data.excluded?.note}</p>
            </div>
            <PeriodSection title="Today" data={data.today} />
            <PeriodSection title="Last 7 Days" data={data.last_7_days} />
            <PeriodSection title="All Time" data={data.all_time} />
          </>
        ) : null}
      </main>
    </div>
  );
}