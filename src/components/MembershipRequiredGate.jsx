import React, { useEffect, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { isNativeIOS, stableAppleSubscriptionAccess, syncCurrentAppleSubscriptions } from "@/lib/appleSubscriptions";
import { isNativeAndroid, syncCurrentGoogleSubscriptions } from "@/lib/googleSubscriptions";
import { isReviewDemoAccount } from "@/lib/reviewDemo";
import { hasFullQuarryEntitlement } from "@/lib/subscriptionAccess";
const EXEMPT_PATHS = new Set([
  "/",
  "/login",
  "/register",
  "/forgot-password",
  "/reset-password",
  "/oauth/consent",
  "/privacy",
  "/terms",
  "/support",
  "/account/delete",
  "/account-deletion",
  "/subscribe",
]);

function loadingScreen() {
  return (
    <div className="fixed inset-0 z-[125] flex items-center justify-center bg-background">
      <div className="text-center">
        <Loader2 className="mx-auto h-7 w-7 animate-spin text-slate-700" />
        <p className="mt-3 text-sm font-medium text-muted-foreground">Checking your membership…</p>
      </div>
    </div>
  );
}

export default function MembershipRequiredGate({ children }) {
  const location = useLocation();
  const { pathname, search } = location;
  const returnTo = encodeURIComponent(`${pathname}${search || ""}`);
  const { user, isLoadingAuth, isLoadingPublicSettings, authChecked } = useAuth();
  const [accessState, setAccessState] = useState({ loading: true, active: false, checkedPath: null });

  const exempt = EXEMPT_PATHS.has(pathname);

  useEffect(() => {
    let cancelled = false;

    if (exempt) {
      setAccessState({ loading: false, active: false, checkedPath: pathname });
      return () => { cancelled = true; };
    }

    if (!user?.id) {
      setAccessState({ loading: false, active: false, checkedPath: pathname });
      return () => { cancelled = true; };
    }

    if (user?.role === "admin") {
      setAccessState({ loading: false, active: true, checkedPath: pathname });
      return () => { cancelled = true; };
    }

    setAccessState((current) => ({ ...current, loading: true, checkedPath: null }));
    (async () => {
      try {
        let storeActive = false;

        if (isNativeIOS()) {
          try {
            const storeAccess = await stableAppleSubscriptionAccess({ attempts: 4 });
            storeActive = Boolean(storeAccess?.active && storeAccess?.professional);
            // Only reconcile the backend when StoreKit actually returned a verified
            // current entitlement. An empty TestFlight/Sandbox snapshot must never
            // erase an already verified paid account entitlement.
            if (user?.id && storeActive && storeAccess?.purchases?.length) await syncCurrentAppleSubscriptions();
          } catch (error) {
            console.error("Apple membership sync failed", error);
          }

        }

        if (isNativeAndroid()) {
          try {
            await syncCurrentGoogleSubscriptions();
          } catch (error) {
            console.error("Google Play membership sync failed", error);
          }
        }

        if (isReviewDemoAccount(user?.email)) {
          try {
            await base44.functions.invoke("ensure-review-demo-entitlement", {});
          } catch (error) {
            console.error("Review demo entitlement ensure failed", error);
          }
        }

        const rows = await base44.entities.SubscriptionEntitlement.filter(
          { user_id: user.id },
          "-updated_date",
          20
        );
        const accountActive = hasFullQuarryEntitlement(rows || []);
        if (!cancelled) setAccessState({ loading: false, active: storeActive || accountActive || isReviewDemoAccount(user?.email), checkedPath: pathname });
      } catch (error) {
        console.error("Membership access check failed", error);
        if (!cancelled) setAccessState({ loading: false, active: false, checkedPath: pathname });
      }
    })();

    return () => { cancelled = true; };
  }, [exempt, pathname, user?.id, user?.email, user?.role]);

  if (exempt) return children;

  if (isLoadingPublicSettings || isLoadingAuth || !authChecked) return loadingScreen();

  if (!user?.id) {
    const subscribeReturn = `/subscribe?returnTo=${returnTo}`;
    return <Navigate to={`/login?returnTo=${encodeURIComponent(subscribeReturn)}`} replace />;
  }

  // Never redirect from a protected route using access state that was computed for a different path.
  // This is especially important when leaving /subscribe: that exempt route intentionally stores active:false.
  if (accessState.loading || accessState.checkedPath !== pathname) return loadingScreen();

  if (!accessState.active) {
    return <Navigate to={`/subscribe?returnTo=${returnTo}`} replace />;
  }

  return children;
}
