import React, { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Crown, Loader2, LockKeyhole } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { isNativeIOS, stableAppleSubscriptionAccess, syncCurrentAppleSubscriptions } from "@/lib/appleSubscriptions";
import { isReviewDemoAccount } from "@/lib/reviewDemo";
import { findFullQuarryEntitlement } from "@/lib/subscriptionAccess";

export default function PaidAccessGate({ children }) {
  const { user } = useAuth();
  const location = useLocation();
  const subscribeHref = `/subscribe?returnTo=${encodeURIComponent(`${location.pathname}${location.search || ""}`)}`;
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [appleStoreActive, setAppleStoreActive] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (isNativeIOS()) {
          try {
            const storeAccess = await stableAppleSubscriptionAccess({ attempts: 4 });
            const storeActive = Boolean(storeAccess?.active && storeAccess?.professional);
            if (!cancelled) setAppleStoreActive(storeActive);
            if (user?.id && storeActive && storeAccess?.purchases?.length) await syncCurrentAppleSubscriptions();
          } catch (error) {
            console.error("Apple StoreKit access check failed", error);
            if (!cancelled) setAppleStoreActive(false);
          }
        }

        if (!user?.id) {
          if (!cancelled) setRows([]);
          return;
        }

        if (isReviewDemoAccount(user?.email)) {
          try {
            await base44.functions.invoke("ensure-review-demo-entitlement", {});
          } catch (error) {
            console.error("Review demo entitlement ensure failed", error);
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

  const accountActive = useMemo(() => findFullQuarryEntitlement(rows), [rows]);
  const active = appleStoreActive || Boolean(accountActive);

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
          <h1 className="mt-2 font-heading text-3xl font-bold">Detailed mine intelligence is locked</h1>
          <p className="mx-auto mt-4 max-w-md text-sm leading-6 text-muted-foreground">The marketplace preview shows enough to find and screen quarry records. One $199/month membership opens the full record behind every site: mapped parcel and ownership intelligence, geology and rock type, permits and compliance history, production context, opportunity screening and premium analysis.</p>
          <div className="mx-auto mt-6 max-w-md text-left">
            <div className="rounded-2xl border border-sky-200 bg-sky-50/70 p-5"><div className="text-xs font-bold uppercase tracking-wider text-sky-700">Full Quarry Intelligence</div><div className="mt-1 text-2xl font-bold">$199<span className="text-xs font-semibold text-muted-foreground">/mo</span></div><div className="mt-2 text-xs leading-5 text-muted-foreground">Full app access to quarry records, mapping, ownership, geology, regulatory, production and advanced screening.</div></div>
          </div>
          <div className="mt-7 flex flex-col items-center justify-center gap-3 sm:flex-row sm:flex-wrap">
            <Link to={subscribeHref} className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-5 py-3 text-sm font-bold text-white"><Crown className="h-4 w-4" />Unlock full intelligence</Link>
            <Link to="/" className="inline-flex items-center rounded-xl border border-border px-5 py-3 text-sm font-bold text-foreground">Keep browsing preview</Link>
            {!user?.id && !isNativeIOS() && <Link to="/register" className="inline-flex items-center rounded-xl border border-border px-5 py-3 text-sm font-bold text-foreground">Create account</Link>}
            {!user?.id && !isNativeIOS() && <Link to="/login" className="text-sm font-semibold text-sky-800 hover:underline">Sign in</Link>}
          </div>
          <p className="mt-5 text-xs leading-5 text-muted-foreground">Custom reports and due-diligence research are separate professional services. S&S confirms scope and pricing directly.</p>
        </div>
      </div>
    );
  }

  return children;
}