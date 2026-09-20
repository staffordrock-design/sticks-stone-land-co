import React, { useEffect, useRef, useState } from "react";
import { loadStripe } from "@stripe/stripe-js";
import { Loader2, X } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { getWebSubscriptionBrowserId, saveWebSubscriptionAccess } from "@/lib/webSubscriptionAccess";

const POLL_INTERVAL_MS = 2500;
const POLL_MAX_ATTEMPTS = 120; // ~5 minutes

/**
 * Renders Stripe's Embedded Checkout inside a full-screen overlay so the user
 * completes payment without leaving the page. Polls the session status to
 * detect completion (compatible with all Stripe.js versions).
 */
export default function StripeEmbeddedCheckout({ clientSecret, publishableKey, sessionId, browserSessionId, signedIn = false, onComplete, onClose }) {
  const containerRef = useRef(null);
  const checkoutRef = useRef(null);
  const completedRef = useRef(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  // Mount the Stripe embedded checkout iframe
  useEffect(() => {
    let cancelled = false;

    async function mount() {
      if (!clientSecret || !publishableKey) {
        setError("Checkout could not be initialized. Please try again.");
        setLoading(false);
        return;
      }

      try {
        const stripe = await loadStripe(publishableKey);
        if (!stripe) throw new Error("Stripe failed to load");
        if (cancelled) return;

        const checkout = await stripe.initEmbeddedCheckout({ clientSecret });
        if (cancelled) {
          checkout.destroy();
          return;
        }

        checkoutRef.current = checkout;
        checkout.mount(containerRef.current);
        setLoading(false);
      } catch (mountError) {
        console.error("Embedded checkout mount failed", mountError);
        if (!cancelled) {
          setError(mountError?.message || "Checkout could not be loaded. Please try again.");
          setLoading(false);
        }
      }
    }

    mount();

    return () => {
      cancelled = true;
      try {
        checkoutRef.current?.destroy();
      } catch {
        // ignore
      }
      checkoutRef.current = null;
    };
  }, [clientSecret, publishableKey]);

  // Poll the session status to detect checkout completion
  useEffect(() => {
    if (!sessionId) return;
    let cancelled = false;
    let attempt = 0;

    const poll = async () => {
      while (!cancelled && !completedRef.current && attempt < POLL_MAX_ATTEMPTS) {
        attempt += 1;
        await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
        if (cancelled || completedRef.current) return;

        try {
          const response = signedIn
            ? await base44.functions.invoke("verify-stripe-subscription", { session_id: sessionId })
            : await base44.functions.invoke("verify-public-stripe-subscription", {
                session_id: sessionId,
                browser_session_id: browserSessionId || getWebSubscriptionBrowserId(),
              });
          const payload = response?.data || response || {};
          if (payload?.active) {
            completedRef.current = true;
            saveWebSubscriptionAccess({
              sessionId,
              browserSessionId: browserSessionId || getWebSubscriptionBrowserId(),
              planCode: payload.plan_code,
              expiresAt: payload.expires_at,
            });
            onComplete?.(payload);
            return;
          }
        } catch {
          // Session not complete yet — keep polling
        }
      }

      if (!cancelled && !completedRef.current) {
        // Timed out — fall back to the success-page handler
        onComplete?.({ active: false, pending: true, sessionId });
      }
    };

    poll();

    return () => { cancelled = true; };
  }, [sessionId, browserSessionId, signedIn, onComplete]);

  return (
    <div className="fixed inset-0 z-[130] flex flex-col bg-black/60 backdrop-blur-sm">
      <div className="flex items-center justify-between px-4 py-3 bg-background border-b border-border">
        <span className="text-sm font-bold text-foreground">Secure Checkout</span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close checkout"
          className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted"
        >
          <X className="h-5 w-5" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto bg-background">
        {loading && (
          <div className="flex h-full min-h-[400px] items-center justify-center">
            <div className="text-center">
              <Loader2 className="mx-auto h-7 w-7 animate-spin text-slate-700" />
              <p className="mt-3 text-sm font-medium text-muted-foreground">Loading secure checkout…</p>
            </div>
          </div>
        )}
        {error && (
          <div className="flex h-full min-h-[400px] items-center justify-center px-6">
            <div className="text-center">
              <p className="text-sm font-semibold text-destructive">{error}</p>
              <button
                type="button"
                onClick={onClose}
                className="mt-4 rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-bold text-white"
              >
                Go back
              </button>
            </div>
          </div>
        )}
        <div ref={containerRef} className={loading || error ? "hidden" : "min-h-[600px]"} />
      </div>
    </div>
  );
}