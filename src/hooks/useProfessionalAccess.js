import { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { isNativeIOS, stableAppleSubscriptionAccess } from "@/lib/appleSubscriptions";
import { isReviewDemoAccount } from "@/lib/reviewDemo";
import { hasFullQuarryEntitlement } from "@/lib/subscriptionAccess";
import { verifySavedWebSubscriptionAccess } from "@/lib/webSubscriptionAccess";

// Shared subscription-entitlement check used by the Quarry Intelligence feature.
// Same logic as MineSiteDetail's hasProfessional, extracted into a reusable hook.
export function useProfessionalAccess() {
  const { user } = useAuth();
  const [hasProfessional, setHasProfessional] = useState(
    user?.role === "admin" || isReviewDemoAccount(user?.email)
  );
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let cancelled = false;
    if (user?.role === "admin" || isReviewDemoAccount(user?.email)) {
      setHasProfessional(true);
      setChecking(false);
      return () => { cancelled = true; };
    }
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
          if (!isNativeIOS()) {
            try {
              const webAccess = await verifySavedWebSubscriptionAccess();
              webActive = Boolean(webAccess?.active);
            } catch (_) {}
          }
          if (!cancelled) {
            setHasProfessional(appleProfessional || webActive);
            setChecking(false);
          }
          return;
        }

        const rows = await base44.entities.SubscriptionEntitlement.filter(
          { user_id: user.id },
          "-updated_date",
          20
        );
        const activeProfessional = hasFullQuarryEntitlement(rows || []);
        if (!cancelled) {
          setHasProfessional(appleProfessional || activeProfessional);
          setChecking(false);
        }
      } catch {
        if (!cancelled) {
          setHasProfessional(false);
          setChecking(false);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [user?.id, user?.email, user?.role]);

  return { hasProfessional, checking };
}