import React, { useEffect, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import AppLoadingScreen from "@/components/AppLoadingScreen";
import { useAuth } from "@/lib/AuthContext";
import { isNativeIOS, stableAppleSubscriptionAccess, syncCurrentAppleSubscriptions } from "@/lib/appleSubscriptions";
import { isNativeAndroid, syncCurrentGoogleSubscriptions } from "@/lib/googleSubscriptions";
import { isReviewDemoAccount } from "@/lib/reviewDemo";
import { hasFullQuarryEntitlement } from "@/lib/subscriptionAccess";
import { isOwner } from "@/lib/ownerAccess";
import { verifySavedWebSubscriptionAccess, getSavedWebSubscriptionAccess, clearWebSubscriptionAccess } from "@/lib/webSubscriptionAccess";
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
  "/data-sources",
  "/account/delete",
  "/account-deletion",
  "/subscribe",
  "/get-started",
  // Free account + network workspace. These pages are intentionally available
  // without a paid quarry-intelligence subscription so a new member can create
  // a profile, join the network, message people, and post buyer/seller activity.
  // (Public Quarry Information on the Home page does not require a subscription.)
  "/profile",
  "/network",
  "/network/community",
  "/network/deals",
  "/network/deals/new",
  "/network/deals/activity",
  "/messages",
  "/buyer-profile",
  "/opportunities",
  "/sell",
  "/seller-portal",
  "/search",
  "/enterprise",
  // National geology map is free to view: map, basemaps, quarry markers and
  // listings. The premium overlays and geologic-unit detail are locked in place
  // by the page itself, which also resolves the access answer for the signed-in
  // identity so owner/admin/subscribers still see everything unlocked.
  "/us-geology-map",
]);

const FREE_ACCOUNT_PREFIXES = [
  "/network/deals/",
];

// Property listings and mine-site detail pages remain publicly viewable so
// buyers can evaluate a property before subscribing. The pages keep premium
// fields locked in place and each page decides locked vs unlocked display from
// the same access signals (admin role, owner email, active Full Quarry
// Intelligence entitlement) — no redirect out to /subscribe.
const PUBLIC_BROWSE_PREFIXES = [
  "/listings/",
  "/mines/",
];

function loadingScreen() {
  return <AppLoadingScreen message="Checking your membership…" />;
}

export default function MembershipRequiredGate({ children }) {
  const location = useLocation();
  const { pathname, search } = location;
  const returnTo = encodeURIComponent(`${pathname}${search || ""}`);
  const { user, isLoadingAuth, isLoadingPublicSettings, authChecked } = useAuth();
  const userId = user?.id || null;
  // An access decision is only honoured for the identity it was computed for.
  // Routes that render before auth resolves (publicPath in App.jsx, e.g.
  // /us-geology-map) mount this gate while user is still null; without this key
  // that pre-auth "anonymous" decision was applied at the very render where the
  // session resolved, redirecting a signed-in owner — and any other signed-in
  // user — to /subscribe before the admin/owner/entitlement branch could run.
  const [accessState, setAccessState] = useState({ loading: true, active: false, checkedPath: null, checkedUserId: null });

  const freeAccountArea = FREE_ACCOUNT_PREFIXES.some((prefix) => pathname.startsWith(prefix));
  const publicBrowseArea = PUBLIC_BROWSE_PREFIXES.some((prefix) => pathname.startsWith(prefix));
  const exempt = EXEMPT_PATHS.has(pathname) || freeAccountArea || publicBrowseArea;

  useEffect(() => {
    let cancelled = false;

    if (exempt) {
      setAccessState({ loading: false, active: false, checkedPath: pathname, checkedUserId: userId });
      return () => { cancelled = true; };
    }

    if (!user?.id) {
      setAccessState((current) => ({ ...current, loading: true, checkedPath: null, checkedUserId: userId }));
      (async () => {
        try {
          let active = false;
          if (isNativeIOS()) {
            const storeAccess = await stableAppleSubscriptionAccess({ attempts: 4 });
            active = Boolean(storeAccess?.active && storeAccess?.professional);
          } else if (!isNativeAndroid()) {
            const webAccess = await verifySavedWebSubscriptionAccess();
            active = Boolean(webAccess?.active);
          }
          if (!cancelled) setAccessState({ loading: false, active, checkedPath: pathname, checkedUserId: userId });
        } catch (error) {
          console.error("Anonymous membership check failed", error);
          if (!cancelled) setAccessState({ loading: false, active: false, checkedPath: pathname, checkedUserId: userId });
        }
      })();
      return () => { cancelled = true; };
    }

    // Owner addresses pass alongside the admin role, so the owner keeps access to
    // her own app when her Apple sign-in resolves to the non-admin relay record.
    if (user?.role === "admin" || isOwner(user)) {
      setAccessState({ loading: false, active: true, checkedPath: pathname, checkedUserId: userId });
      return () => { cancelled = true; };
    }

    setAccessState((current) => ({ ...current, loading: true, checkedPath: null, checkedUserId: userId }));
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
        let accountActive = hasFullQuarryEntitlement(rows || []);

        // Migrate a previous anonymous web checkout to this signed-in account
        // so the user doesn't lose access they already paid for.
        if (!accountActive && !storeActive && !isNativeIOS() && !isNativeAndroid()) {
          const savedAccess = getSavedWebSubscriptionAccess();
          if (savedAccess?.sessionId) {
            try {
              const response = await base44.functions.invoke("verify-stripe-subscription", { session_id: savedAccess.sessionId });
              const payload = response?.data || response || {};
              if (!payload?.error) {
                clearWebSubscriptionAccess();
                const refreshedRows = await base44.entities.SubscriptionEntitlement.filter(
                  { user_id: user.id },
                  "-updated_date",
                  20
                );
                accountActive = hasFullQuarryEntitlement(refreshedRows || []);
              }
            } catch (error) {
              console.error("Web subscription migration failed", error);
            }
          }
        }

        if (!cancelled) setAccessState({ loading: false, active: storeActive || accountActive || isReviewDemoAccount(user?.email), checkedPath: pathname, checkedUserId: userId });
      } catch (error) {
        console.error("Membership access check failed", error);
        if (!cancelled) setAccessState({ loading: false, active: false, checkedPath: pathname, checkedUserId: userId });
      }
    })();

    return () => { cancelled = true; };
  }, [exempt, pathname, user?.id, user?.email, user?.role]);

  if (exempt) return children;

  if (isLoadingPublicSettings || isLoadingAuth || !authChecked) return loadingScreen();

  if (!user?.id) {
    // Store purchases on iPhone and verified guest web purchases can unlock paid
    // intelligence without forcing an S&S account. Account-only workspaces still
    // use their own RequireSignedIn route guards.
    if (accessState.loading || accessState.checkedPath !== pathname || accessState.checkedUserId !== userId) return loadingScreen();
    if (accessState.active) return children;
    return <Navigate to={`/subscribe?returnTo=${returnTo}`} replace />;
  }

  // Never redirect from a protected route using access state that was computed for a different path.
  // This is especially important when leaving /subscribe: that exempt route intentionally stores active:false.
  // The decision must also belong to the identity it was computed for: a route that
  // renders before auth resolves would otherwise apply its pre-auth anonymous
  // decision to the freshly resolved session and redirect a signed-in user.
  if (accessState.loading || accessState.checkedPath !== pathname || accessState.checkedUserId !== userId) return loadingScreen();

  if (!accessState.active) {
    return <Navigate to={`/subscribe?returnTo=${returnTo}`} replace />;
  }

  return children;
}