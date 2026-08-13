import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Check, Crown, Smartphone } from "lucide-react";
import { Capacitor } from "@capacitor/core";
import { NativePurchases, PURCHASE_TYPE } from "@capgo/native-purchases";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { ACCESS_TIERS, REPORT_PRODUCTS, SUBSCRIPTION_PRODUCTS } from "@/lib/subscriptionPlans";

export default function Subscription() {
  const { user } = useAuth();
  const [entitlements, setEntitlements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [leadSaved, setLeadSaved] = useState(false);
  const [storeProducts, setStoreProducts] = useState({});
  const [storeLoading, setStoreLoading] = useState(false);
  const [purchaseMessage, setPurchaseMessage] = useState("");
  const isNative = Capacitor.isNativePlatform();

  useEffect(() => {
    if (!user?.id) { setLoading(false); return; }
    (async () => {
      try {
        const data = await base44.entities.SubscriptionEntitlement.filter({ user_id: user.id }, "-updated_date", 10);
        setEntitlements(data || []);
      } finally {
        setLoading(false);
      }
    })();
  }, [user?.id]);

  const active = entitlements.find((e) => ["active", "trial", "grace_period"].includes(e.status));

  const requestAccess = async () => {
    if (isNative || !user?.email || leadSaved) return;
    await base44.entities.SalesLead.create({
      user_id: user.id || "",
      name: user.name || "",
      email: user.email,
      company: user.company || "",
      role: user.role || "",
      interest: "S&S Professional quarry intelligence subscription",
      source: "Subscription page",
      status: "New",
      created_at: new Date().toISOString(),
    });
    setLeadSaved(true);
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-4xl px-6 py-12">
        <Link to="/" className="text-sm font-semibold text-sky-800 hover:underline">← Back to marketplace</Link>
        <div className="mt-8 rounded-3xl border border-border bg-card p-8 sm:p-10">
          <div className="flex items-center gap-3"><Crown className="h-7 w-7 text-sky-600" /><div><p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">S&S Professional</p><h1 className="font-heading text-3xl font-bold">Quarry intelligence access</h1></div></div>
          <p className="mt-4 max-w-2xl text-sm leading-relaxed text-muted-foreground">Professional access is designed for quarry buyers, sellers, operators, brokers, landowners and industry professionals who need more than a directory.</p>

          {loading ? <p className="mt-8 text-sm text-muted-foreground">Checking access…</p> : active ? (
            <div className="mt-8 rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-emerald-950"><div className="font-bold">Professional access active</div><div className="mt-1 text-sm">Plan: {active.plan_code} · Platform: {active.platform}{active.expires_at ? ` · Renews/expires ${new Date(active.expires_at).toLocaleDateString()}` : ""}</div></div>
          ) : isNative ? (
            <div className="mt-8 rounded-2xl border border-border bg-muted/20 p-6">
              <div className="flex items-start gap-3"><Smartphone className="mt-0.5 h-5 w-5 shrink-0 text-sky-700" /><div><div className="font-semibold text-foreground">Professional purchasing is not offered in this version of the mobile app.</div><p className="mt-2 text-sm leading-6 text-muted-foreground">You can continue using the quarry marketplace, maps, public-source site intelligence, buyer tools and seller tools included in this release.</p></div></div>
            </div>
          ) : (
            <div className="mt-8 grid gap-4 sm:grid-cols-2">
              <div className="rounded-2xl border border-border p-6"><div className="text-sm font-semibold">{PLAN_DISPLAY.monthly.name}</div><div className="mt-2 text-3xl font-bold text-foreground">{PLAN_DISPLAY.monthly.price}</div><div className="mt-1 text-xs text-muted-foreground">Planned store product: {SUBSCRIPTION_PRODUCTS.apple.monthly}</div><div className="mt-5 rounded-xl bg-muted p-4 text-sm text-muted-foreground">Professional billing is being prepared for the native stores.</div></div>
              <div className="rounded-2xl border border-sky-300 bg-sky-50/50 p-6"><div className="text-sm font-semibold text-sky-950">{PLAN_DISPLAY.annual.name}</div><div className="mt-2 text-3xl font-bold text-sky-950">{PLAN_DISPLAY.annual.price}</div><div className="mt-1 text-xs font-semibold text-sky-800">{PLAN_DISPLAY.annual.note}</div><div className="mt-1 text-xs text-sky-900/70">Planned store product: {SUBSCRIPTION_PRODUCTS.apple.annual}</div></div>
            </div>
          )}

          <div className="mt-8 grid gap-3 sm:grid-cols-2">{PROFESSIONAL_FEATURES.map((feature) => <div key={feature} className="flex items-start gap-2 text-sm"><Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" /><span>{feature}</span></div>)}</div>

          {!isNative && !active && user?.email && <div className="mt-8 rounded-2xl border border-stone-300 bg-stone-50 p-5"><div className="font-semibold text-foreground">Want Professional access when billing opens?</div><p className="mt-1 text-sm text-muted-foreground">Join the launch list and S&S Rock Holdings can follow up with your account when subscriptions are activated.</p><button onClick={requestAccess} disabled={leadSaved} className="mt-4 rounded-xl bg-stone-900 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-60">{leadSaved ? "You're on the launch list" : "Request Professional Access"}</button></div>}
        </div>
      </div>
    </div>
  );
}
