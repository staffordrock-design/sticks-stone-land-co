import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Crown, Loader2, LockKeyhole } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { isNativeIOS, syncCurrentAppleSubscriptions } from "@/lib/appleSubscriptions";

const ACTIVE_STATUSES = new Set(["active", "trial", "grace_period"]);
const isCurrentlyActive = (row) => ACTIVE_STATUSES.has(row.status) && (!row.expires_at || new Date(row.expires_at).getTime() > Date.now());

export default function PaidAccessGate({ children }) {
  const { user } = useAuth();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    if (!user?.id) {
      setLoading(false);
      return;
    }
    (async () => {
      try {
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
          <Link to="/subscribe" className="mt-7 inline-flex items-center gap-2 rounded-xl bg-stone-900 px-5 py-3 text-sm font-bold text-white"><Crown className="h-4 w-4" />View subscription</Link>
          <p className="mt-5 text-xs leading-5 text-muted-foreground">Downloadable intelligence reports and custom diligence may be priced separately from subscription access.</p>
        </div>
      </div>
    );
  }

  return children;
}
