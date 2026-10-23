import { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { isNativeIOS, stableAppleSubscriptionAccess } from "@/lib/appleSubscriptions";
import { isNativeAndroid } from "@/lib/googleSubscriptions";
import { isReviewDemoAccount } from "@/lib/reviewDemo";
import { hasFullQuarryEntitlement } from "@/lib/subscriptionAccess";
import { verifySavedWebSubscriptionAccess } from "@/lib/webSubscriptionAccess";
import { isOwner } from "@/lib/ownerAccess";

// Shared subscription-entitlement check used by the quarry intelligence pages.
//
// Access signals, in the same order everywhere: admin role, owner email
// (src/lib/ownerAccess.js), review demo account, Apple/web store purchase, then
// an active Full Quarry Intelligence entitlement on the signed-in account.
//
// The answer is stamped with the user id it was computed for and is only
// reported once it belongs to the identity currently signed in. Pages that mount
// before auth resolves (public paths) would otherwise apply their anonymous
// "not subscribed" answer to the freshly resolved session and lock a signed-in
// owner, admin or subscriber out of what they paid for.
export function useProfessionalAccess() {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const grantsImmediately = user?.role === "admin" || isOwner(user) || isReviewDemoAccount(user?.email);

  const [state, setState] = useState(() => (
    grantsImmediately
      ? { hasProfessional: true, checking: false, checkedUserId: user?.id ?? null }
      : { hasProfessional: false, checking: true, checkedUserId: null }
  ));

  useEffect(() => {
    let cancelled = false;

    if (user?.role === "admin" || isOwner(user) || isReviewDemoAccount(user?.email)) {
      setState({ hasProfessional: true, checking: false, checkedUserId: user?.id ?? null });
      return () => { cancelled = true; };
    }

    // Drop the previous identity's answer before resolving this one.
    setState((current) => ({ ...current, checking: true, checkedUserId: null }));

    (async () => {
      try {
        let appleProfessional = false;
        if (isNativeIOS()) {
          try {
            const access = await stableAppleSubscriptionAccess({ attempts: 4 });
            appleProfessional = Boolean(access?.active && access?.professional);
          } catch (error) {
            console.error("Apple professional entitlement check failed", error);
          }
        }

        if (!user?.id) {
          let webActive = false;
          if (!isNativeIOS() && !isNativeAndroid()) {
            try {
              const webAccess = await verifySavedWebSubscriptionAccess();
              webActive = Boolean(webAccess?.active);
            } catch (_) {}
          }
          if (!cancelled) {
            setState({ hasProfessional: appleProfessional || webActive, checking: false, checkedUserId: null });
          }
          return;
        }

        const rows = await base44.entities.SubscriptionEntitlement.filter(
          { user_id: user.id },
          "-updated_date",
          20
        );
        const activeProfessional = hasFullQuarryEntitlement(rows || []);
        // A visitor can purchase on the website before creating an account.
        // Preserve their verified browser purchase while account migration runs.
        let webProfessional = false;
        if (!activeProfessional && !isNativeIOS() && !isNativeAndroid()) {
          const webAccess = await verifySavedWebSubscriptionAccess();
          webProfessional = Boolean(webAccess?.active);
        }
        if (!cancelled) {
          setState({ hasProfessional: appleProfessional || activeProfessional || webProfessional, checking: false, checkedUserId: user.id });
        }
      } catch {
        if (!cancelled) {
          setState({ hasProfessional: false, checking: false, checkedUserId: userId });
        }
      }
    })();

    return () => { cancelled = true; };
  }, [user?.id, user?.email, user?.role]);

  const resolved = state.checkedUserId === userId;
  return {
    hasProfessional: resolved ? state.hasProfessional : false,
    checking: resolved ? state.checking : true,
  };
}