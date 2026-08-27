import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { Building2, Check, Flag, Handshake, Heart, Loader2, MessageCircle, Mountain, Send, ShieldBan, UserPlus, Users } from "lucide-react";

const POST_TYPES = ["Update", "Opportunity", "Equipment", "Hiring", "Project", "Question", "News"];

export default function Network() {
  const { user } = useAuth();
  const [tab, setTab] = useState("feed");
  const [loading, setLoading] = useState(true);
  const [posting, setPosting] = useState(false);
  const [body, setBody] = useState("");
  const [postType, setPostType] = useState("Update");
  const [profile, setProfile] = useState(null);
  const [profiles, setProfiles] = useState([]);
  const [posts, setPosts] = useState([]);
  const [connections, setConnections] = useState([]);
  const [blocks, setBlocks] = useState([]);
  const [notice, setNotice] = useState("");

  const load = async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      const [mine, people, feed, links, blocked] = await Promise.all([
        base44.entities.UserProfile.filter({ user_id: user.id }, "-updated_date", 1),
        base44.entities.UserProfile.list("-updated_date", 250),
        base44.entities.NetworkPost.list("-created_at", 250),
        base44.entities.ProfessionalConnection.list("-created_at", 500),
        base44.entities.UserBlock.filter({ blocker_user_id: user.id }, "-created_at", 250),
      ]);
      setProfile(mine?.[0] || null);
      setProfiles((people || []).filter((p) => p.user_id !== user.id && p.profile_visibility !== "Private"));
      setPosts((feed || []).filter((p) => p.status === "Published"));
      setConnections(links || []);
      setBlocks(blocked || []);
    } catch (error) {
      console.error("Network load failed", error);
      setNotice("The network could not refresh. Pull down or try again.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [user?.id]);

  const blockedIds = useMemo(() => new Set(blocks.map((b) => b.blocked_user_id)), [blocks]);
  const visiblePosts = useMemo(() => posts.filter((p) => !blockedIds.has(p.author_user_id)), [posts, blockedIds]);

  const relationFor = (otherId) => connections.find((c) =>
    (c.requester_user_id === user?.id && c.recipient_user_id === otherId) ||
    (c.recipient_user_id === user?.id && c.requester_user_id === otherId)
  );

  const createPost = async (event) => {
    event.preventDefault();
    const text = body.trim();
    if (!text || !user?.id) return;
    setPosting(true);
    try {
      await base44.entities.NetworkPost.create({
        author_user_id: user.id,
        author_name: profile?.full_name || user.name || user.email || "Member",
        author_company: profile?.company || "",
        author_headline: profile?.headline || profile?.role_title || profile?.account_type || "",
        post_type: postType,
        body: text,
        created_at: new Date().toISOString(),
        status: "Published",
      });
      setBody("");
      setPostType("Update");
      await load();
    } finally {
      setPosting(false);
    }
  };

  const connect = async (person) => {
    if (!user?.id) return;
    const current = relationFor(person.user_id);
    if (current) return;
    await base44.entities.ProfessionalConnection.create({
      requester_user_id: user.id,
      recipient_user_id: person.user_id,
      requester_name: profile?.full_name || user.name || user.email || "Member",
      recipient_name: person.full_name || person.email || "Member",
      status: "Pending",
      created_at: new Date().toISOString(),
    });
    await load();
  };

  const accept = async (connection) => {
    await base44.entities.ProfessionalConnection.update(connection.id, {
      ...connection,
      status: "Accepted",
      responded_at: new Date().toISOString(),
    });
    await load();
  };

  const blockUser = async (targetUserId) => {
    if (!targetUserId || targetUserId === user?.id || blockedIds.has(targetUserId)) return;
    await base44.entities.UserBlock.create({
      blocker_user_id: user.id,
      blocked_user_id: targetUserId,
      reason: "Blocked from network",
      created_at: new Date().toISOString(),
    });
    setNotice("Member blocked. Their posts are hidden from your network.");
    await load();
  };

  const reportPost = async (post) => {
    await base44.entities.ContentReport.create({
      reporter_user_id: user.id,
      reported_user_id: post.author_user_id,
      content_type: "Post",
      content_id: post.id,
      reason: "Other",
      details: "Reported from S&S Quarry Network feed for moderator review.",
      status: "Open",
      created_at: new Date().toISOString(),
    });
    setNotice("Post reported for review.");
  };

  if (!user?.id) return <div className="min-h-screen bg-background px-6 py-16 text-center"><Users className="mx-auto h-9 w-9 text-muted-foreground"/><h1 className="mt-4 font-heading text-2xl font-bold">Sign in for the S&amp;S Quarry Network</h1><p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">Your Apple Full Quarry Intelligence subscription remains active without an S&amp;S account. An account is only needed for profiles, connections, posts and messages.</p><div className="mt-6 flex flex-wrap justify-center gap-3"><Link to="/login?returnTo=/network" className="rounded-xl bg-slate-900 px-5 py-3 text-sm font-bold text-white">Sign in</Link><Link to="/register?returnTo=/network" className="rounded-xl border border-border px-5 py-3 text-sm font-bold">Create account</Link></div></div>;

  if (loading) return <div className="min-h-screen flex items-center justify-center bg-background"><Loader2 className="h-7 w-7 animate-spin text-slate-700" /></div>;

  return (
    <div className="min-h-screen bg-slate-50 pb-28 dark:bg-background">
      <header className="sticky top-0 z-30 border-b border-border bg-card/95 backdrop-blur">
        <div className="mx-auto max-w-6xl px-4 py-4 sm:px-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-sky-700">S&amp;S Quarry Network</p>
              <h1 className="font-heading text-2xl font-bold">Industry Network</h1>
            </div>
            <Link to="/messages" className="inline-flex h-10 items-center gap-2 rounded-xl border border-border bg-card px-3 text-sm font-bold"><MessageCircle className="h-4 w-4" />Messages</Link>
          </div>
          <div className="mt-4 grid grid-cols-2 rounded-xl bg-muted p-1">
            <button onClick={() => setTab("feed")} className={`rounded-lg px-3 py-2 text-sm font-bold ${tab === "feed" ? "bg-card shadow-sm" : "text-muted-foreground"}`}>Feed</button>
            <button onClick={() => setTab("people")} className={`rounded-lg px-3 py-2 text-sm font-bold ${tab === "people" ? "bg-card shadow-sm" : "text-muted-foreground"}`}>People</button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-5 sm:px-6">
        {notice && <div className="mb-4 rounded-xl border border-sky-200 bg-sky-50 p-3 text-sm font-semibold text-sky-950">{notice}</div>}

        {tab === "feed" ? (
          <div className="grid gap-5 lg:grid-cols-[280px_1fr]">
            <aside className="hidden lg:block">
              <div className="sticky top-28 rounded-2xl border border-border bg-card p-5 shadow-sm">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-900 text-white"><Mountain className="h-6 w-6" /></div>
                <div className="mt-4 font-heading text-xl font-bold">{profile?.full_name}</div>
                <div className="mt-1 text-sm text-muted-foreground">{profile?.headline || profile?.role_title || profile?.account_type}</div>
                {profile?.company && <div className="mt-2 flex items-center gap-2 text-sm"><Building2 className="h-4 w-4" />{profile.company}</div>}
                <Link to="/profile" className="mt-4 inline-block text-sm font-bold text-sky-800">Edit professional profile</Link>
              </div>
            </aside>

            <section className="min-w-0 space-y-4">
              <form onSubmit={createPost} className="rounded-2xl border border-border bg-card p-4 shadow-sm">
                <div className="flex gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-900 text-sm font-bold text-white">{(profile?.full_name || user?.email || "S").slice(0,1).toUpperCase()}</div>
                  <div className="min-w-0 flex-1">
                    <textarea value={body} onChange={(e) => setBody(e.target.value)} maxLength={1500} placeholder="Share an industry update, opportunity, equipment need, project, or question…" className="min-h-24 w-full resize-none rounded-xl border border-border bg-background p-3 text-sm outline-none focus:ring-2 focus:ring-sky-300" />
                    <div className="mt-3 flex items-center justify-between gap-3">
                      <select value={postType} onChange={(e) => setPostType(e.target.value)} className="rounded-lg border border-border bg-background px-3 py-2 text-xs font-bold">
                        {POST_TYPES.map((type) => <option key={type}>{type}</option>)}
                      </select>
                      <button disabled={posting || !body.trim()} className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-bold text-white disabled:opacity-40">{posting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}Post</button>
                    </div>
                  </div>
                </div>
              </form>

              {visiblePosts.map((post) => (
                <article key={post.id} className="rounded-2xl border border-border bg-card p-5 shadow-sm">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex min-w-0 gap-3">
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-slate-800 text-sm font-bold text-white">{(post.author_name || "M").slice(0,1).toUpperCase()}</div>
                      <div className="min-w-0">
                        <div className="truncate font-bold">{post.author_name || "Industry member"}</div>
                        <div className="truncate text-xs text-muted-foreground">{[post.author_headline, post.author_company].filter(Boolean).join(" · ")}</div>
                        <div className="mt-0.5 text-[11px] text-muted-foreground">{post.created_at ? new Date(post.created_at).toLocaleString() : ""}</div>
                      </div>
                    </div>
                    <span className="rounded-full bg-sky-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-sky-800">{post.post_type}</span>
                  </div>
                  <p className="mt-4 whitespace-pre-wrap text-[15px] leading-6 text-foreground">{post.body}</p>
                  <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-border pt-3">
                    <button className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-semibold text-muted-foreground"><Heart className="h-4 w-4" />Like</button>
                    {post.author_user_id !== user?.id && <Link to={`/messages?user=${encodeURIComponent(post.author_user_id)}`} className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-semibold text-muted-foreground"><MessageCircle className="h-4 w-4" />Message</Link>}
                    {post.author_user_id !== user?.id && <button onClick={() => reportPost(post)} className="ml-auto inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-semibold text-muted-foreground"><Flag className="h-4 w-4" />Report</button>}
                    {post.author_user_id !== user?.id && <button onClick={() => blockUser(post.author_user_id)} className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-semibold text-muted-foreground"><ShieldBan className="h-4 w-4" />Block</button>}
                  </div>
                </article>
              ))}
              {visiblePosts.length === 0 && <div className="rounded-2xl border border-dashed border-border bg-card p-10 text-center"><Handshake className="mx-auto h-8 w-8 text-muted-foreground" /><div className="mt-3 font-bold">The quarry network starts here</div><p className="mt-1 text-sm text-muted-foreground">Be the first to share an industry update or opportunity.</p></div>}
            </section>
          </div>
        ) : (
          <section>
            <div className="mb-4 flex items-center gap-2"><Users className="h-5 w-5" /><h2 className="font-heading text-xl font-bold">People in the quarry industry</h2></div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {profiles.filter((p) => !blockedIds.has(p.user_id)).map((person) => {
                const relation = relationFor(person.user_id);
                const incoming = relation?.recipient_user_id === user?.id && relation?.status === "Pending";
                return <div key={person.id} className="rounded-2xl border border-border bg-card p-5 shadow-sm">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-900 text-lg font-bold text-white">{(person.full_name || "M").slice(0,1).toUpperCase()}</div>
                  <div className="mt-4 font-heading text-lg font-bold">{person.full_name}</div>
                  <div className="mt-1 text-sm text-muted-foreground">{person.headline || person.role_title || person.account_type}</div>
                  {person.company && <div className="mt-2 flex items-center gap-2 text-sm"><Building2 className="h-4 w-4" />{person.company}</div>}
                  {person.commodities_of_interest && <div className="mt-3 text-xs leading-5 text-muted-foreground">Rock interests: {person.commodities_of_interest}</div>}
                  <div className="mt-5 flex flex-wrap gap-2">
                    {incoming ? <button onClick={() => accept(relation)} className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-3 py-2 text-xs font-bold text-white"><Check className="h-4 w-4" />Accept</button>
                      : relation?.status === "Accepted" ? <span className="inline-flex items-center gap-2 rounded-xl bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-800"><Handshake className="h-4 w-4" />Connected</span>
                      : relation?.status === "Pending" ? <span className="inline-flex items-center rounded-xl bg-muted px-3 py-2 text-xs font-bold text-muted-foreground">Pending</span>
                      : <button onClick={() => connect(person)} className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-3 py-2 text-xs font-bold text-white"><UserPlus className="h-4 w-4" />Connect</button>}
                    <Link to={`/messages?user=${encodeURIComponent(person.user_id)}`} className="inline-flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-xs font-bold"><MessageCircle className="h-4 w-4" />Message</Link>
                  </div>
                </div>;
              })}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
