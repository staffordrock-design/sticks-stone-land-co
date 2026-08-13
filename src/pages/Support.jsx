import React, { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, LifeBuoy, Send } from "lucide-react";
import { base44 } from "@/api/base44Client";

export default function Support() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  const submit = async (event) => {
    event.preventDefault();
    if (!email.trim() || !message.trim()) return;
    setSending(true);
    setError("");
    try {
      await base44.entities.PublicSupportRequest.create({
        name: name.trim(),
        email: email.trim().toLowerCase(),
        subject: subject.trim() || "Customer support request",
        message: message.trim(),
        status: "New",
        created_at: new Date().toISOString(),
      });
      setSent(true);
    } catch (e) {
      setError(e?.message || "We could not send your support request. Please try again.");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-background/90 backdrop-blur">
        <div className="mx-auto max-w-3xl px-6 py-4">
          <Link to="/" className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" />Back to S&amp;S Rock Holdings</Link>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-6 py-12">
        <div className="rounded-2xl border border-border bg-card p-7">
          <div className="flex items-center gap-3"><div className="flex h-11 w-11 items-center justify-center rounded-xl bg-sky-700 text-white"><LifeBuoy className="h-5 w-5" /></div><div><p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">S&amp;S Rock Holdings</p><h1 className="font-heading text-2xl font-bold">Support</h1></div></div>
          <p className="mt-5 text-sm leading-6 text-muted-foreground">Questions about your account, a quarry record, marketplace activity, reports, privacy, or access? Send S&amp;S Rock Holdings a support request here.</p>
          {sent ? (
            <div className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 p-5 text-sm text-emerald-950"><div className="font-semibold">Support request received</div><p className="mt-1">Thank you. Your request is now in the S&amp;S support queue.</p></div>
          ) : (
            <form onSubmit={submit} className="mt-6 space-y-4">
              <label className="block text-sm font-medium">Name<input className="input mt-2" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" /></label>
              <label className="block text-sm font-medium">Email<input className="input mt-2" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" /></label>
              <label className="block text-sm font-medium">Subject<input className="input mt-2" value={subject} onChange={(e) => setSubject(e.target.value)} /></label>
              <label className="block text-sm font-medium">How can we help?<textarea className="input mt-2 min-h-32" required value={message} onChange={(e) => setMessage(e.target.value)} /></label>
              {error && <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div>}
              <button disabled={sending} className="inline-flex items-center gap-2 rounded-xl bg-stone-900 px-5 py-3 text-sm font-semibold text-white disabled:opacity-60"><Send className="h-4 w-4" />{sending ? "Sending…" : "Send support request"}</button>
            </form>
          )}
          <div className="mt-8 flex flex-wrap gap-4 border-t border-border pt-5 text-sm text-muted-foreground"><Link to="/privacy" className="hover:text-foreground hover:underline">Privacy Policy</Link><Link to="/terms" className="hover:text-foreground hover:underline">Terms of Use</Link><Link to="/account/delete" className="hover:text-foreground hover:underline">Delete account</Link></div>
        </div>
      </main>
    </div>
  );
}
