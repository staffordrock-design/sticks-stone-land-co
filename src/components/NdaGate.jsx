import React, { useEffect, useMemo, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CreditCard, Download, FileText, FlaskConical, Loader2, Lock, ShieldCheck } from "lucide-react";

const ACCESS_FEE = 250;

function isNativeLikeEnvironment() {
  if (typeof window === "undefined" || typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  const iosWebView = /iPhone|iPad|iPod/i.test(ua) && !/Safari/i.test(ua);
  const androidWebView = /; wv\)/i.test(ua) || (/Android/i.test(ua) && /Version\/\d/i.test(ua));
  const capacitor = /Capacitor/i.test(ua);
  const standalone = Boolean(window.matchMedia?.("(display-mode: standalone)")?.matches || navigator.standalone === true);
  return iosWebView || androidWebView || capacitor || standalone;
}

export default function NdaGate({ listing }) {
  const { user } = useAuth();
  const [ndaSigned, setNdaSigned] = useState(false);
  const [paid, setPaid] = useState(false);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [company, setCompany] = useState("");
  const [role, setRole] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [paying, setPaying] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const nativeLike = useMemo(() => isNativeLikeEnvironment(), []);

  useEffect(() => {
    if (!user?.id) {
      setLoading(false);
      return;
    }

    let active = true;
    (async () => {
      try {
        const [agreements, access] = await Promise.all([
          base44.entities.NDAAgreement.filter({ listing_id: listing.id, user_id: user.id }, "-created_date", 1),
          base44.entities.DataRoomAccess.filter({ listing_id: listing.id, user_id: user.id, paid: true }, "-created_date", 1),
        ]);
        if (!active) return;
        setNdaSigned((agreements || []).length > 0);
        setPaid((access || []).length > 0);

        const params = new URLSearchParams(window.location.search);
        const checkoutId = params.get("checkout_id");
        if (checkoutId && !nativeLike) {
          setVerifying(true);
          try {
            const res = await base44.functions.invoke("verify-data-room-access", { checkout_id: checkoutId });
            if (res?.data?.paid && res?.data?.listing_id === listing.id) setPaid(true);
          } finally {
            setVerifying(false);
            params.delete("checkout_id");
            const qs = params.toString();
            window.history.replaceState({}, "", window.location.pathname + (qs ? `?${qs}` : ""));
          }
        }
      } catch (e) {
        console.error("Data room access check failed", e);
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => { active = false; };
  }, [listing.id, nativeLike, user?.id]);

  const signNda = async () => {
    if (!user?.id) return;
    setSubmitting(true);
    try {
      await base44.entities.NDAAgreement.create({
        listing_id: listing.id,
        listing_title: listing.title,
        user_id: user.id,
        user_email: user.email || "",
        company,
        role,
        agreed: true,
      });
      setNdaSigned(true);
      setOpen(false);
    } finally {
      setSubmitting(false);
    }
  };

  const startCheckout = async () => {
    if (nativeLike || !user?.id) return;
    setPaying(true);
    try {
      const res = await base44.functions.invoke("create-data-room-checkout", {
        listing_id: listing.id,
        channel: "web",
      });
      if (res?.data?.url) window.location.href = res.data.url;
      else alert("Could not start checkout. Please try again.");
    } catch (e) {
      alert("Could not start checkout. Please try again.");
    } finally {
      setPaying(false);
    }
  };

  if (loading) {
    return <div className="rounded-2xl border border-border bg-muted/30 p-8 text-center text-sm text-muted-foreground">Checking data room access…</div>;
  }

  if (!user?.id) {
    return (
      <div className="rounded-2xl border border-border bg-muted/30 p-8 text-center">
        <Lock className="mx-auto h-7 w-7 text-muted-foreground" />
        <h3 className="mt-3 font-heading text-lg font-semibold">Sign in to request data-room access</h3>
        <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">Confidential due-diligence materials are tied to a verified user account.</p>
      </div>
    );
  }

  if (!ndaSigned) {
    return (
      <>
        <div className="rounded-2xl border border-border bg-gradient-to-br from-stone-50 to-amber-50/40 p-8 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-stone-900 text-stone-50"><Lock className="h-6 w-6" /></div>
          <h3 className="mt-4 font-heading text-xl font-semibold text-foreground">NDA-Gated Data Room</h3>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">Core drilling logs and environmental reports are confidential. Sign the mutual NDA to request access.</p>
          <Button className="mt-5" onClick={() => setOpen(true)}><ShieldCheck className="mr-2 h-4 w-4" />Request NDA & Access</Button>
        </div>

        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Mutual Non-Disclosure Agreement</DialogTitle>
              <DialogDescription>By signing, you agree to keep confidential parcel data, drilling results, environmental reports, surveys, and related due-diligence materials private.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-2"><Label htmlFor="company">Company / Organization</Label><Input id="company" value={company} onChange={(e) => setCompany(e.target.value)} placeholder="Company name" /></div>
              <div className="space-y-2"><Label htmlFor="role">Your Role</Label><Input id="role" value={role} onChange={(e) => setRole(e.target.value)} placeholder="Your role" /></div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button onClick={signNda} disabled={submitting || !company}>{submitting ? "Signing…" : "Sign & Continue"}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </>
    );
  }

  if (!paid) {
    return (
      <div className="rounded-2xl border border-border bg-gradient-to-br from-amber-50/50 to-stone-50 p-8 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-amber-600 text-white"><CreditCard className="h-6 w-6" /></div>
        <h3 className="mt-4 font-heading text-xl font-semibold text-foreground">NDA Signed</h3>
        {nativeLike ? (
          <>
            <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">Purchase of confidential data-room access is not offered inside this mobile app. If your account already has authorized access, it will appear here automatically.</p>
            <div className="mx-auto mt-5 max-w-md rounded-xl border border-border bg-card p-4 text-left text-xs leading-relaxed text-muted-foreground">This screen does not contain a payment link, external checkout button, price, or call to purchase outside the app.</div>
          </>
        ) : (
          <>
            <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">Your NDA is on file. Complete the one-time website checkout to unlock the confidential data room for this account.</p>
            <div className="mt-5 flex items-center justify-center gap-2"><span className="font-display text-4xl font-bold text-foreground">${ACCESS_FEE}</span><span className="text-sm text-muted-foreground">one-time access</span></div>
            <Button className="mt-5" onClick={startCheckout} disabled={paying || verifying}>{paying ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Redirecting to checkout…</> : <><CreditCard className="mr-2 h-4 w-4" />Pay ${ACCESS_FEE} & Unlock</>}</Button>
          </>
        )}
        {verifying && <p className="mt-3 text-xs text-muted-foreground">Verifying your payment…</p>}
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-emerald-200 bg-emerald-50/40 p-6">
      <div className="flex items-center gap-2 text-emerald-800"><ShieldCheck className="h-5 w-5" /><h3 className="font-heading text-lg font-semibold">Data Room Unlocked</h3></div>
      <p className="mt-1 text-sm text-emerald-700">Your account has a signed NDA and verified paid access.</p>
      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <a href={listing.core_drilling_url || "#"} target="_blank" rel="noreferrer" className={`flex items-center gap-3 rounded-xl border border-border bg-card p-4 transition hover:shadow-md ${!listing.core_drilling_url ? "pointer-events-none opacity-50" : ""}`}>
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-stone-900 text-stone-50"><FileText className="h-5 w-5" /></div>
          <div className="min-w-0 flex-1"><div className="font-semibold text-foreground">Core Drilling Logs</div><div className="text-xs text-muted-foreground">Confidential document</div></div><Download className="h-4 w-4 text-muted-foreground" />
        </a>
        <a href={listing.environmental_report_url || "#"} target="_blank" rel="noreferrer" className={`flex items-center gap-3 rounded-xl border border-border bg-card p-4 transition hover:shadow-md ${!listing.environmental_report_url ? "pointer-events-none opacity-50" : ""}`}>
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-700 text-white"><FlaskConical className="h-5 w-5" /></div>
          <div className="min-w-0 flex-1"><div className="font-semibold text-foreground">Environmental Reports</div><div className="text-xs text-muted-foreground">Confidential document</div></div><Download className="h-4 w-4 text-muted-foreground" />
        </a>
      </div>
    </div>
  );
}
