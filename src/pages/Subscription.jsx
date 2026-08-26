import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Check, Crown, Loader2, RotateCcw } from "lucide-react";
import { Capacitor } from "@capacitor/core";
import { NativePurchases, PURCHASE_TYPE } from "@capgo/native-purchases";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { ACCESS_TIERS, REPORT_PRODUCTS, SUBSCRIPTION_PRODUCTS } from "@/lib/subscriptionPlans";
import { appleAccountTokenForUser, appleProductIds, currentAppleSubscriptionAccess, syncCurrentAppleSubscriptions, verifyAppleTransactions } from "@/lib/appleSubscriptions";
import { googleProductIds, isNativeAndroid, syncCurrentGoogleSubscriptions, verifyGoogleTransactions } from "@/lib/googleSubscriptions";
import { isReviewDemoAccount } from "@/lib/reviewDemo";

const ACTIVE = new Set(["active", "trial", "grace_period"]);
const STORE_TIMEOUT_MS = 15000;
const PRODUCT_LOOKUP_TIMEOUT_MS = 7000;

function withStoreTimeout(promise, message = "The store did not respond. Please try again.", timeoutMs = STORE_TIMEOUT_MS) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(message)), timeoutMs)),
  ]);
}

export default function Subscription() {
  const { user } = useAuth();
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
      syncCurrentAppleSubscriptions()
        .then((access) => {
          if (!cancelled) setAppleStoreAccess(access || { active: false, professional: false, purchases: [], planCodes: [] });
        })
        .catch((error) => console.error("Apple entitlement sync failed", error));
    }

    if (isAndroid && user?.id) {
      syncCurrentGoogleSubscriptions()
        .then(() => refreshEntitlements())
        .catch((error) => console.error("Google entitlement sync failed", error));
    }

    return () => { cancelled = true; };
  }, [user?.id, isNative, isIOS, isAndroid]);

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

  const accountActive = useMemo(() => entitlements.find((e) => ACTIVE.has(e.status) && (!e.expires_at || new Date(e.expires_at).getTime() > Date.now())), [entitlements]);
  const active = accountActive || (isIOS && appleStoreAccess?.active ? {
    plan_code: appleStoreAccess.professional ? "professional (Apple StoreKit)" : (appleStoreAccess.planCodes?.[0] || "quarry_access (Apple StoreKit)"),
    platform: "apple",
    expires_at: null,
  } : null);

  const purchase = async (productId) => {
    if (!productId || (!isIOS && !isAndroid)) return;
    if (!user?.id && isAndroid) {
      window.location.href = "/login?returnTo=/subscribe";
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
          quantity: 1,
        };
        if (user?.id) options.appAccountToken = await appleAccountTokenForUser(user.id);

        // Do not put a short JavaScript timeout around StoreKit's purchase sheet.
        // The user may need time for Face ID, password entry, or Apple's confirmation UI.
        const transaction = await NativePurchases.purchaseProduct(options);
        if (user?.id) await verifyAppleTransactions([transaction]);

        const storeAccess = await currentAppleSubscriptionAccess();
        setAppleStoreAccess(storeAccess);
        if (user?.id) await refreshEntitlements();
        setPurchaseMessage("Purchase confirmed by Apple. Your full S&S access is active — no S&S sign-in is required on this iPhone.");
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
        setPurchaseMessage("Purchase verified with Google Play. Your S&S access is active.");
      }
    } catch (error) {
      const message = String(error?.message || error || "Purchase was not completed.");
      if (!/cancel/i.test(message)) setPurchaseMessage(message);
    } finally {
      setBuyingId("");
    }
  };

  const startWebCheckout = async (planCode) => {
    if (!user?.id) { window.location.href = "/login?returnTo=/subscribe"; return; }
    setPurchaseMessage("");
    setBuyingId(planCode);
    try {
      const response = await base44.functions.invoke("create-subscription-checkout", { plan_code: planCode });
      const payload = response?.data || response || {};
      if (!payload?.url) throw new Error(payload?.error || "Could not start checkout.");
      window.location.assign(payload.url);
    } catch (error) {
      setPurchaseMessage(error?.message || "Could not start checkout.");
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
      window.location.href = "/login?returnTo=/subscribe";
      return;
    }
    setPurchaseMessage("");
    setStoreLoading(true);
    try {
      if (isIOS) {
        const access = await syncCurrentAppleSubscriptions({ restore: true });
        setAppleStoreAccess(access || { active: false, professional: false, purchases: [], planCodes: [] });
        if (user?.id) await refreshEntitlements();
        setPurchaseMessage(access?.active
          ? "Apple purchases restored. Your subscription access is active."
          : "No active Apple subscription was found for this Apple account.");
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
          <div className="flex items-center gap-3"><Crown className="h-7 w-7 text-sky-600" /><div><p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">S&S Rock Holdings</p><h1 className="font-heading text-3xl font-bold">Quarry intelligence access</h1></div></div>
          <p className="mt-4 max-w-3xl text-sm leading-relaxed text-muted-foreground">One membership unlocks the full quarry intelligence platform for $199 per month. Downloadable reports and custom diligence remain separate products.</p>
          {!user?.id && isIOS && <div className="mt-5 rounded-2xl border border-sky-200 bg-sky-50 p-4 text-sm leading-6 text-sky-950"><strong>No S&amp;S account is required on iPhone.</strong> Subscribe with your Apple ID and the app will recognize the active Apple subscription on this device.</div>}
          {!user?.id && !isIOS && <div className="mt-5 rounded-2xl border border-sky-200 bg-sky-50 p-4 text-sm leading-6 text-sky-950"><strong>Create your S&amp;S account first.</strong> Sign in or create an account before subscribing so web or Google Play access can be attached to your account. <Link to="/register?returnTo=%2Fsubscribe" className="font-bold underline">Create account</Link> · <Link to="/login?returnTo=%2Fsubscribe" className="font-bold underline">Sign in</Link></div>}
          {purchaseMessage && <div role="status" aria-live="polite" className="mt-5 rounded-xl border border-border bg-muted/30 p-4 text-sm text-foreground">{purchaseMessage}</div>}

          {loading ? <p className="mt-8 text-sm text-muted-foreground">Checking access…</p> : active ? (
            <div className="mt-8 rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-emerald-950"><div className="font-bold">S&S access active</div><div className="mt-1 text-sm">Plan: {active.plan_code} · Platform: {active.platform}{active.expires_at ? ` · Renews/expires ${new Date(active.expires_at).toLocaleDateString()}` : ""}</div></div>
          ) : null}

          <h2 className="mt-9 font-heading text-xl font-bold">Membership plans</h2>
          <div className="mt-4 grid max-w-2xl gap-4">
            {ACCESS_TIERS.map((tier) => {
              const storeKey = isIOS ? "apple" : "google";
              const monthlyId = SUBSCRIPTION_PRODUCTS[storeKey]?.[tier.code]?.monthly;
              const monthlyStore = storeProducts[monthlyId];
              const monthlyPriceLabel = isNative
                ? (monthlyStore?.priceString || tier.monthly)
                : tier.monthly;
              return <div key={tier.code} className={`rounded-2xl border p-6 ${tier.featured ? "border-sky-300 bg-sky-50/40" : "border-border"}`}>
                <div className="text-lg font-bold">{tier.name}</div>
                <div className="mt-3 flex items-end gap-2"><div className="text-3xl font-bold">{monthlyPriceLabel}</div><span className="pb-1 text-xs text-muted-foreground">monthly</span></div>
                <div className="mt-1 text-xs font-semibold text-muted-foreground">1 month · auto-renewing · full app access</div>
                <div className="mt-5 space-y-2">{tier.features.map((f) => <div key={f} className="flex gap-2 text-sm"><Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700"/><span>{f}</span></div>)}</div>
                {!isNative && <div className="mt-6 grid gap-2">
                  <button onClick={() => startWebCheckout(`${tier.code}_monthly`)} disabled={!!buyingId} className="rounded-xl bg-stone-900 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50">{buyingId === `${tier.code}_monthly` ? "Opening secure checkout…" : "Subscribe · $199/month"}</button>
                </div>}
                {isNative && isIOS && (
                  <div className="mt-6 grid gap-2">
                    <button onClick={() => purchase(monthlyId)} disabled={!!buyingId} className="rounded-xl bg-stone-900 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50">{buyingId === monthlyId ? "Connecting to Apple…" : `Subscribe monthly${monthlyStore?.priceString ? ` · ${monthlyStore.priceString}` : ` · ${tier.monthly}`}`}</button>
                    {!monthlyStore && <div className="text-[11px] leading-4 text-muted-foreground">Tap Subscribe to connect directly to Apple. Apple shows the final subscription price before you confirm.</div>}
                  </div>
                )}
                {isNative && isAndroid && <div className="mt-6 grid gap-2">
                  <button onClick={() => purchase(monthlyId)} disabled={!monthlyStore || !!buyingId} className="rounded-xl bg-stone-900 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50">{buyingId === monthlyId ? "Connecting to Google Play…" : `Subscribe monthly${monthlyStore?.priceString ? ` · ${monthlyStore.priceString}` : ""}`}</button>
                </div>}
              </div>;
            })}
          </div>

          <div className="mt-6 rounded-2xl border border-border bg-muted/30 p-5 text-xs leading-5 text-muted-foreground">
            <p className="font-semibold text-foreground">Subscription terms</p>
            <p className="mt-2">Payment will be charged to your {isIOS ? "Apple ID" : isAndroid ? "Google Play" : "payment"} account at confirmation of purchase. Subscriptions automatically renew unless auto-renew is turned off at least 24 hours before the end of the current period. Your account will be charged for renewal within 24 hours prior to the end of the current period at the then-current price. You can manage and cancel your subscriptions in your {isIOS ? "App Store" : isAndroid ? "Google Play" : "account"} account settings at any time. Any unused portion of a free trial, if offered, is forfeited when a subscription is purchased.</p>
            <p className="mt-3">By continuing you agree to the S&amp;S Rock Holdings <Link to="/terms" className="underline">Terms of Use</Link>{isIOS && <> and Apple&apos;s <a href="https://www.apple.com/legal/internet-services/itunes/dev/stdeula/" className="underline" target="_blank" rel="noreferrer">standard EULA</a></>}, and <Link to="/privacy" className="underline">Privacy Policy</Link>.</p>
          </div>

          {isNative && (isIOS || isAndroid) && <div className="mt-5 flex flex-wrap items-center gap-3"><button onClick={restore} disabled={storeLoading} className="inline-flex items-center gap-2 rounded-xl border border-border px-4 py-2 text-sm font-semibold"><RotateCcw className="h-4 w-4"/>Restore purchases</button><button onClick={manageSubscriptions} className="inline-flex items-center gap-2 rounded-xl border border-border px-4 py-2 text-sm font-semibold">Manage subscriptions</button>{storeLoading && <span className="inline-flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin"/>Loading {isIOS ? "Apple" : "Google Play"} products…</span>}</div>}
          <h2 className="mt-10 font-heading text-xl font-bold">Professional research services</h2>
          {isNative && isIOS ? (
            <div className="mt-3 rounded-2xl border border-border bg-muted/20 p-5 text-sm leading-6 text-muted-foreground">Custom due-diligence and research services are separate from App Store subscription access and do not unlock digital app features. Use Support for scope and availability information.</div>
          ) : <>
            <p className="mt-2 text-sm text-muted-foreground">Report services are separate from membership access. Transaction-grade professional services such as legal opinions, surveys, reserve studies and environmental assessments remain separate.</p>
            <div className="mt-4 grid gap-3 md:grid-cols-2">{REPORT_PRODUCTS.map((report) => <div key={report.code} className="rounded-2xl border border-border p-5"><div className="flex items-start justify-between gap-4"><div className="font-bold">{report.name}</div><div className="shrink-0 text-lg font-bold">{report.price}</div></div><p className="mt-2 text-sm leading-6 text-muted-foreground">{report.description}</p></div>)}</div>
          </>}

          {user?.id && <div className="mt-8 border-t border-border pt-6">
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Account</div>
            <div className="mt-3 flex flex-wrap items-center gap-4 text-sm">
              <span className="text-muted-foreground">{user.email}</span>
              <Link to="/account/delete" className="font-semibold text-red-700 hover:underline">Delete account</Link>
            </div>
          </div>}

          {!isNative && !active && <div className="mt-8 rounded-2xl border border-stone-300 bg-stone-50 p-5">
            <div className="font-semibold text-foreground">Ready to subscribe?</div>
            <p className="mt-1 text-sm text-muted-foreground">{user?.email ? "Choose a plan above to start secure checkout with Stripe." : "Create an account or sign in, then choose a plan above to start secure checkout with Stripe."}</p>
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