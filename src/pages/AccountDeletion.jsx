import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Trash2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { Button } from "@/components/ui/button";

export default function AccountDeletion() {
  const { user } = useAuth();
  const [reason, setReason] = useState("");
  const [existing, setExisting] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!user?.id) return;
    (async () => {
      try {
        const rows = await base44.entities.AccountDeletionRequest.filter({ user_id: user.id }, "-created_date", 1);
        setExisting(rows?.[0] || null);
      } catch (e) {
        console.error("Deletion request lookup failed", e);
      }
    })();
  }, [user?.id]);

  const submit = async () => {
    if (!user?.id || !user?.email || existing) return;
    setSubmitting(true);
    setMessage("");
    try {
      const row = await base44.entities.AccountDeletionRequest.create({
        user_id: user.id,
        user_name: user.name || "",
        user_email: user.email,
        reason,
        status: "requested",
        requested_at: new Date().toISOString(),
      });
      setExisting(row);
      setMessage("Your account deletion request has been submitted.");
    } catch (e) {
      setMessage(e?.message || "Could not submit the deletion request.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-background/90 backdrop-blur">
        <div className="mx-auto max-w-3xl px-6 py-4">
          <Link to="/" className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" />Back to Sticks & Stone</Link>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-6 py-12">
        <div className="rounded-2xl border border-border bg-card p-7">
          <div className="flex items-center gap-3"><div className="flex h-11 w-11 items-center justify-center rounded-xl bg-red-50 text-red-700"><Trash2 className="h-5 w-5" /></div><div><p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Account</p><h1 className="font-heading text-2xl font-bold">Delete my account</h1></div></div>
          {!user?.id ? (
            <p className="mt-6 text-sm text-muted-foreground">Sign in to request deletion of your Sticks & Stone account.</p>
          ) : existing ? (
            <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-950">
              <div className="font-semibold">Deletion request on file</div>
              <div className="mt-1">Status: {existing.status || "requested"}</div>
              <div className="mt-1 text-xs">Requested: {existing.requested_at ? new Date(existing.requested_at).toLocaleString() : "—"}</div>
            </div>
          ) : (
            <>
              <p className="mt-6 text-sm leading-6 text-muted-foreground">Submitting this request starts deletion of your Sticks & Stone account and associated profile data. Some records may be retained when needed for payment, fraud-prevention, NDA, transaction, security, or legal obligations.</p>
              <label className="mt-5 block text-sm font-medium text-foreground" htmlFor="delete-reason">Reason (optional)</label>
              <textarea id="delete-reason" value={reason} onChange={(e) => setReason(e.target.value)} rows={4} className="mt-2 w-full rounded-xl border border-input bg-background p-3 text-sm outline-none focus:ring-2 focus:ring-ring" placeholder="Tell us why you're leaving, if you want." />
              <Button variant="destructive" className="mt-5" onClick={submit} disabled={submitting}>{submitting ? "Submitting…" : "Request account deletion"}</Button>
            </>
          )}
          {message && <p className="mt-4 text-sm text-muted-foreground">{message}</p>}
        </div>
      </main>
    </div>
  );
}
