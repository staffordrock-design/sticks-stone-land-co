import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Check, Crown, Loader2, RotateCcw, Smartphone } from "lucide-react";
import { Capacitor } from "@capacitor/core";
import { NativePurchases, PURCHASE_TYPE } from "@capgo/native-purchases";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { ACCESS_TIERS, REPORT_PRODUCTS, SUBSCRIPTION_PRODUCTS } from "@/lib/subscriptionPlans";
import { appleAccountTokenForUser, appleProductIds, syncCurrentAppleSubscriptions, verifyAppleTransactions } from "@/lib/appleSubscriptions";

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
  const isNative = Capacitor.isNativePlatform();
  const isIOS = Capacitor.getPlatform() === "ios";

  const refreshEntitlements = async () => {
    if (!user?.id) return [];
    const data = await base44.entities.SubscriptionEntitlement.filter({ user_id: user.id }, "-updated_date", 20);
    setEntitlements(data || []);
    return data || [];
  };

  useEffect(() => {
    if (!user?.id) { setLoading(false); return; }
    let cancelled = false;
    (async () => {
      try {
        if (isNative && isIOS) await syncCurrentAppleSubscriptions();
      } catch (error) {
        console.error("Apple entitlement sync failed", error);
      } finally {
        if (!cancelled) await refreshEntitlements();
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [user?.id, isNative, isIOS]);

  useEffect(() => {
    if (!isNative || !isIOS) return;
    let cancelled = false;
    (async () => {
      setStoreLoading(true);
      try {
        const { isBillingSupported } = await NativePurchases.isBillingSupported();
        if (!isBillingSupported) throw new Error("Apple purchases are not available on this device.");
        const { products } = await NativePurchases.getProducts({
          productIdentifiers: appleProductIds(),
          productType: PURCHASE_TYPE.SUBS,
        });
        if (!cancelled) setStoreProducts(Object.fromEntries((products || []).map((p) => [p.identifier, p])));
      } catch (error) {
        if (!cancelled) setPurchaseMessage(error?.message || "Apple subscription products are not available yet.");
      } finally {
        if (!cancelled) setStoreLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [isNative, isIOS]);

  const active = useMemo(() => entitlements.find((e) => ACTIVE.has(e.status) && (!e.expires_at || new Date(e.expires_at).getTime() > Date.now())), [entitlements]);

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
    if (!productId || !isIOS) return;
    setPurchaseMessage("");
    setBuyingId(productId);
    try {
      const appAccountToken = await appleAccountTokenForUser(user.id);
      const transaction = await NativePurchases.purchaseProduct({
        productIdentifier: productId,
        productType: PURCHASE_TYPE.SUBS,
        quantity: 1,
        appAccountToken,
      });
      await verifyAppleTransactions([transaction]);
      await refreshEntitlements();
      setPurchaseMessage("Purchase verified with Apple. Your S&S access is active.");
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

  const restore = async () => {
    if (!isIOS) return;
    setPurchaseMessage("");
    setStoreLoading(true);
    try {
      await syncCurrentAppleSubscriptions({ restore: true });
      await refreshEntitlements();
      setPurchaseMessage("Apple purchases restored and verified. Your S&S access is up to date.");
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

          {loading ? <p className="mt-8 text-sm text-muted-foreground">Checking access…</p> : active ? (
            <div className="mt-8 rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-emerald-950"><div className="font-bold">S&S access active</div><div className="mt-1 text-sm">Plan: {active.plan_code} · Platform: {active.platform}{active.expires_at ? ` · Renews/expires ${new Date(active.expires_at).toLocaleDateString()}` : ""}</div></div>
          ) : null}

          <h2 className="mt-9 font-heading text-xl font-bold">Membership plans</h2>
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            {ACCESS_TIERS.map((tier) => {
              const monthlyId = SUBSCRIPTION_PRODUCTS.apple[tier.code]?.monthly;
              const annualId = SUBSCRIPTION_PRODUCTS.apple[tier.code]?.annual;
              const monthlyStore = storeProducts[monthlyId];
              const annualStore = storeProducts[annualId];
              return <div key={tier.code} className={`rounded-2xl border p-6 ${tier.featured ? "border-sky-300 bg-sky-50/40" : "border-border"}`}>
                <div className="text-lg font-bold">{tier.name}</div>
                <div className="mt-3 flex items-end gap-2"><div className="text-3xl font-bold">{isNative && monthlyStore?.priceString ? monthlyStore.priceString : tier.monthly}</div><span className="pb-1 text-xs text-muted-foreground">monthly</span></div>
                <div className="mt-1 text-sm text-muted-foreground">{isNative && annualStore?.priceString ? `${annualStore.priceString} annual` : tier.annual}</div>
                <div className="mt-5 space-y-2">{tier.features.map((f) => <div key={f} className="flex gap-2 text-sm"><Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700"/><span>{f}</span></div>)}</div>
                {!isNative && <div className="mt-6 grid gap-2">
                  <button onClick={() => startWebCheckout(`${tier.code}_monthly`)} disabled={!!buyingId} className="rounded-xl bg-stone-900 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50">{buyingId === `${tier.code}_monthly` ? "Opening secure checkout…" : "Choose monthly"}</button>
                  <button onClick={() => startWebCheckout(`${tier.code}_annual`)} disabled={!!buyingId} className="rounded-xl border border-border px-4 py-2.5 text-sm font-bold disabled:opacity-50">{buyingId === `${tier.code}_annual` ? "Opening secure checkout…" : "Choose annual"}</button>
                </div>}
                {isNative && isIOS && <div className="mt-6 grid gap-2">
                  <button onClick={() => purchase(monthlyId)} disabled={!monthlyStore || !!buyingId} className="rounded-xl bg-stone-900 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50">{buyingId === monthlyId ? "Connecting to Apple…" : `Choose monthly${monthlyStore?.priceString ? ` · ${monthlyStore.priceString}` : ""}`}</button>
                  <button onClick={() => purchase(annualId)} disabled={!annualStore || !!buyingId} className="rounded-xl border border-border px-4 py-2.5 text-sm font-bold disabled:opacity-50">{buyingId === annualId ? "Connecting to Apple…" : `Choose annual${annualStore?.priceString ? ` · ${annualStore.priceString}` : ""}`}</button>
                </div>}
              </div>;
            })}
          </div>

          {isNative && isIOS && <div className="mt-5 flex flex-wrap items-center gap-3"><button onClick={restore} disabled={storeLoading} className="inline-flex items-center gap-2 rounded-xl border border-border px-4 py-2 text-sm font-semibold"><RotateCcw className="h-4 w-4"/>Restore purchases</button>{storeLoading && <span className="inline-flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin"/>Loading Apple products…</span>}</div>}
          {purchaseMessage && <div className="mt-4 rounded-xl border border-border bg-muted/30 p-4 text-sm text-muted-foreground">{purchaseMessage}</div>}
          {isNative && !isIOS && <div className="mt-5 rounded-xl border border-border bg-muted/20 p-4 text-sm text-muted-foreground"><Smartphone className="mr-2 inline h-4 w-4"/>Google Play purchasing will be enabled with the Android store release.</div>}

          <h2 className="mt-10 font-heading text-xl font-bold">Intelligence reports</h2>
          <p className="mt-2 text-sm text-muted-foreground">Report purchases are separate from membership access. Transaction-grade professional services such as legal opinions, surveys, reserve studies and environmental assessments remain separate.</p>
          <div className="mt-4 grid gap-3 md:grid-cols-2">{REPORT_PRODUCTS.map((report) => <div key={report.code} className="rounded-2xl border border-border p-5"><div className="flex items-start justify-between gap-4"><div className="font-bold">{report.name}</div><div className="shrink-0 text-lg font-bold">{report.price}</div></div><p className="mt-2 text-sm leading-6 text-muted-foreground">{report.description}</p></div>)}</div>

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