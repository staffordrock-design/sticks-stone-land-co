import React, { useMemo } from "react";
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import { TrendingUp, Activity } from "lucide-react";

function periodKey(year, period) {
  const q = String(period || "").replace(/\D/g, "") || "0";
  return `${year}-${q.padStart(2, "0")}`;
}

function periodLabel(year, period) {
  const p = String(period || "");
  return `${year} ${p}`.trim();
}

function compactNum(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(n);
}

/**
 * Production & Market Trend chart for a mine site.
 * Bars: this site's MSHA employee hours per reporting period (operational intensity).
 * Line: statewide USGS quarterly production tonnage for the matching commodity group
 *       (market context — NOT this quarry's tonnage, which USGS does not publish).
 */
export default function MarketValuationChart({ site, production = [], usgsMarketProduction = [] }) {
  const siteGroup = useMemo(() => {
    const text = `${site?.commodity || ""} ${site?.mine_name || ""}`.toLowerCase();
    if (/construction sand.{0,8}gravel|sand\s*(and|&)\s*gravel/.test(text)) return "Construction Sand and Gravel";
    if (/crushed|broken|aggregate|limestone|dolomite|granite|traprock|quartzite|chert|shale|marble/.test(text)) return "Crushed Stone";
    return null;
  }, [site]);

  const data = useMemo(() => {
    const points = {};

    // Per-site MSHA activity (employee hours) by period — the site's operational trend.
    for (const r of production) {
      if (!r.year) continue;
      const key = periodKey(r.year, r.period);
      if (!points[key]) points[key] = { label: periodLabel(r.year, r.period), sort: key };
      if (r.record_type === "MSHA Activity" && r.employee_hours != null) {
        const prev = points[key].siteHours || 0;
        points[key].siteHours = prev + Number(r.employee_hours);
      }
    }

    // Statewide USGS quarterly tonnage by period — market context.
    // Uses quantity_metric_tons (the current-period estimate), NOT prior_year_annual_value_usd
    // (which is a prior full-year dollar figure, not a quarterly value).
    const marketRows = usgsMarketProduction.filter((r) => !siteGroup || r.commodity_group === siteGroup);
    for (const r of marketRows) {
      if (!r.year || r.quantity_metric_tons == null) continue;
      const key = periodKey(r.year, r.period);
      if (!points[key]) points[key] = { label: periodLabel(r.year, r.period), sort: key };
      points[key].marketTons = Number(r.quantity_metric_tons);
    }

    return Object.values(points).sort((a, b) => a.sort.localeCompare(b.sort));
  }, [production, usgsMarketProduction, siteGroup]);

  const hasSiteData = data.some((d) => d.siteHours != null);
  const hasMarketData = data.some((d) => d.marketTons != null);

  if (!hasSiteData && !hasMarketData) {
    return (
      <div className="rounded-xl border border-border bg-muted/20 p-6 text-center text-sm text-muted-foreground">
        Production trend data is not connected for this site yet. MSHA activity and USGS statewide quarterly figures will populate this chart as syncs accumulate.
      </div>
    );
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.14em] text-sky-800">
            <TrendingUp className="h-4 w-4" /> Production &amp; market trend
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {site?.state ? `${site.state} ` : ""}statewide {siteGroup ? siteGroup.toLowerCase() : "aggregate"} quarterly tonnage vs. this site's MSHA activity.
          </p>
        </div>
        <div className="flex flex-wrap gap-3 text-[11px]">
          <div className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-sm bg-sky-500" /><span className="text-muted-foreground">Site activity (hrs)</span></div>
          <div className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-full bg-emerald-600" /><span className="text-muted-foreground">State tons</span></div>
        </div>
      </div>

      <div className="h-[280px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 4, left: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.5} />
            <XAxis dataKey="label" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={{ stroke: "hsl(var(--border))" }} />
            <YAxis
              yAxisId="hours"
              orientation="left"
              tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v) => compactNum(v)}
              label={{ value: "Hours", angle: -90, position: "insideLeft", style: { fontSize: 10, fill: "hsl(var(--muted-foreground))" } }}
            />
            <YAxis
              yAxisId="tons"
              orientation="right"
              tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v) => compactNum(v)}
              label={{ value: "State tons", angle: 90, position: "insideRight", style: { fontSize: 10, fill: "hsl(var(--muted-foreground))" } }}
            />
            <Tooltip
              contentStyle={{ fontSize: 12, borderRadius: 12, border: "1px solid hsl(var(--border))", background: "hsl(var(--popover))" }}
              formatter={(value, name) => {
                if (name === "Site activity (hrs)") return [Number(value).toLocaleString() + " hrs", name];
                if (name === "Statewide tons") return [Number(value).toLocaleString() + " t", name];
                return [value, name];
              }}
            />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            {hasSiteData && (
              <Bar yAxisId="hours" dataKey="siteHours" name="Site activity (hrs)" fill="hsl(199 89% 48%)" radius={[4, 4, 0, 0]} maxBarSize={42} />
            )}
            {hasMarketData && (
              <Line
                yAxisId="tons"
                type="monotone"
                dataKey="marketTons"
                name="Statewide tons"
                stroke="hsl(142 71% 45%)"
                strokeWidth={2.5}
                dot={{ r: 4, fill: "hsl(142 71% 45%)" }}
                activeDot={{ r: 6 }}
                connectNulls
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-3 flex items-start gap-2 rounded-lg border border-border bg-muted/20 p-3 text-[11px] leading-5 text-muted-foreground">
        <Activity className="mt-0.5 h-3.5 w-3.5 shrink-0 text-sky-600" />
        <p>
          Bars show this mine's MSHA employee hours per reporting period (a proxy for operating intensity). The line shows statewide USGS {siteGroup ? siteGroup.toLowerCase() : "aggregate"} quarterly production tonnage for {site?.state || "the state"} — the broader market this site sells into. Statewide figures are USGS survey estimates, not this quarry's confidential tonnage.
        </p>
      </div>
    </div>
  );
}