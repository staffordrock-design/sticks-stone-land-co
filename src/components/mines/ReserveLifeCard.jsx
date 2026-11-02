import React from "react";
import { Clock, Layers, Ruler, DollarSign } from "lucide-react";

function money(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return "—";
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${Math.round(n / 1_000).toLocaleString()}K`;
  return `$${Math.round(n).toLocaleString()}`;
}

function tons(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M tons`;
  if (n >= 1_000) return `${Math.round(n / 1_000).toLocaleString()}K tons`;
  return `${Math.round(n).toLocaleString()} tons`;
}

// Stored reserve-life and in-ground value screening for one quarry record.
export default function ReserveLifeCard({ site }) {
  const hasReserve = Number(site?.reserve_tons_mid) > 0;
  if (!hasReserve) return null;

  const life = Number(site.remaining_life_years);
  const marketMid = Number(site.screening_value_mid);

  return (
    <div className="rounded-2xl border border-border bg-card p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-sky-700">Reserve life &amp; in-ground value</div>
          <h3 className="mt-1 font-heading text-xl font-bold text-foreground">
            {money(site.reserve_value_low)} – {money(site.reserve_value_high)}
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Midpoint {money(site.reserve_value_mid)} · {money(site.reserve_value_per_acre)}/acre · {site.reserve_value_confidence || "Low"} confidence
          </p>
        </div>
        <div className="rounded-xl border border-border bg-muted/40 px-4 py-3 text-right">
          <div className="flex items-center justify-end gap-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground"><Clock className="h-3 w-3" /> Remaining life</div>
          <div className="mt-1 text-xl font-black text-foreground">
            {Number.isFinite(life) && life > 0 ? (life >= 200 ? "200+ years" : `${life.toLocaleString()} years`) : "Not modeled"}
          </div>
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-border bg-background p-3">
          <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground"><Layers className="h-3 w-3" /> Screening reserve</div>
          <div className="mt-1 text-sm font-bold text-foreground">{tons(site.reserve_tons_low)} – {tons(site.reserve_tons_high)}</div>
          <div className="text-xs text-muted-foreground">midpoint {tons(site.reserve_tons_mid)}</div>
        </div>
        <div className="rounded-xl border border-border bg-background p-3">
          <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground"><Ruler className="h-3 w-3" /> Acreage &amp; depth</div>
          <div className="mt-1 text-sm font-bold text-foreground">{Number(site.reserve_acres).toLocaleString()} acres</div>
          <div className="text-xs text-muted-foreground">{site.reserve_acres_basis || "Acreage"} · {site.mineable_depth_ft} ft assumed depth</div>
        </div>
        <div className="rounded-xl border border-border bg-background p-3">
          <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground"><DollarSign className="h-3 w-3" /> Market value</div>
          <div className="mt-1 text-sm font-bold text-foreground">{marketMid > 0 ? money(marketMid) : "Not modeled"}</div>
          <div className="text-xs text-muted-foreground">{marketMid > 0 ? "comparable-sales basis" : "no comparable range stored"}</div>
        </div>
      </div>

      <div className="mt-4 rounded-xl border border-border bg-muted/30 p-4 text-xs leading-5 text-muted-foreground">
        <p>
          <strong className="text-foreground">{site.reserve_rock_class}</strong> reserve screening: acreage × assumed mineable depth × rock density × recovery, valued at in-ground royalty rates.
          {Number(site.annual_production_tons) > 0 ? ` Divided by the modeled ${Number(site.annual_production_tons).toLocaleString()} tons/year to estimate remaining life.` : " No annual production model is connected yet, so no life figure is shown."}
        </p>
        <p className="mt-2">
          This is a screening range, not a certified reserve, appraisal, or guaranteed recoverable value. Permitted acreage, zoning, environmental constraints, stripping ratio, product mix, and market pricing change the real figure.
        </p>
      </div>
    </div>
  );
}