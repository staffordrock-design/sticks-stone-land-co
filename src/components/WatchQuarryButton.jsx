import React, { useEffect, useState } from "react";
import { Bell, BookmarkCheck, Loader2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";

export default function WatchQuarryButton({ site, className = "" }) {
  const { user } = useAuth();
  const [saved, setSaved] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!user?.id || !site?.id) { setSaved(null); return undefined; }
    (async () => {
      try {
        const rows = await base44.entities.SavedOpportunity.filter({ user_id: user.id, mining_site_id: site.id }, "-saved_at", 1);
        if (!cancelled) setSaved(rows?.[0] || null);
      } catch {
        if (!cancelled) setSaved(null);
      }
    })();
    return () => { cancelled = true; };
  }, [user?.id, site?.id]);

  const toggle = async () => {
    if (!site?.id) return;
    if (!user?.id) {
      window.location.href = `/login?returnTo=${encodeURIComponent(`/mines/${site.id}`)}`;
      return;
    }
    setBusy(true);
    try {
      if (saved?.id) {
        await base44.entities.SavedOpportunity.delete(saved.id);
        setSaved(null);
      } else {
        const created = await base44.entities.SavedOpportunity.create({
          user_id: user.id,
          mining_site_id: site.id,
          listing_id: site.listing_id || "",
          resource_name: site.mine_name || "Quarry opportunity",
          notes: "Watching for S&S quarry intelligence and opportunity changes.",
          saved_at: new Date().toISOString(),
        });
        setSaved(created);
      }
    } finally { setBusy(false); }
  };

  return <button type="button" onClick={toggle} disabled={busy} className={`inline-flex items-center gap-2 rounded-xl border border-border px-4 py-2 text-xs font-bold transition hover:bg-muted disabled:opacity-60 ${className}`}>
    {busy ? <Loader2 className="h-4 w-4 animate-spin"/> : saved ? <BookmarkCheck className="h-4 w-4 text-emerald-700"/> : <Bell className="h-4 w-4 text-sky-700"/>}
    {saved ? "Watching quarry" : "Watch this quarry"}
  </button>;
}
