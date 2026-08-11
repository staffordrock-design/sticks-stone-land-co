import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Check, Crown, Smartphone } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { PROFESSIONAL_FEATURES, SUBSCRIPTION_PRODUCTS } from "@/lib/subscriptionPlans";

function isNativeLikeEnvironment() {
  if (typeof window === "undefined" || typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  return /iPhone|iPad|iPod|Android|Capacitor/i.test(ua) || Boolean(window.matchMedia?.("(display-mode: standalone)")?.matches || navigator.standalone === true);
}

export default function Subscription() {
  const { user } = useAuth();
  const [entitlements, setEntitlements] = useState([]);
  const [loading, setLoading] = useState(true);
  const nativeLike = useMemo(() => isNativeLikeEnvironment(), []);
  const isIOS = /iPhone|iPad|iPod/i.test(typeof navigator !== "undefined" ? navigator.userAgent : "");
  const platform = isIOS ? "apple" : "google";

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

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-4xl px-6 py-12">
        <Link to="/" className="text-sm font-semibold text-amber-800 hover:underline">← Back to marketplace</Link>
        <div className="mt-8 rounded-3xl border border-border bg-card p-8 sm:p-10">
          <div className="flex items-center gap-3"><Crown className="h-7 w-7 text-amber-600" /><div><p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">S&S Professional</p><h1 className="font-heading text-3xl font-bold">Quarry intelligence subscription</h1></div></div>
          <p className="mt-4 max-w-2xl text-sm leading-relaxed text-muted-foreground">Professional access is designed for quarry buyers, sellers, operators, brokers, landowners and industry professionals who need more than a directory.</p>

          {loading ? <p className="mt-8 text-sm text-muted-foreground">Checking subscription…</p> : active ? (
            <div className="mt-8 rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-emerald-950"><div className="font-bold">Professional access active</div><div className="mt-1 text-sm">Plan: {active.plan_code} · Platform: {active.platform}{active.expires_at ? ` · Renews/expires ${new Date(active.expires_at).toLocaleDateString()}` : ""}</div></div>
          ) : (
            <div className="mt-8 grid gap-4 sm:grid-cols-2">
              <div className="rounded-2xl border border-border p-6"><div className="text-sm font-semibold">Monthly</div><div className="mt-1 text-xs text-muted-foreground">Product ID: {SUBSCRIPTION_PRODUCTS[platform].monthly}</div><div className="mt-5 rounded-xl bg-muted p-4 text-sm text-muted-foreground">{nativeLike ? "Purchase button becomes active when the Apple/Google store product is connected to the native build." : "Mobile subscription purchases are completed through Apple or Google inside the native app."}</div></div>
              <div className="rounded-2xl border border-amber-300 bg-amber-50/50 p-6"><div className="text-sm font-semibold text-amber-950">Annual</div><div className="mt-1 text-xs text-amber-900/70">Product ID: {SUBSCRIPTION_PRODUCTS[platform].annual}</div><div className="mt-5 rounded-xl bg-white/70 p-4 text-sm text-amber-950/70">Annual billing is prepared as the second store product so we can offer a lower effective monthly price later.</div></div>
            </div>
          )}

          <div className="mt-8 grid gap-3 sm:grid-cols-2">{PROFESSIONAL_FEATURES.map((feature) => <div key={feature} className="flex items-start gap-2 text-sm"><Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" /><span>{feature}</span></div>)}</div>

          <div className="mt-8 flex items-start gap-3 rounded-2xl border border-border bg-muted/20 p-5 text-sm text-muted-foreground"><Smartphone className="mt-0.5 h-5 w-5 shrink-0" /><span>The app is prepared for Apple/Google subscription entitlements. Actual purchasing cannot be activated until the matching products are created in App Store Connect and Google Play Console and the native billing bridge is connected.</span></div>
        </div>
      </div>
    </div>
  );
}
