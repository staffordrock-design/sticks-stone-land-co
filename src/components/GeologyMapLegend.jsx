import React from "react";
import { ROCK_CATEGORY_COLORS, ROCK_CATEGORY_ORDER, ROCK_CATEGORY_LABELS } from "../../base44/shared/rockTypes";

export default function GeologyMapLegend({ compact = false }) {
  return (
    <div className={`rounded-lg border border-border bg-card/90 shadow-sm backdrop-blur ${compact ? "max-w-[118px] p-1.5" : "max-w-[220px] p-3"}`}>
      <div className={`${compact ? "mb-1 text-[8px]" : "mb-2 text-[10px]"} font-bold uppercase tracking-[0.12em] text-muted-foreground`}>
        Rock type
      </div>
      <div className={compact ? "space-y-0.5" : "space-y-1.5"}>
        {ROCK_CATEGORY_ORDER.map((cat) => (
          <div key={cat} className={`flex items-start ${compact ? "gap-1" : "gap-2"}`}>
            <span
              className={`${compact ? "mt-[2px] h-2 w-2" : "mt-0.5 h-3 w-3"} shrink-0 rounded-sm border border-white/40`}
              style={{ backgroundColor: ROCK_CATEGORY_COLORS[cat] }}
            />
            <div className="leading-tight">
              <div className={`${compact ? "text-[8px]" : "text-[11px]"} font-semibold text-foreground`}>{cat}</div>
              {!compact && (
                <div className="text-[10px] text-muted-foreground">{ROCK_CATEGORY_LABELS[cat]}</div>
              )}
            </div>
          </div>
        ))}
        <div className={`flex items-start border-t border-border ${compact ? "gap-1 pt-0.5" : "gap-2 pt-1.5"}`}>
          <span className={`${compact ? "mt-[2px] h-2 w-2" : "mt-0.5 h-3 w-3"} shrink-0 rounded-sm border border-white/40 bg-slate-500`} />
          <div className={`${compact ? "text-[8px]" : "text-[11px]"} font-semibold text-foreground`}>Unclassified</div>
        </div>
      </div>
    </div>
  );
}