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

export default function Subscription() {
  const { user } = useAuth();
  const [entitlements, setEntitlements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [leadSaved, setLeadSaved] = useState(false);
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
    if (!user?.id) { setLoading(false); return; }
    let cancelled = false;
    (async () => {
      try {
        if (isNative && isIOS) {
          const access = await syncCurrentAppleSubscriptions();
          if (!cancelled) setAppleStoreAccess(access || { active: false, professional: false, purchases: [], planCodes: [] });
        }
        if (isAndroid) await syncCurrentGoogleSubscriptions();
      } catch (error) {
        console.error("Entitlement sync failed", error);
      } finally {
        if (!cancelled) await refreshEntitlements();
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [user?.id, isNative, isIOS, isAndroid]);

  useEffect(() => {
    if (!isNative || (!isIOS && !isAndroid)) return;
    let cancelled = false;
    (async () => {
      setStoreLoading(true);
      try {
        const { isBillingSupported } = await NativePurchases.isBillingSupported();
        if (!isBillingSupported) throw new Error("Store purchases are not available on this device.");
        const ids = isIOS ? appleProductIds() : googleProductIds();
        const { products } = await NativePurchases.getProducts({
          productIdentifiers: ids,
          productType: PURCHASE_TYPE.SUBS,
        });
        if (!cancelled) setStoreProducts(Object.fromEntries((products || []).map((p) => [p.identifier, p])));
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

  const requestAccess = async () => {
    if (isNative || !user?.email || leadSaved) return;
    await base44.entities.SalesLead.create({
      user_id: user.id || "",
      name: user.name || "",
      email: user.email,
      company: user.company || "",
      role: user.role || "",
      interest: "S&S quarry intelligence subscription",
      source: "Subscription page",
      status: "New",
      created_at: new Date().toISOString(),
    });
    setLeadSaved(true);
  };

  const purchase = async (productId) => {
    if (!productId || (!isIOS && !isAndroid)) return;
    setPurchaseMessage("");
    setBuyingId(productId);
    try {
      if (isIOS) {
        const options = {
          productIdentifier: productId,
          productType: PURCHASE_TYPE.SUBS,
          quantity: 1,
        };
        // App account linking is optional. StoreKit purchasing must work while signed out.
        if (user?.id) options.appAccountToken = await appleAccountTokenForUser(user.id);

        const transaction = await NativePurchases.purchaseProduct(options);
        if (user?.id) await verifyAppleTransactions([transaction]);

        const storeAccess = await currentAppleSubscriptionAccess();
        setAppleStoreAccess(storeAccess);
        if (user?.id) await refreshEntitlements();
        setPurchaseMessage(user?.id
          ? "Purchase verified with Apple. Your S&S access is active."
          : "Apple purchase complete. Your subscription is active without registration. Creating an S&S account is optional and can be done later if you want account-linked access.");
      } else {
        if (!user?.id) {
          window.location.href = "/login?returnTo=/subscribe";
          return;
        }
        const transaction = await NativePurchases.purchaseProduct({
          productIdentifier: productId,
          productType: PURCHASE_TYPE.SUBS,
          quantity: 1,
        });
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
      if (!response?.url) throw new Error(response?.error || "Could not start checkout.");
      window.location.assign(response.url);
    } catch (error) {
      setPurchaseMessage(error?.message || "Could not start checkout.");
      setBuyingId("");
    }
  };

  const manageSubscriptions = async () => {
    if (!isIOS && !isAndroid) return;
    setPurchaseMessage("");
    try {
      await NativePurchases.manageSubscriptions();
    } catch (error) {
      setPurchaseMessage(error?.message || "Could not open subscription management.");
    }
  };

  const restore = async () => {
    if (!isIOS && !isAndroid) return;
    setPurchaseMessage("");
    setStoreLoading(true);
    try {
      if (isIOS) {
        const access = await syncCurrentAppleSubscriptions({ restore: true });
        setAppleStoreAccess(access || { active: false, professional: false, purchases: [], planCodes: [] });
        if (user?.id) await refreshEntitlements();
        setPurchaseMessage(access?.active
          ? "Apple purchases restored. Your subscription access is active; an S&S account is not required."
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
          <p className="mt-4 max-w-3xl text-sm leading-relaxed text-muted-foreground">Choose the level of quarry intelligence that fits your work. Downloadable reports are separate products so you only purchase the depth of diligence you need.</p>
          {isIOS && !user?.id && <div className="mt-5 rounded-2xl border border-sky-200 bg-sky-50 p-4 text-sm leading-6 text-sky-950"><strong>No registration required.</strong> You can subscribe with Apple while signed out. Creating an S&amp;S account is optional and only needed if you later want account-linked access across S&amp;S services.</div>}
          {purchaseMessage && <div role="status" aria-live="polite" className="mt-5 rounded-xl border border-border bg-muted/30 p-4 text-sm text-foreground">{purchaseMessage}</div>}

          {loading ? <p className="mt-8 text-sm text-muted-foreground">Checking access…</p> : active ? (
            <div className="mt-8 rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-emerald-950"><div className="font-bold">S&S access active</div><div className="mt-1 text-sm">Plan: {active.plan_code} · Platform: {active.platform}{active.expires_at ? ` · Renews/expires ${new Date(active.expires_at).toLocaleDateString()}` : ""}</div></div>
          ) : null}

          <h2 className="mt-9 font-heading text-xl font-bold">Membership plans</h2>
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            {ACCESS_TIERS.map((tier) => {
              const storeKey = isIOS ? "apple" : "google";
              const monthlyId = SUBSCRIPTION_PRODUCTS[storeKey]?.[tier.code]?.monthly;
              const annualId = SUBSCRIPTION_PRODUCTS[storeKey]?.[tier.code]?.annual;
              const monthlyStore = storeProducts[monthlyId];
              const annualStore = storeProducts[annualId];
              const storeLabel = isIOS ? "Apple" : "Google Play";
              const monthlyPriceLabel = isNative
                ? (monthlyStore?.priceString || (storeLoading ? `Loading ${storeLabel} price…` : tier.monthly))
                : tier.monthly;
              const annualPriceLabel = isNative
                ? (annualStore?.priceString ? `${annualStore.priceString} annual` : (storeLoading ? `Loading ${storeLabel} annual price…` : tier.annual))
                : tier.annual;
              return <div key={tier.code} className={`rounded-2xl border p-6 ${tier.featured ? "border-sky-300 bg-sky-50/40" : "border-border"}`}>
                <div className="text-lg font-bold">{tier.name}</div>
                <div className="mt-3 flex items-end gap-2"><div className="text-3xl font-bold">{monthlyPriceLabel}</div><span className="pb-1 text-xs text-muted-foreground">monthly</span></div>
                <div className="mt-1 text-xs font-semibold text-muted-foreground">1 month · auto-renewing</div>
                <div className="mt-2 text-sm text-muted-foreground">{annualPriceLabel}</div>
                <div className="mt-1 text-xs font-semibold text-muted-foreground">1 year · auto-renewing</div>
                <div className="mt-5 space-y-2">{tier.features.map((f) => <div key={f} className="flex gap-2 text-sm"><Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700"/><span>{f}</span></div>)}</div>
                {!isNative && <div className="mt-6 grid gap-2">
                  <button onClick={() => startWebCheckout(`${tier.code}_monthly`)} disabled={!!buyingId} className="rounded-xl bg-stone-900 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50">{buyingId === `${tier.code}_monthly` ? "Opening secure checkout…" : "Choose monthly"}</button>
                  <button onClick={() => startWebCheckout(`${tier.code}_annual`)} disabled={!!buyingId} className="rounded-xl border border-border px-4 py-2.5 text-sm font-bold disabled:opacity-50">{buyingId === `${tier.code}_annual` ? "Opening secure checkout…" : "Choose annual"}</button>
                </div>}
                {isNative && isIOS && <div className="mt-6 grid gap-2">
                  <button onClick={() => purchase(monthlyId)} disabled={!!buyingId} className="rounded-xl bg-stone-900 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50">{buyingId === monthlyId ? "Connecting to Apple…" : `Choose monthly${monthlyStore?.priceString ? ` · ${monthlyStore.priceString}` : ""}`}</button>
                  <button onClick={() => purchase(annualId)} disabled={!!buyingId} className="rounded-xl border border-border px-4 py-2.5 text-sm font-bold disabled:opacity-50">{buyingId === annualId ? "Connecting to Apple…" : `Choose annual${annualStore?.priceString ? ` · ${annualStore.priceString}` : ""}`}</button>
                </div>}
                {isNative && isAndroid && <div className="mt-6 grid gap-2">
                  <button onClick={() => purchase(monthlyId)} disabled={!monthlyStore || !!buyingId} className="rounded-xl bg-stone-900 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50">{buyingId === monthlyId ? "Connecting to Google Play…" : `Choose monthly${monthlyStore?.priceString ? ` · ${monthlyStore.priceString}` : ""}`}</button>
                  <button onClick={() => purchase(annualId)} disabled={!annualStore || !!buyingId} className="rounded-xl border border-border px-4 py-2.5 text-sm font-bold disabled:opacity-50">{buyingId === annualId ? "Connecting to Google Play…" : `Choose annual${annualStore?.priceString ? ` · ${annualStore.priceString}` : ""}`}</button>
                </div>}
              </div>;
            })}
          </div>

          <div className="mt-6 rounded-2xl border border-border bg-muted/30 p-5 text-xs leading-5 text-muted-foreground">
            <p className="font-semibold text-foreground">Subscription terms</p>
            <p className="mt-2">Payment will be charged to your {isIOS ? "Apple ID" : isAndroid ? "Google Play" : "payment"} account at confirmation of purchase. Subscriptions automatically renew unless auto-renew is turned off at least 24 hours before the end of the current period. Your account will be charged for renewal within 24 hours prior to the end of the current period at the then-current price. You can manage and cancel your subscriptions in your {isIOS ? "App Store" : isAndroid ? "Google Play" : "account"} account settings at any time. Any unused portion of a free trial, if offered, is forfeited when a subscription is purchased.</p>
            <p className="mt-3">By continuing you agree to the S&amp;S Rock Holdings <Link to="/terms" className="underline">Terms of Use</Link> and <Link to="/privacy" className="underline">Privacy Policy</Link>.</p>
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
            <div className="font-semibold text-foreground">Want S&S access?</div>
            <p className="mt-1 text-sm text-muted-foreground">{user?.email ? "Join the launch list and S&S Rock Holdings can follow up when web subscriptions are activated." : "Create an account or sign in to join the launch list. S&S Rock Holdings will follow up when web subscriptions are activated."}</p>
            {user?.email ? (
              <button onClick={requestAccess} disabled={leadSaved} className="mt-4 rounded-xl bg-stone-900 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-60">{leadSaved ? "You're on the launch list" : "Request Access"}</button>
            ) : (
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