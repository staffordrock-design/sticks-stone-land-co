import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Lock,
  FileText,
  FlaskConical,
  ShieldCheck,
  Download,
  CreditCard,
  Loader2,
} from "lucide-react";

const ACCESS_FEE = 250;
const storageKey = (id) => `dr_access_${id}`;

export default function NdaGate({ listing }) {
  const [ndaSigned, setNdaSigned] = useState(false);
  const [paid, setPaid] = useState(false);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [company, setCompany] = useState("");
  const [role, setRole] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [paying, setPaying] = useState(false);
  const [verifying, setVerifying] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const existing = await base44.entities.NDAAgreement.filter(
          { listing_id: listing.id },
          "-created_date",
          1
        );
        if (active && existing.length > 0) setNdaSigned(true);
      } catch (e) {
        /* ignore */
      }

      if (localStorage.getItem(storageKey(listing.id)) === "1") {
        if (active) setPaid(true);
      }

      const params = new URLSearchParams(window.location.search);
      const checkoutId = params.get("checkout_id");
      if (checkoutId) {
        if (active) setVerifying(true);
        try {
          const res = await base44.functions.invoke("verify-data-room-access", {
            checkout_id: checkoutId,
          });
          if (res.data?.paid && res.data?.listing_id === listing.id) {
            localStorage.setItem(storageKey(listing.id), "1");
            if (active) setPaid(true);
          }
        } catch (e) {
          /* ignore */
        }
        if (active) setVerifying(false);
        params.delete("checkout_id");
        const qs = params.toString();
        window.history.replaceState(
          {},
          "",
          window.location.pathname + (qs ? `?${qs}` : "")
        );
      }

      if (active) setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [listing.id]);

  const signNda = async () => {
    setSubmitting(true);
    try {
      await base44.entities.NDAAgreement.create({
        listing_id: listing.id,
        listing_title: listing.title,
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
    if (window.self !== window.top) {
      alert(
        "Checkout works only from the published app. Open this listing in a new tab to complete payment."
      );
      return;
    }
    setPaying(true);
    try {
      const res = await base44.functions.invoke("create-data-room-checkout", {
        listing_id: listing.id,
      });
      if (res.data?.url) {
        window.location.href = res.data.url;
      } else {
        alert("Could not start checkout. Please try again.");
      }
    } catch (e) {
      alert("Could not start checkout. Please try again.");
    } finally {
      setPaying(false);
    }
  };

  if (loading) {
    return (
      <div className="rounded-2xl border border-border bg-muted/30 p-8 text-center text-sm text-muted-foreground">
        Checking data room access…
      </div>
    );
  }

  // Stage 1: NDA not signed
  if (!ndaSigned) {
    return (
      <>
        <div className="rounded-2xl border border-border bg-gradient-to-br from-stone-50 to-amber-50/40 p-8 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-stone-900 text-stone-50">
            <Lock className="h-6 w-6" />
          </div>
          <h3 className="mt-4 font-heading text-xl font-semibold text-foreground">
            NDA-Gated Data Room
          </h3>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
            Core drilling logs and environmental sample reports are confidential.
            Sign the mutual non-disclosure agreement, then pay the one-time access
            fee to unlock.
          </p>
          <Button className="mt-5" onClick={() => setOpen(true)}>
            <ShieldCheck className="mr-2 h-4 w-4" />
            Request NDA & Access
          </Button>
        </div>

        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Mutual Non-Disclosure Agreement</DialogTitle>
              <DialogDescription>
                By signing, you agree to keep all confidential parcel data — core
                drilling results, environmental reports, and boundary surveys —
                strictly private.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label htmlFor="company">Company / Organization</Label>
                <Input
                  id="company"
                  value={company}
                  onChange={(e) => setCompany(e.target.value)}
                  placeholder="e.g. Heartland Aggregates LLC"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="role">Your Role</Label>
                <Input
                  id="role"
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  placeholder="e.g. Acquisitions Director"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button onClick={signNda} disabled={submitting || !company}>
                {submitting ? "Signing…" : "Sign & Continue"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </>
    );
  }

  // Stage 2: NDA signed, payment required
  if (!paid) {
    return (
      <div className="rounded-2xl border border-border bg-gradient-to-br from-amber-50/50 to-stone-50 p-8 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-amber-600 text-white">
          <CreditCard className="h-6 w-6" />
        </div>
        <h3 className="mt-4 font-heading text-xl font-semibold text-foreground">
          NDA Signed — Complete Payment
        </h3>
        <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
          Your non-disclosure agreement is on file. Pay the one-time data room
          access fee to unlock core drilling logs and environmental reports.
        </p>
        <div className="mt-5 flex items-center justify-center gap-2">
          <span className="font-display text-4xl font-bold text-foreground">
            ${ACCESS_FEE}
          </span>
          <span className="text-sm text-muted-foreground">one-time access</span>
        </div>
        <Button
          className="mt-5"
          onClick={startCheckout}
          disabled={paying || verifying}
        >
          {paying ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Redirecting to checkout…
            </>
          ) : (
            <>
              <CreditCard className="mr-2 h-4 w-4" />
              Pay ${ACCESS_FEE} & Unlock
            </>
          )}
        </Button>
        {verifying && (
          <p className="mt-3 text-xs text-muted-foreground">
            Verifying your payment…
          </p>
        )}
      </div>
    );
  }

  // Stage 3: paid — data room unlocked
  return (
    <div className="rounded-2xl border border-emerald-200 bg-emerald-50/40 p-6">
      <div className="flex items-center gap-2 text-emerald-800">
        <ShieldCheck className="h-5 w-5" />
        <h3 className="font-heading text-lg font-semibold">Data Room Unlocked</h3>
      </div>
      <p className="mt-1 text-sm text-emerald-700">
        NDA on file and access fee paid. Confidential due-diligence materials are
        now available.
      </p>
      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <a
          href={listing.core_drilling_url || "#"}
          target="_blank"
          rel="noreferrer"
          className={`flex items-center gap-3 rounded-xl border border-border bg-card p-4 transition hover:shadow-md ${
            !listing.core_drilling_url ? "pointer-events-none opacity-50" : ""
          }`}
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-stone-900 text-stone-50">
            <FileText className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground">Core Drilling Logs</p>
            <p className="truncate text-xs text-muted-foreground">Geotech & borehole data</p>
          </div>
          <Download className="ml-auto h-4 w-4 text-muted-foreground" />
        </a>
        <a
          href={listing.environmental_report_url || "#"}
          target="_blank"
          rel="noreferrer"
          className={`flex items-center gap-3 rounded-xl border border-border bg-card p-4 transition hover:shadow-md ${
            !listing.environmental_report_url ? "pointer-events-none opacity-50" : ""
          }`}
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-700 text-emerald-50">
            <FlaskConical className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground">Environmental Samples</p>
            <p className="truncate text-xs text-muted-foreground">Phase I & II reports</p>
          </div>
          <Download className="ml-auto h-4 w-4 text-muted-foreground" />
        </a>
      </div>
    </div>
  );
}