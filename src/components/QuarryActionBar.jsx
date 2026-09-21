import React from "react";
import { Link } from "react-router-dom";
import { MessageCircleQuestion, FileSearch } from "lucide-react";
import WatchQuarryButton from "@/components/WatchQuarryButton";

export default function QuarryActionBar({ site }) {
  if (!site) return null;
  return (
    <div className="flex flex-wrap gap-2">
      <WatchQuarryButton site={site} />
      <Link
        to={`/get-started?mode=buyer&site=${encodeURIComponent(site.id)}`}
        className="inline-flex items-center gap-2 rounded-xl border border-border px-4 py-2 text-xs font-bold transition hover:bg-muted"
      >
        <MessageCircleQuestion className="h-4 w-4 text-sky-700" />
        Ask About This Property
      </Link>
      <Link
        to={`/get-started?mode=report&site=${encodeURIComponent(site.id)}`}
        className="inline-flex items-center gap-2 rounded-xl border border-border px-4 py-2 text-xs font-bold transition hover:bg-muted"
      >
        <FileSearch className="h-4 w-4 text-sky-700" />
        Request Property Research
      </Link>
    </div>
  );
}
