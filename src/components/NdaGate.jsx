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
import { Lock, FileText, FlaskConical, ShieldCheck, Download } from "lucide-react";

export default function NdaGate({ listing }) {
  const [access, setAccess] = useState(false);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [company, setCompany] = useState("");
  const [role, setRole] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const existing = await base44.entities.NDAAgreement.filter(
          { listing_id: listing.id },
          "-created_date",
          1
        );
        if (active && existing.length > 0) setAccess(true);
      } catch (e) {
        /* ignore */
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
      setAccess(true);
      setOpen(false);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="rounded-2xl border border-border bg-muted/30 p-8 text-center text-sm text-muted-foreground">
        Checking data room access…
      </div>
    );
  }

  if (!access) {
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
            Sign the mutual non-disclosure agreement to unlock access.
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
                By signing, you agree to keep all confidential parcel data — core drilling
                results, environmental reports, and boundary surveys — strictly private.
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
                {submitting ? "Signing…" : "Sign & Unlock"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </>
    );
  }

  return (
    <div className="rounded-2xl border border-emerald-200 bg-emerald-50/40 p-6">
      <div className="flex items-center gap-2 text-emerald-800">
        <ShieldCheck className="h-5 w-5" />
        <h3 className="font-heading text-lg font-semibold">Data Room Unlocked</h3>
      </div>
      <p className="mt-1 text-sm text-emerald-700">
        NDA on file. Confidential due-diligence materials are now available.
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