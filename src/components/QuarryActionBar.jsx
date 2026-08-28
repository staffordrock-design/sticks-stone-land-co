import React from "react";
import { Link } from "react-router-dom";
import { Network, Share2 } from "lucide-react";
import CompareQuarryButton from "@/components/CompareQuarryButton";
import WatchQuarryButton from "@/components/WatchQuarryButton";

export default function QuarryActionBar({ site }) {
  if (!site) return null;
  return (
    <div className="flex flex-wrap gap-2">
      <WatchQuarryButton site={site} />
      <CompareQuarryButton site={site} />
      <Link
        to={`/network?site=${encodeURIComponent(site.id)}`}
        className="inline-flex items-center gap-2 rounded-xl border border-border px-4 py-2 text-xs font-bold transition hover:bg-muted"
      >
        <Network className="h-4 w-4 text-sky-700" />
        Network intel
      </Link>
      <Link
        to={`/network/community?tab=opportunities&shareMine=${encodeURIComponent(site.id)}`}
        className="inline-flex items-center gap-2 rounded-xl border border-border px-4 py-2 text-xs font-bold transition hover:bg-muted"
      >
        <Share2 className="h-4 w-4 text-sky-700" />
        Post deal
      </Link>
    </div>
  );
}
