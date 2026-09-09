import React, { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Check, Crown, Loader2, RotateCcw } from "lucide-react";
import { Capacitor } from "@capacitor/core";
import { NativePurchases, PURCHASE_TYPE } from "@capgo/native-purchases";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { ACCESS_TIERS, SUBSCRIPTION_PRODUCTS } from "@/lib/subscriptionPlans";
import { appleAccountTokenForUser, appleProductIds, stableAppleSubscriptionAccess, syncCurrentAppleSubscriptions, verifyAppleTransactions } from "@/lib/appleSubscriptions";
import { googleProductIds, isNativeAndroid, syncCurrentGoogleSubscriptions, verifyGoogleTransactions } from "@/lib/googleSubscriptions";
import { isReviewDemoAccount } from "@/lib/reviewDemo";
import { findFullQuarryEntitlement } from "@/lib/subscriptionAccess";
const STORE_TIMEOUT_MS = 15000;
const PRODUCT_LOOKUP_TIMEOUT_MS = 7000;

function withStoreTimeout(promise, message = "The store did not respond. Please try again.", timeoutMs = STORE_TIMEOUT_MS) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(message)), timeoutMs)),
  ]);
}

async function waitForAppleStoreAccess(attempts = 4) {
  return stableAppleSubscriptionAccess({ attempts });
}

function subscriptionSessionId() {
  try {
    const key = "ss_view_session";
    let id = sessionStorage.getItem(key);
    if (!id) {
      id = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      sessionStorage.setItem(key, id);
    }
    return id;
  } catch {
    return `subscription-${Date.now()}`;
  }
}

function storeProductDetail(product) {
  if (!product) return "";
  const price = product.priceString || product.localizedPrice || product.price || "";
  const intro = product.introductoryPriceString || product.introductoryPrice || product.introductoryPricePeriod || "";
  return [product.identifier, price ? `price=${price}` : "", intro ? `intro=${intro}` : ""].filter(Boolean).join(" · ");
}

function trackSubscriptionAction(user, action, platform, detail = "") {
  try {
    void base44.entities.ViewerActivity.create({
      user_id: user?.id || "anonymous",
      user_name: user?.name || "Anonymous visitor",
      user_email: user?.email || "",
      user_role: user?.role || "anonymous",
      path: `/subscribe?action=${encodeURIComponent(action)}`,
      page_type: "subscription_action",
      resource_id: action,
      resource_name: [platform, detail].filter(Boolean).join(" · ").slice(0, 180),
      referrer: document.referrer || "",
      session_id: subscriptionSessionId(),
      user_agent: navigator.userAgent || "",
      viewed_at: new Date().toISOString(),
    });
  } catch {
    // Conversion tracking must never block a purchase.
  }
}

