import React, { useEffect, useState } from "react";
import { Eye, Users, Bookmark, MessageSquare, FileText, TrendingUp, Loader2 } from "lucide-react";
import { base44 } from "@/api/base44Client";

export default function ListingViewsDashboard({ user }) {
  const [listings, setListings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = async () => {
    if (!user?.id) { setLoading(false); return; }
    try {
      const res = await base44.functions.invoke("get-seller-listing-views", {});
      const data = res?.data || res || {};
      if (data.error) throw new Error(data.error);
      setListings(data.listings || []);
    } catch (e) {
      setError(e?.message || "Could not load view data.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [user?.id]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading interest data…
      </div>
    );
  }

  if (error) {
    return <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">{error}</div>;
  }

  if (listings.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
        No live listing views yet. Once your submitted property is approved and published on the marketplace map, viewer interest will appear here.
      </div>
    );
  }

  const totalViews = listings.reduce((sum, l) => sum + (l.total_views || 0), 0);
  const totalUnique = listings.reduce((sum, l) => sum + (l.unique_viewers || 0), 0);
  const totalSaves = listings.reduce((sum, l) => sum + (l.saves || 0), 0);
  const totalInquiries = listings.reduce((sum, l) => sum + (l.inquiries || 0), 0);

  return (
    <div className="space-y-4">
      {/* Summary stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard icon={Eye} label="Total views" value={totalViews} tone="sky" />
        <StatCard icon={Users} label="Unique viewers" value={totalUnique} tone="indigo" />
        <StatCard icon={Bookmark} label="Saves" value={totalSaves} tone="emerald" />
        <StatCard icon={MessageSquare} label="Inquiries" value={totalInquiries} tone="amber" />
      </div>

      {/* Per-listing breakdown */}
      <div className="space-y-3">
        {listings.map((l) => (
          <div key={l.listing_id} className="rounded-2xl border border-border bg-card p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="truncate font-heading text-base font-bold text-foreground">{l.property_name}</h3>
                <p className="text-xs text-muted-foreground">{[l.county, l.state].filter(Boolean).join(", ") || ""}</p>
              </div>
              {l.status && (
                <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">{l.status}</span>
              )}
            </div>

            <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-6">
              <Metric icon={Eye} label="Views" value={l.total_views} />
              <Metric icon={Users} label="Unique" value={l.unique_viewers} />
              <Metric icon={Bookmark} label="Saves" value={l.saves} />
              <Metric icon={MessageSquare} label="Inq." value={l.inquiries} />
              <Metric icon={FileText} label="Data rm" value={l.data_room_requests} />
              <Metric icon={TrendingUp} label="Offers" value={l.offers} />
            </div>

            {l.last_view_date && (
              <p className="mt-3 text-[11px] text-muted-foreground">Last activity {new Date(l.last_view_date).toLocaleDateString()}</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

const TONES = {
  sky: "bg-sky-50 text-sky-700 border-sky-200",
  indigo: "bg-indigo-50 text-indigo-700 border-indigo-200",
  emerald: "bg-emerald-50 text-emerald-700 border-emerald-200",
  amber: "bg-amber-50 text-amber-700 border-amber-200",
};

function StatCard({ icon: Icon, label, value, tone }) {
  return (
    <div className={`rounded-xl border p-3 ${TONES[tone] || TONES.sky}`}>
      <Icon className="h-4 w-4" />
      <div className="mt-2 text-2xl font-black tabular-nums">{Number(value || 0).toLocaleString()}</div>
      <div className="text-[10px] font-bold uppercase tracking-wider opacity-70">{label}</div>
    </div>
  );
}

function Metric({ icon: Icon, label, value }) {
  return (
    <div className="rounded-lg bg-muted/40 p-2 text-center">
      <Icon className="mx-auto h-3.5 w-3.5 text-muted-foreground" />
      <div className="mt-1 text-sm font-black tabular-nums">{Number(value || 0).toLocaleString()}</div>
      <div className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">{label}</div>
    </div>
  );
}