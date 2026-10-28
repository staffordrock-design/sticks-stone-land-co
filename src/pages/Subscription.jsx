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
import { getWebSubscriptionBrowserId, verifySavedWebSubscriptionAccess, getSavedWebSubscriptionAccess, clearWebSubscriptionAccess } from "@/lib/webSubscriptionAccess";
import { trackFunnelEvent } from "@/lib/funnelTracking";
import { trackVerifiedGoogleAdsPurchase } from "@/lib/googleAdsTracking";
import SubscriptionWorkflow from "@/components/SubscriptionWorkflow";
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

function storeProductDetail(product) {
  if (!product) return "";
  const price = product.priceString || product.localizedPrice || product.price || "";
  const intro = product.introductoryPriceString || product.introductoryPrice || product.introductoryPricePeriod || "";
  return [product.identifier, price ? `price=${price}` : "", intro ? `intro=${intro}` : ""].filter(Boolean).join(" · ");
}

function trackSubscriptionAction(user, action, platform, detail = "") {
  void trackFunnelEvent({
    user,
    path: `/subscribe?action=${encodeURIComponent(action)}`,
    page_type: "subscription_action",
    resource_id: action,
    resource_name: [platform, detail].filter(Boolean).join(" · ").slice(0, 180),
  });
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
  const adminPreview = useMemo(() => user?.role === "admin" && new URLSearchParams(location.search).get("previewCustomer") === "1", [location.search, user?.role]);
  const stripeSessionId = useMemo(() => new URLSearchParams(location.search).get("session_id") || "", [location.search]);
  const [entitlements, setEntitlements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [storeProducts, setStoreProducts] = useState({});
  const [storeLoading, setStoreLoading] = useState(false);
  const [storeRetry, setStoreRetry] = useState(0);
  const [purchaseMessage, setPurchaseMessage] = useState("");
  const [buyingId, setBuyingId] = useState("");
  const [appleStoreAccess, setAppleStoreAccess] = useState({ active: false, professional: false, purchases: [], planCodes: [] });
  const [webAccess, setWebAccess] = useState({ active: false });
  const [guestEmail, setGuestEmail] = useState("");
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

    trackFunnelEvent({ page_type: "subscription_page", resource_id: "paywall_viewed", path: "/subscribe", user });

    if (user?.id) {
      // Migrate a previous anonymous web checkout to this signed-in account.
      const savedAccess = getSavedWebSubscriptionAccess();
      if (savedAccess?.sessionId) {
        (async () => {
          try {
            const response = await base44.functions.invoke("verify-stripe-subscription", { session_id: savedAccess.sessionId });
            const payload = response?.data || response || {};
            if (payload?.error) {
              console.error("Web subscription migration failed:", payload.error);
            } else {
              clearWebSubscriptionAccess();
            }
          } catch (error) {
            console.error("Web subscription migration failed", error);
          } finally {
            refreshEntitlements().catch(() => {});
          }
        })();
      } else {
        refreshEntitlements().catch((error) => console.error("Account entitlement refresh failed", error));
      }
    }

    if (isNative && isIOS) {
      stableAppleSubscriptionAccess({ attempts: 4 })
        .then(async (access) => {
          if (access?.active && access?.professional && user?.id && access?.purchases?.length) {
            try { await syncCurrentAppleSubscriptions(); } catch (error) { console.error("Apple backend entitlement sync failed", error); }
          }
          if (!cancelled) setAppleStoreAccess(access || { active: false, professional: false, purchases: [], planCodes: [] });
          if (!cancelled && access?.active && access?.professional && !adminPreview) navigate(returnTo, { replace: true });
        })
        .catch((error) => console.error("Apple entitlement recovery failed", error));
    }

    if (isAndroid && user?.id) {
      syncCurrentGoogleSubscriptions()
        .then(() => refreshEntitlements())
        .catch((error) => console.error("Google entitlement sync failed", error));
    }

    if (!isNative && !user?.id) {
      verifySavedWebSubscriptionAccess()
        .then((access) => { if (!cancelled) setWebAccess(access || { active: false }); })
        .catch(() => { if (!cancelled) setWebAccess({ active: false }); });
    }

    return () => { cancelled = true; };
  }, [user?.id, isNative, isIOS, isAndroid, adminPreview]);

  useEffect(() => {
    if (checkoutStatus !== "cancelled") return;
    setPurchaseMessage("Checkout canceled — your subscription was not started and you were not charged.");
    trackSubscriptionAction(user, "checkout_cancelled", isIOS ? "apple" : isAndroid ? "google" : "web");
  }, [checkoutStatus, user?.id, isIOS, isAndroid]);

  useEffect(() => {
    if (isNative || checkoutStatus !== "success" || !stripeSessionId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setPurchaseMessage("Confirming your Full Quarry Intelligence subscription…");
      try {
        let verifiedPurchase = null;
        if (user?.id) {
          const response = await base44.functions.invoke("verify-stripe-subscription", { session_id: stripeSessionId });
          const payload = response?.data || response || {};
          if (payload?.error) throw new Error(payload.error);
          const rows = await refreshEntitlements();
          if (!findFullQuarryEntitlement(rows)) throw new Error("Payment was confirmed, but access has not refreshed yet. Please try again in a moment.");
          verifiedPurchase = payload.google_ads_purchase;
        } else {
          const access = await verifySavedWebSubscriptionAccess(stripeSessionId);
          if (!access?.active) throw new Error(access?.error || "Payment was confirmed, but guest access has not refreshed yet. Please try again in a moment.");
          if (!cancelled) setWebAccess(access);
          verifiedPurchase = access.google_ads_purchase;
        }
        if (!cancelled) {
          trackVerifiedGoogleAdsPurchase(verifiedPurchase);
          trackSubscriptionAction(user, "checkout_completed", "web", verifiedPurchase?.transaction_id || "verified-access");
          setPurchaseMessage("Subscription confirmed. Your full quarry intelligence is active.");
          base44.analytics.track({ eventName: "subscription_purchased" });
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
      setStoreProducts({});
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
          // On Google Play, identifier is the BASE PLAN and planIdentifier is the PRODUCT ID.
          // Key by product ID so the subscribe button finds the subscription correctly.
          setStoreProducts(Object.fromEntries(products.filter((p) => (isAndroid ? p.planIdentifier : p.identifier)).map((p) => [isAndroid ? p.planIdentifier : p.identifier, p])));
          products.forEach((product) => trackSubscriptionAction(user, "store_product_loaded", isIOS ? "apple" : "google", storeProductDetail(product)));
          if (products.length === 0) {
            setPurchaseMessage(`${isIOS ? "Apple" : "Google Play"} did not return an available Full Quarry Intelligence subscription. Please tap Retry subscription connection below. If it still fails, contact contact@ssrockholdings.com.`);
          }
        }
      } catch (error) {
        if (!cancelled) setPurchaseMessage(error?.message || "Subscription products are not available yet.");
      } finally {
        if (!cancelled) setStoreLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [isNative, isIOS, isAndroid, storeRetry]);

  const accountActive = useMemo(() => findFullQuarryEntitlement(entitlements), [entitlements]);
  const active = accountActive || (isIOS && appleStoreAccess?.active && appleStoreAccess?.professional ? {
    plan_code: "professional (Apple StoreKit)",
    platform: "apple",
    expires_at: null,
  } : null) || (!isNative && webAccess?.active ? {
    plan_code: webAccess?.plan_code || "professional_monthly",
    platform: "web",
    expires_at: webAccess?.expires_at || null,
  } : null);

  const purchase = async (productId) => {
    if (!productId || (!isIOS && !isAndroid)) return;
    trackSubscriptionAction(user, "subscribe_cta_clicked", isIOS ? "apple" : "google", productId);
    base44.analytics.track({ eventName: "buy_button_clicked", properties: { plan_code: productId, platform: isIOS ? "apple" : "google", user_email: user?.email || "anonymous" } });
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
          throw new Error("Apple did not return an available subscription. Please retry the store connection or contact support.");
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
        const googleProduct = storeProducts[productId];
        if (!googleProduct?.identifier || googleProduct?.planIdentifier !== productId) {
          throw new Error("Google Play did not return an eligible subscription base plan. Please retry the store connection.");
        }
        const transaction = await withStoreTimeout(
          NativePurchases.purchaseProduct({
            productIdentifier: productId,
            planIdentifier: googleProduct.identifier,
            ...(googleProduct.offerToken ? { offerToken: googleProduct.offerToken } : {}),
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
    // Captured before checkout so an interrupted purchase can be recovered by email.
    const buyerEmail = String(user?.email || guestEmail || "").trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(buyerEmail)) {
      setPurchaseMessage("Enter the email address for your receipt first — we use it to send your access receipt and one reminder if checkout is interrupted.");
      return;
    }
    trackSubscriptionAction(user, "subscribe_cta_clicked", "web", planCode);
    base44.analytics.track({ eventName: "buy_button_clicked", properties: { plan_code: planCode, platform: "web", user_email: user?.email || "anonymous" } });
    setPurchaseMessage("");
    setBuyingId(planCode);

    // Open the checkout tab synchronously when framed so popup blockers
    // preserve the user activation before the async session creation.
    const isFramed = typeof window !== "undefined" && window.self !== window.top;
    const checkoutTab = isFramed ? window.open("", "_blank") : null;
    if (isFramed && !checkoutTab) {
      setPurchaseMessage("Allow popups to continue to checkout.");
      setBuyingId("");
      return;
    }
    if (checkoutTab) checkoutTab.opener = null;

    try {
      const browserSessionId = getWebSubscriptionBrowserId();
      const response = await withStoreTimeout(
        base44.functions.invoke("create-public-subscription-checkout", {
          plan_code: planCode,
          return_to: returnTo,
          session_id: browserSessionId,
          user_id: user?.id || "",
          user_email: user?.email || "",
          email: buyerEmail,
          origin: window.location.origin,
        }),
        "Secure checkout did not respond within 15 seconds. Please try again.",
        15000
      );
      const payload = response?.data || response || {};

      if (!payload?.checkout_url) {
        throw new Error(payload?.error || "Could not start secure checkout.");
      }

      trackSubscriptionAction(user, "checkout_created", "web", planCode);
      if (checkoutTab) {
        checkoutTab.location.replace(payload.checkout_url);
      } else {
        window.location.assign(payload.checkout_url);
      }
    } catch (error) {
      if (checkoutTab) checkoutTab.close();
      const message = error?.message || "Could not start checkout.";
      trackSubscriptionAction(user, "checkout_error", "web", message);
      setPurchaseMessage(message);
    } finally {
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
        {user?.role === "admin" && !adminPreview && <Link to={`/subscribe?previewCustomer=1&returnTo=${encodeURIComponent(returnTo)}`} className="ml-4 inline-flex rounded-lg border border-sky-300 bg-sky-50 px-3 py-2 text-xs font-bold text-sky-900">View checkout as customer</Link>}
        {adminPreview && <div className="mt-4 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950"><strong>Admin customer preview.</strong> You are seeing the purchase screen instead of being redirected by your existing access. Your admin access is unchanged.</div>}
        <div className="mt-8 rounded-3xl border border-border bg-card p-8 sm:p-10">
          <div className="flex items-center gap-3"><Crown className="h-7 w-7 text-sky-600" /><div><p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">S&S Rock Holdings</p><h1 className="font-heading text-3xl font-bold">Unlock the records behind the quarry</h1></div></div>
          <p className="mt-4 max-w-3xl text-sm leading-relaxed text-muted-foreground">Get the ownership, parcel, geology, permit, production, environmental and opportunity intelligence that sits behind each quarry record. Full access unlocks immediately after purchase. {isIOS ? "Apple shows the current price and purchase terms before you confirm." : "Your checkout provider shows the current price and purchase terms before you confirm."}</p>
          {!active && <a href="#subscription-options" className="mt-5 inline-flex rounded-xl bg-sky-700 px-5 py-3 text-sm font-bold text-white shadow-sm hover:bg-sky-800">View Membership</a>}
          {!user?.id && isIOS && <div className="mt-5 rounded-2xl border border-sky-200 bg-sky-50 p-4 text-sm leading-6 text-sky-950"><strong>No S&amp;S account is required on iPhone.</strong> Tap Subscribe below, review Apple&apos;s purchase terms, confirm, and the app unlocks immediately. You can <Link to={`/login?returnTo=${encodeURIComponent(`/subscribe?returnTo=${encodeURIComponent(returnTo)}`)}`} className="font-bold underline">sign in later</Link> only if you want account-based features such as saved opportunities and messages.</div>}
          {!user?.id && !isNative && <div className="mt-5 rounded-2xl border border-sky-200 bg-sky-50 p-4 text-sm leading-6 text-sky-950"><strong>No S&amp;S account is required to buy on the website.</strong> Continue straight to secure checkout. After payment, Full Quarry Intelligence unlocks on this browser; sign in later only if you want account-based features.</div>}
          {!user?.id && isAndroid && <div className="mt-5 rounded-2xl border border-sky-200 bg-sky-50 p-4 text-sm leading-6 text-sky-950"><strong>Google Play requires an S&amp;S login to link your subscription.</strong> You can browse public quarry information first; when you subscribe, you will be asked to sign in.</div>}
          {purchaseMessage && <div role="status" aria-live="polite" className="mt-5 rounded-xl border border-border bg-muted/30 p-4 text-sm text-foreground">{purchaseMessage}</div>}

          {loading ? <p className="mt-8 text-sm text-muted-foreground">Checking access…</p> : active ? (
            <div className="mt-8 rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-emerald-950">
              <div className="font-bold">S&S access active</div>
              <div className="mt-1 text-sm">Plan: {active.plan_code} · Platform: {active.platform}{active.expires_at ? ` · Renews/expires ${new Date(active.expires_at).toLocaleDateString()}` : ""}</div>
              <Link to={returnTo} className="mt-4 inline-flex rounded-xl bg-emerald-900 px-4 py-2.5 text-sm font-bold text-white">Open quarry intelligence</Link>
            </div>
          ) : null}

          <SubscriptionWorkflow />
          <h2 id="subscription-options" className="mt-9 scroll-mt-6 font-heading text-xl font-bold">Subscription</h2>
          {!isNative && !user?.id && (
            <div className="mt-4 max-w-md rounded-2xl border border-border bg-muted/20 p-4">
              <label htmlFor="checkout-email" className="text-sm font-bold text-foreground">Email for your receipt</label>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">No account needed. Your access receipt goes here, and we can send one reminder if checkout gets interrupted.</p>
              <input
                id="checkout-email"
                type="email"
                inputMode="email"
                autoComplete="email"
                value={guestEmail}
                onChange={(e) => setGuestEmail(e.target.value)}
                placeholder="you@company.com"
                className="input mt-2"
              />
            </div>
          )}
          <div className="mt-4 grid max-w-2xl gap-4">
            {ACCESS_TIERS.map((tier) => {
              const storeKey = isIOS ? "apple" : "google";
              const monthlyId = SUBSCRIPTION_PRODUCTS[storeKey]?.[tier.code]?.monthly;
              const candidateIds = [monthlyId, ...(SUBSCRIPTION_PRODUCTS[storeKey]?.[tier.code]?.monthlyFallbacks || [])].filter(Boolean);
              const matchingProducts = candidateIds.map((id) => storeProducts[id]).filter(Boolean);
              // Reject obsolete-priced legacy offers; only the current USD monthly price is purchasable.
              const allowedPrice = (product) => {
                const label = String(product.priceString || product.localizedPrice || "").trim();
                const currency = String(product.currencyCode || product.currency || "").toUpperCase();
                if (!label || (currency && currency !== "USD") || (!currency && !label.startsWith("$"))) return true;
                const amount = Number(label.replace(/[^0-9.]/g, ""));
                return Number.isFinite(amount) && (Math.abs(amount - 39) < 0.001 || Math.abs(amount - 38.99) < 0.001);
              };
              const monthlyStore = matchingProducts.find(allowedPrice);
              const buyProductId = monthlyStore ? (isAndroid ? monthlyStore.planIdentifier : monthlyStore.identifier) : monthlyId;
              const priceMismatch = matchingProducts.length > 0 && !monthlyStore;
              return <div key={tier.code} className={`rounded-2xl border p-6 ${tier.featured ? "border-sky-300 bg-sky-50/40" : "border-border"}`}>
                <div className="text-lg font-bold">{tier.name}</div>
                <div className="mt-2 flex items-baseline gap-2">
                  <span className="font-heading text-3xl font-bold text-foreground">{isNative && monthlyStore?.priceString ? `${monthlyStore.priceString}/month` : tier.priceLabel}</span>
                  <span className="text-xs text-muted-foreground">{tier.priceSublabel}</span>
                </div>
                <div className="mt-2 text-sm font-semibold text-muted-foreground">One monthly membership · full quarry records · immediate access · cancel anytime</div>
                <div className="mt-5 space-y-2">{tier.features.map((f) => <div key={f} className="flex gap-2 text-sm"><Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700"/><span>{f}</span></div>)}</div>
                {!isNative && <div className="mt-6 grid gap-2">
                  <button onClick={() => startWebCheckout(`${tier.code}_monthly`)} disabled={!!buyingId} className="rounded-xl bg-sky-700 px-4 py-2.5 text-sm font-bold text-white hover:bg-sky-800 disabled:opacity-50">{buyingId === `${tier.code}_monthly` ? "Opening secure checkout…" : `Subscribe for ${tier.priceLabel} · Secure Checkout`}</button>
                  <p className="text-sm font-semibold text-foreground">Cancel anytime. If the intelligence isn&apos;t worth $39 a month to you, don&apos;t pay for it.</p>
                  <p className="text-[11px] leading-4 text-muted-foreground">Billed monthly at $39. Renews automatically. Cancel anytime from your account.</p>
                </div>}
                {isNative && isIOS && (
                  <div className="mt-6 grid gap-2">
                    <button onClick={() => purchase(buyProductId)} disabled={!monthlyStore || !!buyingId} className="rounded-xl bg-sky-700 px-4 py-2.5 text-sm font-bold text-white hover:bg-sky-800 disabled:opacity-50">{buyingId === buyProductId ? "Connecting to Apple…" : storeLoading ? "Loading Apple subscription…" : monthlyStore?.priceString ? `Unlock Full Access · ${monthlyStore.priceString}/month` : "Apple subscription unavailable"}</button>
                    {priceMismatch && <p role="alert" className="text-sm text-red-700">Apple returned an unexpected subscription price. Purchases are disabled until store pricing is corrected.</p>}
                    <p className="text-sm font-semibold text-foreground">Cancel anytime. If the intelligence isn&apos;t worth $39 a month to you, don&apos;t pay for it.</p>
                    <p className="text-[11px] leading-4 text-muted-foreground">Billed monthly at $39. Renews automatically. Cancel anytime from your account.</p>
                  </div>
                )}
                {isNative && isAndroid && <div className="mt-6 grid gap-2">
                  <button onClick={() => purchase(buyProductId)} disabled={!monthlyStore || !!buyingId} className="rounded-xl bg-stone-900 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50">{buyingId === buyProductId ? "Connecting to Google Play…" : storeLoading ? "Loading Google Play subscription…" : monthlyStore ? "Continue with Google Play" : "Google Play subscription unavailable"}</button>
                  {priceMismatch && <p role="alert" className="text-sm text-red-700">Google Play returned an unexpected subscription price. Purchases are disabled until store pricing is corrected.</p>}
                  <p className="text-sm font-semibold text-foreground">Cancel anytime. If the intelligence isn&apos;t worth $39 a month to you, don&apos;t pay for it.</p>
                  <p className="text-[11px] leading-4 text-muted-foreground">Billed monthly at $39. Renews automatically. Cancel anytime from your account.</p>
                </div>}
              </div>;
            })}
          </div>

          <div className="mt-6 rounded-2xl border border-border bg-muted/30 p-5 text-xs leading-5 text-muted-foreground">
            <p className="font-semibold text-foreground">Subscription terms</p>
            <p className="mt-2">{isIOS ? "Apple shows the exact price and purchase terms before confirmation. " : "Your checkout provider shows the exact price and purchase terms before confirmation. "}Subscriptions automatically renew unless auto-renew is turned off at least 24 hours before the end of the current period. You can manage and cancel in your {isIOS ? "App Store" : isAndroid ? "Google Play" : "account"} settings at any time. Sales tax is applied where required by law and is shown before confirmation. The subscription is billed monthly and grants immediate access to all quarry intelligence features. Cancel anytime — you keep access through the end of your current billing period.</p>
            <p className="mt-3">By continuing you agree to the S&amp;S Rock Holdings <Link to="/terms" className="underline">Terms of Use</Link>{isIOS && <> and Apple&apos;s <a href="https://www.apple.com/legal/internet-services/itunes/dev/stdeula/" className="underline" target="_blank" rel="noreferrer">standard EULA</a></>}, and <Link to="/privacy" className="underline">Privacy Policy</Link>.</p>
            <p className="mt-3">S&amp;S Rock Holdings organizes public-source intelligence. Public-source data may require independent verification before any transaction, investment, or operational decision.</p>
          </div>

          {isNative && (isIOS || isAndroid) && <div className="mt-5 flex flex-wrap items-center gap-3"><button onClick={restore} disabled={storeLoading} className="inline-flex items-center gap-2 rounded-xl border border-border px-4 py-2 text-sm font-semibold"><RotateCcw className="h-4 w-4"/>Restore purchases</button><button onClick={manageSubscriptions} className="inline-flex items-center gap-2 rounded-xl border border-border px-4 py-2 text-sm font-semibold">Manage subscriptions</button><button onClick={() => setStoreRetry((value) => value + 1)} disabled={storeLoading} className="inline-flex items-center gap-2 rounded-xl border border-border px-4 py-2 text-sm font-semibold disabled:opacity-50">Retry subscription connection</button>{storeLoading && <span className="inline-flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin"/>Loading {isIOS ? "Apple" : "Google Play"} products…</span>}</div>}
          {user?.id && <div className="mt-8 border-t border-border pt-6">
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Account</div>
            <div className="mt-3 flex flex-wrap items-center gap-4 text-sm">
              <span className="text-muted-foreground">{user.email}</span>
              <Link to="/account/delete" className="font-semibold text-red-700 hover:underline">Delete account</Link>
            </div>
          </div>}

          {!isNative && !active && <div className="mt-8 rounded-2xl border border-stone-300 bg-stone-50 p-5">
            <div className="font-semibold text-foreground">Ready to unlock Full Quarry Intelligence?</div>
            <p className="mt-1 text-sm text-muted-foreground">Continue above to review the current subscription price and confirm securely. You can buy without creating an S&amp;S account.</p>
          </div>}
        </div>
      </div>
    </div>
  );
}