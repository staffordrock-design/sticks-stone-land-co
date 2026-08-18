import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Crown, Eye, Loader2, LockKeyhole, X } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { isNativeIOS, syncCurrentAppleSubscriptions } from "@/lib/appleSubscriptions";
import { disableReviewDemoMode, enableReviewDemoMode, isReviewDemoMode, isReviewDemoAccount } from "@/lib/reviewDemo";

const ACTIVE_STATUSES = new Set(["active", "trial", "grace_period"]);
const isCurrentlyActive = (row) => ACTIVE_STATUSES.has(row.status) && (!row.expires_at || new Date(row.expires_at).getTime() > Date.now());

export default function PaidAccessGate({ children }) {
  const { user } = useAuth();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [reviewDemo, setReviewDemo] = useState(isReviewDemoMode);

  useEffect(() => {
    let cancelled = false;
    if (!user?.id) {
      setLoading(false);
      return;
    }
    (async () => {
      try {
        if (isReviewDemoAccount(user?.email)) {
          try {
            await base44.functions.invoke("ensure-review-demo-entitlement", {});
          } catch (error) {
            console.error("Review demo entitlement ensure failed", error);
          }
        }
        if (isNativeIOS()) {
          try {
            await syncCurrentAppleSubscriptions();
          } catch (error) {
            console.error("Apple subscription sync failed", error);
          }
        }
        const data = await base44.entities.SubscriptionEntitlement.filter(
          { user_id: user.id },
          "-updated_date",
          20
        );
        if (!cancelled) setRows(data || []);
      } catch {
        if (!cancelled) setRows([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [user?.id]);

  const active = useMemo(() => rows.find(isCurrentlyActive), [rows]);

  if (reviewDemo) {
    return (
      <div className="min-h-screen">
        <div className="sticky top-0 z-[60] flex items-center justify-between gap-3 border-b border-sky-200 bg-sky-50 px-4 py-2 text-xs font-semibold text-sky-950">
          <span className="inline-flex items-center gap-2"><Eye className="h-4 w-4" />Apple Review Demo · read-only access</span>
          <button
            type="button"
            onClick={() => { disableReviewDemoMode(); setReviewDemo(false); }}
            className="inline-flex min-h-8 items-center gap-1 rounded-lg border border-sky-300 bg-white px-3 py-1.5"
          ><X className="h-3.5 w-3.5" />Exit demo</button>
        </div>
        {children}
      </div>
    );
  }

  if (user?.role === "admin") return children;

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center bg-background"><Loader2 className="h-7 w-7 animate-spin text-slate-700" /></div>;
  }

  if (!active) {
    return (
      <div className="min-h-screen bg-background px-6 py-14">
        <div className="mx-auto max-w-xl rounded-3xl border border-border bg-card p-8 text-center shadow-sm sm:p-10">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-stone-900 text-white"><LockKeyhole className="h-7 w-7" /></div>
          <p className="mt-6 text-xs font-bold uppercase tracking-[0.22em] text-muted-foreground">S&S Rock Holdings</p>
          <h1 className="mt-2 font-heading text-3xl font-bold">Subscription required</h1>
          <p className="mx-auto mt-4 max-w-md text-sm leading-6 text-muted-foreground">S&S Quarry Intelligence gives subscribers access to quarry records, maps, geology, regulatory context, mineral intelligence and deeper site analysis.</p>
          <div className="mt-7 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link to="/subscribe" className="inline-flex items-center gap-2 rounded-xl bg-stone-900 px-5 py-3 text-sm font-bold text-white"><Crown className="h-4 w-4" />View subscription</Link>
            {!user?.id && isNativeIOS() && <button type="button" onClick={() => { enableReviewDemoMode(); setReviewDemo(true); }} className="inline-flex items-center gap-2 rounded-xl border border-sky-300 bg-sky-50 px-5 py-3 text-sm font-bold text-sky-950"><Eye className="h-4 w-4" />Explore review demo</button>}
            {!user?.id && <Link to="/register" className="inline-flex items-center rounded-xl border border-border px-5 py-3 text-sm font-bold text-foreground">Create account</Link>}
            {!user?.id && <Link to="/login" className="text-sm font-semibold text-sky-800 hover:underline">Sign in</Link>}
          </div>
          <p className="mt-5 text-xs leading-5 text-muted-foreground">Downloadable intelligence reports and custom diligence may be priced separately from subscription access.</p>
        </div>
      </div>
    );
  }

  return children;
}