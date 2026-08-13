import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Trash2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function AccountDeletion() {
  const { user } = useAuth();
  const [email, setEmail] = useState(user?.email || "");
  const [reason, setReason] = useState("");
  const [existing, setExisting] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (user?.email) setEmail(user.email);
    if (!user?.id) return;
    (async () => {
      try {
        const rows = await base44.entities.AccountDeletionRequest.filter({ user_id: user.id }, "-created_date", 1);
        setExisting(rows?.[0] || null);
      } catch (e) {
        console.error("Deletion request lookup failed", e);
      }
    })();
  }, [user?.id, user?.email]);

  const submit = async () => {
    const cleanEmail = email.trim().toLowerCase();
    if (!user?.id || !cleanEmail || existing) return;
    setSubmitting(true);
    setMessage("");
    try {
      const row = await base44.entities.AccountDeletionRequest.create({
        user_id: user.id,
        user_name: user?.name || "",
        user_email: cleanEmail,
        reason,
        status: "requested",
        requested_at: new Date().toISOString(),
      });
      setExisting(row);
      setMessage("Your S&S Rock Holdings account deletion request has been submitted. The request begins the account-deletion process immediately. Its status will remain visible here while any required manual verification is completed. We will remove the account and associated personal data except records we must retain for legitimate legal, security, payment, transaction, or NDA purposes.");
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
          <Link to="/" className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" />Back to S&S Rock Holdings</Link>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-6 py-12">
        <div className="rounded-2xl border border-border bg-card p-7">
          <div className="flex items-center gap-3"><div className="flex h-11 w-11 items-center justify-center rounded-xl bg-red-50 text-red-700"><Trash2 className="h-5 w-5" /></div><div><p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">S&S Rock Holdings</p><h1 className="font-heading text-2xl font-bold">Delete my account</h1></div></div>

          {!user?.id ? (
            <div className="mt-6 rounded-xl border border-border bg-muted/20 p-5 text-sm text-muted-foreground">
              <div className="font-semibold text-foreground">Sign in to delete your account</div>
              <p className="mt-2 leading-6">For security, account deletion must be initiated while signed in so the request can be tied to the correct S&S Rock Holdings account.</p>
              <Link to="/login" className="mt-4 inline-flex rounded-xl bg-stone-900 px-4 py-2.5 font-semibold text-white">Sign in</Link>
            </div>
          ) : existing ? (
            <div className="mt-6 rounded-xl border border-sky-200 bg-sky-50 p-5 text-sm text-sky-950">
              <div className="font-semibold">Deletion request on file</div>
              <div className="mt-1">Status: {existing.status || "requested"}</div>
              <div className="mt-1 text-xs">Requested: {existing.requested_at ? new Date(existing.requested_at).toLocaleString() : "—"}</div>
            </div>
          ) : (
            <>
              <p className="mt-6 text-sm leading-6 text-muted-foreground">Request deletion of your entire S&S Rock Holdings account and associated personal data here. The request begins the deletion process immediately and remains visible on this page while any required manual verification is completed.</p>
              <label className="mt-5 block text-sm font-medium text-foreground" htmlFor="delete-email">Account email</label>
              <Input id="delete-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="mt-2" placeholder="name@example.com" disabled={Boolean(user?.email)} />
              <label className="mt-5 block text-sm font-medium text-foreground" htmlFor="delete-reason">Reason (optional)</label>
              <textarea id="delete-reason" value={reason} onChange={(e) => setReason(e.target.value)} rows={4} className="mt-2 w-full rounded-xl border border-input bg-background p-3 text-sm outline-none focus:ring-2 focus:ring-ring" placeholder="Tell us why you're leaving, if you want." />
              <Button variant="destructive" className="mt-5" onClick={submit} disabled={submitting || !user?.id || !email.trim()}>{submitting ? "Submitting…" : "Request account deletion"}</Button>
            </>
          )}
          {message && <div className="mt-5 rounded-xl border border-border bg-muted/20 p-4 text-sm leading-6 text-muted-foreground">{message}</div>}
          <p className="mt-6 text-xs leading-5 text-muted-foreground">Deletion removes the account and associated personal data that we are not legally or operationally required to retain. We may retain limited records needed for security, fraud prevention, payments, transactions, signed NDAs, or legal obligations, as described in our <Link to="/privacy" className="underline">Privacy Policy</Link>.</p>
        </div>
      </main>
    </div>
  );
}
