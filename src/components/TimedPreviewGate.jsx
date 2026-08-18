import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Clock3, Crown, LockKeyhole } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { isNativeIOS, syncCurrentAppleSubscriptions } from "@/lib/appleSubscriptions";
import { isReviewDemoMode, isReviewDemoAccount } from "@/lib/reviewDemo";

const PREVIEW_MS = 60 * 1000;
const PREVIEW_START_KEY = "ss-quarry-preview-start-v2";
const ACTIVE_STATUSES = new Set(["active", "trial", "grace_period"]);

function entitlementIsActive(row) {
  return ACTIVE_STATUSES.has(row?.status) && (!row?.expires_at || new Date(row.expires_at).getTime() > Date.now());
}

function getOrCreatePreviewStart() {
  const now = Date.now();
  try {
    const existing = Number(window.localStorage.getItem(PREVIEW_START_KEY));
    if (Number.isFinite(existing) && existing > 0) return existing;
    window.localStorage.setItem(PREVIEW_START_KEY, String(now));
  } catch {}
  return now;
}

export default function TimedPreviewGate({ children }) {
  const { user } = useAuth();
  const [checkingAccess, setCheckingAccess] = useState(Boolean(user?.id));
  const [hasPaidAccess, setHasPaidAccess] = useState(user?.role === "admin" || isReviewDemoMode());
  const [secondsRemaining, setSecondsRemaining] = useState(60);
  const [previewExpired, setPreviewExpired] = useState(false);
  const previewProgress = Math.max(0, Math.min(100, (secondsRemaining / 60) * 100));

  useEffect(() => {
    let cancelled = false;

    if (user?.role === "admin" || isReviewDemoMode()) {
      setHasPaidAccess(true);
      setCheckingAccess(false);
      return () => { cancelled = true; };
    }

    if (!user?.id) {
      setHasPaidAccess(false);
      setCheckingAccess(false);
      return () => { cancelled = true; };
    }

    setCheckingAccess(true);
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
            console.error("Apple subscription sync failed during preview check", error);
          }
        }

        const rows = await base44.entities.SubscriptionEntitlement.filter(
          { user_id: user.id },
          "-updated_date",
          20
        );
        if (!cancelled) setHasPaidAccess((rows || []).some(entitlementIsActive));
      } catch (error) {
        console.error("Subscription access check failed", error);
        if (!cancelled) setHasPaidAccess(false);
      } finally {
        if (!cancelled) setCheckingAccess(false);
      }
    })();

    return () => { cancelled = true; };
  }, [user?.id, user?.role]);

  useEffect(() => {
    if (checkingAccess || hasPaidAccess) return;

    const startedAt = getOrCreatePreviewStart();
    const updateTimer = () => {
      const remaining = Math.max(0, PREVIEW_MS - (Date.now() - startedAt));
      setSecondsRemaining(Math.ceil(remaining / 1000));
      setPreviewExpired(remaining <= 0);
    };

    updateTimer();
    const timer = window.setInterval(updateTimer, 250);
    return () => window.clearInterval(timer);
  }, [checkingAccess, hasPaidAccess]);

  if (hasPaidAccess) {
    return <>{children}</>;
  }

  return (
    <>
      <div className={previewExpired ? "pointer-events-none select-none blur-[2px]" : ""}>
        {children}
      </div>

      {!checkingAccess && !previewExpired && (
        <div className="fixed bottom-24 right-4 z-[75] w-[210px] overflow-hidden rounded-2xl border border-slate-200 bg-white/95 text-slate-900 shadow-lg backdrop-blur sm:bottom-6 sm:right-6">
          <div className="flex items-center justify-between gap-3 px-4 py-2.5 text-xs font-bold">
            <span className="inline-flex items-center gap-2"><Clock3 className="h-4 w-4" />Free preview</span>
            <span>{secondsRemaining}s</span>
          </div>
          <div className="h-1 bg-slate-100"><div className="h-full bg-slate-800 transition-[width] duration-300" style={{ width: `${previewProgress}%` }} /></div>
        </div>
      )}

      {!checkingAccess && previewExpired && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/75 px-5 py-8 backdrop-blur-sm" style={{ paddingTop: "max(env(safe-area-inset-top), 2rem)", paddingBottom: "max(env(safe-area-inset-bottom), 2rem)" }}>
          <div className="w-full max-w-lg rounded-3xl border border-white/15 bg-white p-7 text-center shadow-2xl sm:p-9">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-900 text-white">
              <LockKeyhole className="h-7 w-7" />
            </div>
            <p className="mt-5 text-xs font-bold uppercase tracking-[0.22em] text-slate-500">S&amp;S Rock Holdings</p>
            <h1 className="mt-2 font-heading text-3xl font-bold text-slate-950">Your 60-second preview is complete</h1>
            <p className="mx-auto mt-4 max-w-md text-sm leading-6 text-slate-600">
              You’ve seen the marketplace, source-backed quarry records and opportunity screening. Membership unlocks the detailed mine pages, mapped geology, parcel/ownership intelligence, regulatory history and deeper analysis behind each record.
            </p>
            <div className="mt-6 grid grid-cols-2 gap-3 text-left">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="text-xs font-bold uppercase tracking-wider text-slate-500">Quarry Access</div>
                <div className="mt-1 text-xl font-bold text-slate-950">$69<span className="text-xs font-semibold text-slate-500">/mo</span></div>
                <div className="mt-1 text-xs leading-5 text-slate-600">Marketplace, mine identity, maps and basic site intelligence.</div>
              </div>
              <div className="rounded-2xl border border-sky-200 bg-sky-50 p-4">
                <div className="text-xs font-bold uppercase tracking-wider text-sky-700">Professional</div>
                <div className="mt-1 text-xl font-bold text-slate-950">$139<span className="text-xs font-semibold text-slate-500">/mo</span></div>
                <div className="mt-1 text-xs leading-5 text-slate-600">Parcel, geology, permits, production and advanced screening.</div>
              </div>
            </div>
            <div className="mt-5 grid gap-3">
              <Link to="/subscribe" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-slate-900 px-5 py-3 text-sm font-bold text-white">
                <Crown className="h-4 w-4" /> Unlock full quarry intelligence
              </Link>
              {!user?.id && (
                <Link to="/login?returnTo=/subscribe" className="inline-flex min-h-12 items-center justify-center rounded-xl border border-slate-300 px-5 py-3 text-sm font-bold text-slate-900">
                  Already a member? Sign in
                </Link>
              )}
            </div>
            <p className="mt-5 text-xs leading-5 text-slate-500">The preview remains limited to marketplace-level information. Subscriber-only intelligence and downloadable reports stay protected.</p>
          </div>
        </div>
      )}
    </>
  );
}