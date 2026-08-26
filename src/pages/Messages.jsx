import React, { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowLeft, Flag, Loader2, Send, ShieldBan } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";

function threadKey(a, b) { return [a, b].sort().join(":"); }

export default function Messages() {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const [profiles, setProfiles] = useState([]);
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState("");
  const selectedId = params.get("user") || "";

  const load = async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      const [people, rows] = await Promise.all([
        base44.entities.UserProfile.list("full_name", 250),
        base44.entities.MarketplaceMessage.list("-sent_at", 500),
      ]);
      setProfiles((people || []).filter((p) => p.user_id !== user.id && p.profile_visibility !== "Private"));
      setMessages(rows || []);
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [user?.id]);

  const selected = profiles.find((p) => p.user_id === selectedId) || null;
  const conversation = useMemo(() => {
    if (!selectedId || !user?.id) return [];
    return messages.filter((m) =>
      (m.sender_user_id === user.id && m.recipient_user_id === selectedId) ||
      (m.sender_user_id === selectedId && m.recipient_user_id === user.id)
    ).sort((a,b) => new Date(a.sent_at || 0) - new Date(b.sent_at || 0));
  }, [messages, selectedId, user?.id]);

  const send = async (event) => {
    event.preventDefault();
    const body = text.trim();
    if (!body || !selectedId || !user?.id) return;
    setSending(true);
    try {
      await base44.entities.MarketplaceMessage.create({
        thread_key: threadKey(user.id, selectedId),
        sender_user_id: user.id,
        recipient_user_id: selectedId,
        message: body,
        sent_at: new Date().toISOString(),
        status: "Sent",
      });
      setText("");
      await load();
    } finally { setSending(false); }
  };

  const reportMessage = async (message) => {
    await base44.entities.ContentReport.create({
      reporter_user_id: user.id,
      reported_user_id: message.sender_user_id,
      content_type: "Message",
      content_id: message.id,
      reason: "Other",
      details: "Direct message reported from S&S Quarry Network.",
      status: "Open",
      created_at: new Date().toISOString(),
    });
    setNotice("Message reported for moderator review.");
  };

  const block = async () => {
    if (!selectedId) return;
    const existing = await base44.entities.UserBlock.filter({ blocker_user_id: user.id, blocked_user_id: selectedId }, "-created_at", 1);
    if (!existing?.length) await base44.entities.UserBlock.create({ blocker_user_id: user.id, blocked_user_id: selectedId, reason: "Blocked from messages", created_at: new Date().toISOString() });
    setNotice("Member blocked.");
    setParams({});
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center bg-background"><Loader2 className="h-7 w-7 animate-spin" /></div>;

  return <div className="min-h-screen bg-slate-50 pb-28 dark:bg-background">
    <header className="sticky top-0 z-30 border-b border-border bg-card/95 backdrop-blur">
      <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-4 sm:px-6"><Link to="/network" className="rounded-lg p-2"><ArrowLeft className="h-5 w-5" /></Link><div><p className="text-[11px] font-bold uppercase tracking-[0.2em] text-sky-700">S&amp;S Quarry Network</p><h1 className="font-heading text-xl font-bold">Messages</h1></div></div>
    </header>
    <main className="mx-auto grid max-w-5xl gap-4 px-4 py-5 sm:px-6 md:grid-cols-[280px_1fr]">
      <aside className="rounded-2xl border border-border bg-card p-3 shadow-sm">
        <div className="px-2 pb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">Industry members</div>
        <div className="max-h-[65vh] space-y-1 overflow-auto">{profiles.map((p) => <button key={p.id} onClick={() => setParams({user:p.user_id})} className={`w-full rounded-xl px-3 py-3 text-left ${selectedId === p.user_id ? "bg-sky-50 text-sky-950" : "hover:bg-muted"}`}><div className="font-bold">{p.full_name}</div><div className="truncate text-xs text-muted-foreground">{p.headline || p.role_title || p.company || p.account_type}</div></button>)}</div>
      </aside>
      <section className="flex min-h-[60vh] flex-col rounded-2xl border border-border bg-card shadow-sm">
        {!selected ? <div className="flex flex-1 items-center justify-center p-8 text-center text-sm text-muted-foreground">Choose an industry member to start a private conversation.</div> : <>
          <div className="flex items-center justify-between gap-3 border-b border-border p-4"><div><div className="font-bold">{selected.full_name}</div><div className="text-xs text-muted-foreground">{selected.headline || selected.role_title || selected.company}</div></div><button onClick={block} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-2 text-xs font-bold text-muted-foreground"><ShieldBan className="h-4 w-4" />Block</button></div>
          {notice && <div className="m-3 rounded-xl bg-sky-50 p-3 text-sm font-semibold text-sky-950">{notice}</div>}
          <div className="flex-1 space-y-3 overflow-auto p-4">{conversation.map((m) => { const mine=m.sender_user_id===user.id; return <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}><div className={`max-w-[82%] rounded-2xl px-4 py-3 text-sm leading-6 ${mine ? "bg-slate-900 text-white" : "bg-muted"}`}><div>{m.message}</div><div className={`mt-1 flex items-center justify-between gap-3 text-[10px] ${mine ? "text-slate-300" : "text-muted-foreground"}`}><span>{m.sent_at ? new Date(m.sent_at).toLocaleString() : ""}</span>{!mine && <button onClick={() => reportMessage(m)} className="inline-flex items-center gap-1"><Flag className="h-3 w-3" />Report</button>}</div></div></div>})}{conversation.length===0 && <div className="py-10 text-center text-sm text-muted-foreground">No messages yet. Say hello.</div>}</div>
          <form onSubmit={send} className="flex gap-2 border-t border-border p-3"><input value={text} onChange={(e)=>setText(e.target.value)} maxLength={1200} placeholder="Message…" className="input flex-1" /><button disabled={sending || !text.trim()} className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-slate-900 text-white disabled:opacity-40">{sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}</button></form>
        </>}
      </section>
    </main>
  </div>;
}