export default function Subscription() {
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const returnTo = useMemo(() => {
    const candidate = new URLSearchParams(location.search).get("returnTo");
    if (!candidate || !candidate.startsWith("/") || candidate.startsWith("//") || candidate.startsWith("/subscribe")) return "/";
    return candidate;
  }, [location.search]);
  const checkoutStatus = useMemo(() => new URLSearchParams(location.search).get("checkout"), [location.search]);
  const stripeSessionId = useMemo(() => new URLSearchParams(location.search).get("session_id") || "", [location.search]);
  const [entitlements, setEntitlements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [storeProducts, setStoreProducts] = useState({});
  const [storeLoading, setStoreLoading] = useState(false);
  const [purchaseMessage, setPurchaseMessage] = useState("");
  const [buyingId, setBuyingId] = useState("");
  const [appleStoreAccess, setAppleStoreAccess] = useState({ active: false, professional: false, purchases: [], planCodes: [] });
  const isNative = Capacitor.isNativePlatform();
  const isIOS = Capacitor.getPlatform() === "ios";
  const isAndroid = isNativeAndroid();

  const refreshEntitlements = async () => {
    if (!user?.id) return [];
    if (isReviewDemoAccount(user?.email)) {
      try {
        await base44.functions.invoke("ensure-review-demo-entitlement", {});
      } catch (error) {
        console.error("Review demo entitlement ensure failed", error);
      }
    }
    const data = await base44.entities.SubscriptionEntitlement.filter({ user_id: user.id }, "-updated_date", 20);
    setEntitlements(data || []);
    return data || [];
  };

  useEffect(() => {
    let cancelled = false;
    setLoading(false);

    if (user?.id) {
      refreshEntitlements().catch((error) => console.error("Account entitlement refresh failed", error));
    }

    if (isNative && isIOS) {
      stableAppleSubscriptionAccess({ attempts: 4 })
        .then(async (access) => {
          if (access?.active && access?.professional && user?.id && access?.purchases?.length) {
            try { await syncCurrentAppleSubscriptions(); } catch (error) { console.error("Apple backend entitlement sync failed", error); }
          }
          if (!cancelled) setAppleStoreAccess(access || { active: false, professional: false, purchases: [], planCodes: [] });
          if (!cancelled && access?.active && access?.professional) navigate(returnTo, { replace: true });
        })
        .catch((error) => console.error("Apple entitlement recovery failed", error));
    }

    if (isAndroid && user?.id) {
      syncCurrentGoogleSubscriptions()
        .then(() => refreshEntitlements())
        .catch((error) => console.error("Google entitlement sync failed", error));
    }

    return () => { cancelled = true; };
  }, [user?.id, isNative, isIOS, isAndroid]);

  useEffect(() => {
    if (checkoutStatus !== "cancelled") return;
    setPurchaseMessage("Checkout canceled — your subscription was not started and you were not charged.");
    trackSubscriptionAction(user, "checkout_cancelled", isIOS ? "apple" : isAndroid ? "google" : "web");
  }, [checkoutStatus, user?.id, isIOS, isAndroid]);

  useEffect(() => {
    if (isNative || !user?.id || checkoutStatus !== "success" || !stripeSessionId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setPurchaseMessage("Confirming your Full Quarry Intelligence subscription…");
      try {
        const response = await base44.functions.invoke("verify-stripe-subscription", { session_id: stripeSessionId });
        const payload = response?.data || response || {};
        if (payload?.error) throw new Error(payload.error);
        const rows = await refreshEntitlements();
        if (!findFullQuarryEntitlement(rows)) throw new Error("Payment was confirmed, but access has not refreshed yet. Please try again in a moment.");
        if (!cancelled) {
          setPurchaseMessage("Subscription confirmed. Your full quarry intelligence is active.");
          navigate(returnTo, { replace: true });
        }
      } catch (error) {
        if (!cancelled) setPurchaseMessage(error?.message || "Could not confirm the web subscription yet.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [isNative, user?.id, checkoutStatus, stripeSessionId, returnTo]);

  useEffect(() => {
    if (!isNative || (!isIOS && !isAndroid)) return;
    let cancelled = false;
    (async () => {
      setPurchaseMessage("");
      setStoreLoading(true);
      try {
        const { isBillingSupported } = await withStoreTimeout(
          NativePurchases.isBillingSupported(),
          "The store did not respond. Please close and reopen the app, then try Subscribe again."
        );
        if (!isBillingSupported) throw new Error("Store purchases are not available on this device.");
        const ids = isIOS ? appleProductIds() : googleProductIds();
        let products = [];
        const attempts = isIOS ? 2 : 1;
        for (let attempt = 1; attempt <= attempts; attempt += 1) {
          const result = await withStoreTimeout(
            NativePurchases.getProducts({
              productIdentifiers: ids,
              productType: PURCHASE_TYPE.SUBS,
            }),
            `${isIOS ? "Apple" : "Google Play"} products did not load. Please try again shortly.`,
            PRODUCT_LOOKUP_TIMEOUT_MS
          );
          products = result?.products || [];
          if (products.length > 0 || attempt === attempts) break;
          await new Promise((resolve) => setTimeout(resolve, 900 * attempt));
        }
        if (!cancelled) {
          setStoreProducts(Object.fromEntries(products.map((p) => [p.identifier, p])));
          products.forEach((product) => trackSubscriptionAction(user, "store_product_loaded", isIOS ? "apple" : "google", storeProductDetail(product)));
          if (isIOS && products.length === 0) {
            setPurchaseMessage("Apple is still preparing the subscription products for this build. Please try again after the App Store product setup finishes.");
          }
        }
      } catch (error) {
        if (!cancelled) setPurchaseMessage(error?.message || "Subscription products are not available yet.");
      } finally {
        if (!cancelled) setStoreLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [isNative, isIOS, isAndroid]);

  const accountActive = useMemo(() => findFullQuarryEntitlement(entitlements), [entitlements]);
  const active = accountActive || (isIOS && appleStoreAccess?.active && appleStoreAccess?.professional ? {
    plan_code: "professional (Apple StoreKit)",
    platform: "apple",
    expires_at: null,
  } : null);

  const purchase = async (productId) => {
    if (!productId || (!isIOS && !isAndroid)) return;
    trackSubscriptionAction(user, "subscribe_cta_clicked", isIOS ? "apple" : "google", productId);
    // Apple StoreKit subscriptions are tied to the Apple ID and must remain
    // purchasable without forcing an S&S account first. Android still requires
    // an account so the Google Play purchase can be linked to backend access.
    if (!user?.id && isAndroid) {
      window.location.href = `/login?returnTo=${encodeURIComponent(`/subscribe?returnTo=${encodeURIComponent(returnTo)}`)}`;
      return;
    }
    setPurchaseMessage("");
    setBuyingId(productId);
    try {
      if (isIOS) {
        let appleProduct = storeProducts[productId];
        if (!appleProduct) {
          for (let attempt = 1; attempt <= 2; attempt += 1) {
            const result = await withStoreTimeout(
              NativePurchases.getProducts({
                productIdentifiers: [productId],
                productType: PURCHASE_TYPE.SUBS,
              }),
              "Apple did not return this subscription product. Please try again shortly.",
              PRODUCT_LOOKUP_TIMEOUT_MS
            );
            appleProduct = (result?.products || []).find((p) => p.identifier === productId);
            if (appleProduct) break;
            if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 700));
          }
        }
        if (!appleProduct) {
          throw new Error("Apple has not made this subscription available to TestFlight yet. Please try again shortly.");
        }
        setStoreProducts((current) => ({ ...current, [productId]: appleProduct }));

        const options = {
          productIdentifier: productId,
          productType: PURCHASE_TYPE.SUBS,
        };
        if (user?.id) options.appAccountToken = await appleAccountTokenForUser(user.id);

        trackSubscriptionAction(user, "store_purchase_sheet_opening", "apple", storeProductDetail(appleProduct) || productId);
        // Do not put a short JavaScript timeout around StoreKit's purchase sheet.
        // The user may need time for Face ID, password entry, or Apple's confirmation UI.
        const transaction = await NativePurchases.purchaseProduct(options);
        trackSubscriptionAction(user, "store_confirmation_returned", "apple", productId);
        // Record every verified Apple purchase for owner reporting. When the buyer
        // is anonymous, the backend stores it against a temporary Apple purchase
        // identity; signing in later migrates that receipt to the S&S account.
        try {
          await verifyAppleTransactions([transaction]);
          trackSubscriptionAction(user, "store_backend_verification_succeeded", "apple", productId);
        } catch (verificationError) {
          console.error("Apple backend reporting verification failed", verificationError);
          trackSubscriptionAction(user, "store_backend_verification_error", "apple", String(verificationError?.message || verificationError || productId));
        }

        const storeAccess = await waitForAppleStoreAccess();
        if (!storeAccess?.active || !storeAccess?.professional) {
          throw new Error("Apple confirmed the purchase, but the entitlement has not refreshed yet. Use Restore Purchases, then try opening the quarry again.");
        }
        setAppleStoreAccess(storeAccess);
        if (user?.id) await refreshEntitlements();
        trackSubscriptionAction(user, "store_entitlement_activated", "apple", productId);
        setPurchaseMessage("Purchase confirmed by Apple. Your full S&S quarry intelligence is active.");
        navigate(returnTo, { replace: true });
      } else {
        const transaction = await withStoreTimeout(
          NativePurchases.purchaseProduct({
            productIdentifier: productId,
            productType: PURCHASE_TYPE.SUBS,
            quantity: 1,
          }),
          "Google Play purchase did not respond. Please close and reopen the app, then try again."
        );
        await verifyGoogleTransactions([transaction]);
        await refreshEntitlements();
        setPurchaseMessage("Purchase verified with Google Play. Your S&S quarry intelligence is active.");
        navigate(returnTo, { replace: true });
      }
    } catch (error) {
      const code = String(error?.code || "");
      const message = String(error?.message || error || "Purchase was not completed.");
      if (code === "USER_CANCELLED") {
        trackSubscriptionAction(user, "store_purchase_cancelled", isIOS ? "apple" : "google", productId);
        setPurchaseMessage("Purchase canceled — your subscription was not started and you were not charged.");
      } else if (code === "PAYMENT_PENDING") {
        trackSubscriptionAction(user, "store_purchase_pending", isIOS ? "apple" : "google", productId);
        setPurchaseMessage("Apple says this purchase is pending. Check your App Store account and try again after it clears.");
      } else {
        trackSubscriptionAction(user, "store_purchase_error", isIOS ? "apple" : "google", [code, message].filter(Boolean).join(": "));
        setPurchaseMessage(message);
      }
    } finally {
      setBuyingId("");
    }
  };

  const startWebCheckout = async (planCode) => {
    trackSubscriptionAction(user, "subscribe_cta_clicked", "web", planCode);
    if (!user?.id) {
      window.location.href = `/register?returnTo=${encodeURIComponent(`/subscribe?returnTo=${encodeURIComponent(returnTo)}`)}`;
      return;
    }
    setPurchaseMessage("");
    setBuyingId(planCode);
    try {
      const response = await base44.functions.invoke("create-subscription-checkout", { plan_code: planCode, return_to: returnTo });
      const payload = response?.data || response || {};
      if (!payload?.url) throw new Error(payload?.error || "Could not start checkout.");
      trackSubscriptionAction(user, "checkout_created", "web", planCode);
      window.location.assign(payload.url);
    } catch (error) {
      const message = error?.message || "Could not start checkout.";
      trackSubscriptionAction(user, "checkout_error", "web", message);
      setPurchaseMessage(message);
      setBuyingId("");
    }
  };

  const manageSubscriptions = async () => {
    if (!isIOS && !isAndroid) return;
    setPurchaseMessage("");
    try {
      await withStoreTimeout(
        NativePurchases.manageSubscriptions(),
        "Subscription management did not open. Please manage it from your device account settings."
      );
    } catch (error) {
      setPurchaseMessage(error?.message || "Could not open subscription management.");
    }
  };

  const restore = async () => {
    if (!isIOS && !isAndroid) return;
    if (!user?.id && isAndroid) {
      window.location.href = `/login?returnTo=${encodeURIComponent(`/subscribe?returnTo=${encodeURIComponent(returnTo)}`)}`;
      return;
    }
    setPurchaseMessage("");
    setStoreLoading(true);
    try {
      if (isIOS) {
        let access = await syncCurrentAppleSubscriptions({ restore: true });
        if (!access?.active || !access?.professional) access = await waitForAppleStoreAccess();
        setAppleStoreAccess(access || { active: false, professional: false, purchases: [], planCodes: [] });
        if (user?.id) await refreshEntitlements();
        setPurchaseMessage(access?.active
          ? "Apple purchases restored. Your full quarry intelligence is active."
          : "No active Apple subscription was found for this Apple account.");
        if (access?.active) navigate(returnTo, { replace: true });
      }
      if (isAndroid) {
        await syncCurrentGoogleSubscriptions({ restore: true });
        await refreshEntitlements();
        setPurchaseMessage("Google Play purchases restored and verified. Your S&S access is up to date.");
      }
    } catch (error) {
      setPurchaseMessage(error?.message || "Could not restore purchases.");
    } finally {
      setStoreLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-6xl px-6 py-12">
        <Link to="/" className="text-sm font-semibold text-sky-800 hover:underline">← Back to quarry intelligence</Link>
        <div className="mt-8 rounded-3xl border border-border bg-card p-8 sm:p-10">
          <div className="flex items-center gap-3"><Crown className="h-7 w-7 text-sky-600" /><div><p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">S&S Rock Holdings</p><h1 className="font-heading text-3xl font-bold">Unlock Full Quarry Intelligence</h1></div></div>
          <p className="mt-4 max-w-3xl text-sm leading-relaxed text-muted-foreground">Full Quarry Intelligence is a monthly subscription. {isIOS ? "Apple shows the current price, any introductory terms, and the purchase terms before you confirm." : "Your checkout provider shows the current price and purchase terms before you confirm."} The subscription renews automatically until canceled.</p>
          {!active && <a href="#subscription-options" className="mt-5 inline-flex rounded-xl bg-sky-700 px-5 py-3 text-sm font-bold text-white shadow-sm hover:bg-sky-800">View Membership</a>}
          {!user?.id && isIOS && <div className="mt-5 rounded-2xl border border-sky-200 bg-sky-50 p-4 text-sm leading-6 text-sky-950"><strong>No S&amp;S account is required on iPhone.</strong> Tap Subscribe below, review Apple&apos;s purchase terms, confirm, and the app unlocks immediately. You can <Link to={`/login?returnTo=${encodeURIComponent(`/subscribe?returnTo=${encodeURIComponent(returnTo)}`)}`} className="font-bold underline">sign in later</Link> only if you want account-based features such as saved opportunities and messages.</div>}
          {!user?.id && !isIOS && <div className="mt-5 rounded-2xl border border-sky-200 bg-sky-50 p-4 text-sm leading-6 text-sky-950">On the web, create a free S&amp;S account or sign in so the subscription can be attached to your account. Your checkout provider shows the current price before confirmation. <Link to="/register?returnTo=%2Fsubscribe" className="font-bold underline">Create free account</Link> · <Link to="/login?returnTo=%2Fsubscribe" className="font-bold underline">Sign in</Link></div>}
          {purchaseMessage && <div role="status" aria-live="polite" className="mt-5 rounded-xl border border-border bg-muted/30 p-4 text-sm text-foreground">{purchaseMessage}</div>}

          {loading ? <p className="mt-8 text-sm text-muted-foreground">Checking access…</p> : active ? (
            <div className="mt-8 rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-emerald-950">
              <div className="font-bold">S&S access active</div>
              <div className="mt-1 text-sm">Plan: {active.plan_code} · Platform: {active.platform}{active.expires_at ? ` · Renews/expires ${new Date(active.expires_at).toLocaleDateString()}` : ""}</div>
              <Link to={returnTo} className="mt-4 inline-flex rounded-xl bg-emerald-900 px-4 py-2.5 text-sm font-bold text-white">Open quarry intelligence</Link>
            </div>
          ) : null}

          <h2 id="subscription-options" className="mt-9 scroll-mt-6 font-heading text-xl font-bold">Subscription</h2>
          <div className="mt-4 grid max-w-2xl gap-4">
            {ACCESS_TIERS.map((tier) => {
              const storeKey = isIOS ? "apple" : "google";
              const monthlyId = SUBSCRIPTION_PRODUCTS[storeKey]?.[tier.code]?.monthly;
              const monthlyStore = storeProducts[monthlyId];
              return <div key={tier.code} className={`rounded-2xl border p-6 ${tier.featured ? "border-sky-300 bg-sky-50/40" : "border-border"}`}>
                <div className="text-lg font-bold">{tier.name}</div>
                <div className="mt-3 text-sm font-semibold text-muted-foreground">Monthly subscription · full app access · auto-renewing until canceled</div>
                <div className="mt-5 space-y-2">{tier.features.map((f) => <div key={f} className="flex gap-2 text-sm"><Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700"/><span>{f}</span></div>)}</div>
                {!isNative && <div className="mt-6 grid gap-2">
                  {user?.id ? (
                    <button onClick={() => startWebCheckout(`${tier.code}_monthly`)} disabled={!!buyingId} className="rounded-xl bg-sky-700 px-4 py-2.5 text-sm font-bold text-white hover:bg-sky-800 disabled:opacity-50">{buyingId === `${tier.code}_monthly` ? "Opening secure checkout…" : "Continue to Subscribe"}</button>
                  ) : (
                    <Link to={`/register?returnTo=${encodeURIComponent(`/subscribe?returnTo=${encodeURIComponent(returnTo)}`)}`} onClick={() => trackSubscriptionAction(user, "subscribe_cta_clicked", "web", `${tier.code}_monthly`)} className="rounded-xl bg-sky-700 px-4 py-2.5 text-center text-sm font-bold text-white hover:bg-sky-800">Create Account & Subscribe</Link>
                  )}
                  <div className="text-[11px] leading-4 text-muted-foreground">Your checkout provider shows the current subscription price before confirmation. The subscription renews automatically until canceled. Already have an account? <Link to={`/login?returnTo=${encodeURIComponent(`/subscribe?returnTo=${encodeURIComponent(returnTo)}`)}`} className="font-semibold text-sky-800 underline">Sign in</Link>.</div>
                </div>}
                {isNative && isIOS && (
                  <div className="mt-6 grid gap-2">
                    <button onClick={() => purchase(monthlyId)} disabled={!monthlyStore || !!buyingId} className="rounded-xl bg-sky-700 px-4 py-2.5 text-sm font-bold text-white hover:bg-sky-800 disabled:opacity-50">{buyingId === monthlyId ? "Connecting to Apple…" : monthlyStore?.priceString ? `Subscribe with Apple · ${monthlyStore.priceString}/month` : "Subscribe with Apple"}</button>
                    <div className="text-[11px] leading-4 text-muted-foreground">Apple shows the exact price, any introductory offer, and purchase terms before you approve. The subscription renews automatically until canceled.</div>
                  </div>
                )}
                {isNative && isAndroid && <div className="mt-6 grid gap-2">
                  <button onClick={() => purchase(monthlyId)} disabled={!monthlyStore || !!buyingId} className="rounded-xl bg-stone-900 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50">{buyingId === monthlyId ? "Connecting to Google Play…" : "Continue with Google Play"}</button>
                </div>}
              </div>;
            })}
          </div>

          <div className="mt-6 rounded-2xl border border-border bg-muted/30 p-5 text-xs leading-5 text-muted-foreground">
            <p className="font-semibold text-foreground">Subscription terms</p>
            <p className="mt-2">{isIOS ? "Apple shows the exact price and purchase terms before confirmation. " : "Your checkout provider shows the exact price and purchase terms before confirmation. "}Subscriptions automatically renew unless auto-renew is turned off at least 24 hours before the end of the current period. You can manage and cancel in your {isIOS ? "App Store" : isAndroid ? "Google Play" : "account"} settings at any time.</p>
            <p className="mt-3">By continuing you agree to the S&amp;S Rock Holdings <Link to="/terms" className="underline">Terms of Use</Link>{isIOS && <> and Apple&apos;s <a href="https://www.apple.com/legal/internet-services/itunes/dev/stdeula/" className="underline" target="_blank" rel="noreferrer">standard EULA</a></>}, and <Link to="/privacy" className="underline">Privacy Policy</Link>.</p>
          </div>

          {isNative && (isIOS || isAndroid) && <div className="mt-5 flex flex-wrap items-center gap-3"><button onClick={restore} disabled={storeLoading} className="inline-flex items-center gap-2 rounded-xl border border-border px-4 py-2 text-sm font-semibold"><RotateCcw className="h-4 w-4"/>Restore purchases</button><button onClick={manageSubscriptions} className="inline-flex items-center gap-2 rounded-xl border border-border px-4 py-2 text-sm font-semibold">Manage subscriptions</button>{storeLoading && <span className="inline-flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin"/>Loading {isIOS ? "Apple" : "Google Play"} products…</span>}</div>}
          <h2 className="mt-10 font-heading text-xl font-bold">Professional research services</h2>
          <div className="mt-3 rounded-2xl border border-border bg-muted/20 p-5 text-sm leading-6 text-muted-foreground">Custom reports, due-diligence research, surveys, reserve studies and environmental work are separate professional services. Pricing is provided by S&amp;S Rock Holdings based on the scope of the request; these services are not additional app subscription tiers.</div>

          {user?.id && <div className="mt-8 border-t border-border pt-6">
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Account</div>
            <div className="mt-3 flex flex-wrap items-center gap-4 text-sm">
              <span className="text-muted-foreground">{user.email}</span>
              <Link to="/account/delete" className="font-semibold text-red-700 hover:underline">Delete account</Link>
            </div>
          </div>}

          {!isNative && !active && <div className="mt-8 rounded-2xl border border-stone-300 bg-stone-50 p-5">
            <div className="font-semibold text-foreground">Ready to unlock Full Quarry Intelligence?</div>
            <p className="mt-1 text-sm text-muted-foreground">{user?.email ? "Continue above to review the current subscription price and confirm securely." : "Create an account or sign in, then continue to the secure subscription checkout."}</p>
            {!user?.email && (
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <Link to="/register" className="rounded-xl bg-stone-900 px-4 py-2.5 text-sm font-bold text-white">Create account</Link>
                <Link to="/login" className="text-sm font-semibold text-sky-800 hover:underline">Sign in</Link>
              </div>
            )}
          </div>}
        </div>
      </div>
    </div>
  );
}