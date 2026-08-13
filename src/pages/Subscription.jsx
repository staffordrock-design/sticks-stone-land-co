import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Check, Crown, Smartphone } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { PLAN_DISPLAY, PROFESSIONAL_FEATURES, SUBSCRIPTION_PRODUCTS } from "@/lib/subscriptionPlans";

function isNativeLikeEnvironment() {
  if (typeof window === "undefined" || typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  return /iPhone|iPad|iPod|Android|Capacitor/i.test(ua) || Boolean(window.matchMedia?.("(display-mode: standalone)")?.matches || navigator.standalone === true);
}

export default function Subscription() {
  const { user } = useAuth();
  const [entitlements, setEntitlements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [leadSaved, setLeadSaved] = useState(false);
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

  const requestAccess = async () => {
    if (!user?.email || leadSaved) return;
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
          <div className="flex items-center gap-3"><Crown className="h-7 w-7 text-sky-600" /><div><p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">S&S Professional</p><h1 className="font-heading text-3xl font-bold">Quarry intelligence subscription</h1></div></div>
          <p className="mt-4 max-w-2xl text-sm leading-relaxed text-muted-foreground">Professional access is designed for quarry buyers, sellers, operators, brokers, landowners and industry professionals who need more than a directory.</p>

          {loading ? <p className="mt-8 text-sm text-muted-foreground">Checking subscription…</p> : active ? (
            <div className="mt-8 rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-emerald-950"><div className="font-bold">Professional access active</div><div className="mt-1 text-sm">Plan: {active.plan_code} · Platform: {active.platform}{active.expires_at ? ` · Renews/expires ${new Date(active.expires_at).toLocaleDateString()}` : ""}</div></div>
          ) : (
            <div className="mt-8 grid gap-4 sm:grid-cols-2">
              <div className="rounded-2xl border border-border p-6"><div className="text-sm font-semibold">{PLAN_DISPLAY.monthly.name}</div><div className="mt-2 text-3xl font-bold text-foreground">{PLAN_DISPLAY.monthly.price}</div><div className="mt-1 text-xs text-muted-foreground">Store product: {SUBSCRIPTION_PRODUCTS[platform].monthly}</div><div className="mt-5 rounded-xl bg-muted p-4 text-sm text-muted-foreground">{nativeLike ? "Purchase activates when the Apple/Google store product is connected to the native build." : "Professional subscriptions are purchased through Apple or Google in the native app."}</div></div>
              <div className="rounded-2xl border border-sky-300 bg-sky-50/50 p-6"><div className="text-sm font-semibold text-sky-950">{PLAN_DISPLAY.annual.name}</div><div className="mt-2 text-3xl font-bold text-sky-950">{PLAN_DISPLAY.annual.price}</div><div className="mt-1 text-xs font-semibold text-sky-800">{PLAN_DISPLAY.annual.note}</div><div className="mt-1 text-xs text-sky-900/70">Store product: {SUBSCRIPTION_PRODUCTS[platform].annual}</div><div className="mt-5 rounded-xl bg-white/70 p-4 text-sm text-sky-950/70">Built for active buyers, operators, brokers and land professionals using S&S intelligence throughout the year.</div></div>
            </div>
          )}

          <div className="mt-8 grid gap-3 sm:grid-cols-2">{PROFESSIONAL_FEATURES.map((feature) => <div key={feature} className="flex items-start gap-2 text-sm"><Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" /><span>{feature}</span></div>)}</div>

          {!active && user?.email && <div className="mt-8 rounded-2xl border border-stone-300 bg-stone-50 p-5"><div className="font-semibold text-foreground">Want Professional access when billing opens?</div><p className="mt-1 text-sm text-muted-foreground">Join the launch list and S&S Rock Holdings can follow up with your account when subscriptions are activated.</p><button onClick={requestAccess} disabled={leadSaved} className="mt-4 rounded-xl bg-stone-900 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-60">{leadSaved ? "You're on the launch list" : "Request Professional Access"}</button></div>}

          <div className="mt-8 flex items-start gap-3 rounded-2xl border border-border bg-muted/20 p-5 text-sm text-muted-foreground"><Smartphone className="mt-0.5 h-5 w-5 shrink-0" /><span>The app is prepared for Apple/Google subscription entitlements. Actual purchasing cannot be activated until the matching products are created in App Store Connect and Google Play Console and the native billing bridge is connected.</span></div>
        </div>
      </div>
    </div>
  );
}
