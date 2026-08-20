import React from "react";
import { ROCK_CATEGORY_COLORS, ROCK_CATEGORY_ORDER, ROCK_CATEGORY_LABELS } from "../../base44/shared/rockTypes";

export default function GeologyMapLegend({ compact = false }) {
  return (
    <div className={`rounded-xl border border-border bg-card/95 p-3 shadow-sm backdrop-blur ${compact ? "max-w-[180px]" : "max-w-[220px]"}`}>
      <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
        Rock / Material Type
      </div>
      <div className="space-y-1.5">
        {ROCK_CATEGORY_ORDER.map((cat) => (
          <div key={cat} className="flex items-start gap-2">
            <span
              className="mt-0.5 h-3 w-3 shrink-0 rounded-full border border-white/40"
              style={{ backgroundColor: ROCK_CATEGORY_COLORS[cat] }}
            />
            <div className="leading-tight">
              <div className="text-[11px] font-semibold text-foreground">{cat}</div>
              {!compact && (
                <div className="text-[10px] text-muted-foreground">{ROCK_CATEGORY_LABELS[cat]}</div>
              )}
            </div>
          </div>
        ))}
        <div className="flex items-start gap-2 border-t border-border pt-1.5">
          <span className="mt-0.5 h-3 w-3 shrink-0 rounded-full border border-white/40 bg-slate-500" />
          <div className="text-[11px] font-semibold text-foreground">Unclassified</div>
        </div>
      </div>
    </div>
  );
}