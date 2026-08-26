import React, { useEffect, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { currentAppleSubscriptionAccess, isNativeIOS, syncCurrentAppleSubscriptions } from "@/lib/appleSubscriptions";
import { isNativeAndroid, syncCurrentGoogleSubscriptions } from "@/lib/googleSubscriptions";
import { isReviewDemoAccount, isReviewDemoMode } from "@/lib/reviewDemo";

const ACTIVE_STATUSES = new Set(["active", "trial", "grace_period"]);
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

function entitlementIsActive(row) {
  return ACTIVE_STATUSES.has(row?.status) && (!row?.expires_at || new Date(row.expires_at).getTime() > Date.now());
}

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
  const { pathname } = useLocation();
  const { user, isLoadingAuth, isLoadingPublicSettings, authChecked } = useAuth();
  const [accessState, setAccessState] = useState({ loading: true, active: false });

  const exempt = EXEMPT_PATHS.has(pathname);

  useEffect(() => {
    let cancelled = false;

    if (exempt) {
      setAccessState({ loading: false, active: false });
      return () => { cancelled = true; };
    }

    if (!user?.id && !isNativeIOS()) {
      setAccessState({ loading: false, active: false });
      return () => { cancelled = true; };
    }

    if (user?.role === "admin" || isReviewDemoMode()) {
      setAccessState({ loading: false, active: true });
      return () => { cancelled = true; };
    }

    setAccessState((current) => ({ ...current, loading: true }));
    (async () => {
      try {
        let storeActive = false;

        if (isNativeIOS()) {
          try {
            const storeAccess = await currentAppleSubscriptionAccess();
            storeActive = Boolean(storeAccess?.active);
            if (user?.id) await syncCurrentAppleSubscriptions();
          } catch (error) {
            console.error("Apple membership sync failed", error);
          }

          if (!user?.id) {
            if (!cancelled) setAccessState({ loading: false, active: storeActive });
            return;
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
        const accountActive = (rows || []).some(entitlementIsActive);
        if (!cancelled) setAccessState({ loading: false, active: storeActive || accountActive || isReviewDemoAccount(user?.email) });
      } catch (error) {
        console.error("Membership access check failed", error);
        if (!cancelled) setAccessState({ loading: false, active: false });
      }
    })();

    return () => { cancelled = true; };
  }, [exempt, pathname, user?.id, user?.email, user?.role]);

  if (exempt) return children;

  if (isLoadingPublicSettings || isLoadingAuth || !authChecked) return loadingScreen();

  if (!user?.id && !isNativeIOS()) {
    return <Navigate to="/login?returnTo=%2Fsubscribe" replace />;
  }

  if (accessState.loading) return loadingScreen();

  if (!user?.id && isNativeIOS()) {
    if (!accessState.active) return <Navigate to="/subscribe" replace />;
    return children;
  }

  if (!accessState.active) {
    return <Navigate to="/subscribe" replace />;
  }

  return children;
}
