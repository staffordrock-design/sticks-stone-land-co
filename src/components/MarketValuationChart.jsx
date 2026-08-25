import React, { useMemo } from "react";
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, ReferenceLine,
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

function compactMoney(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1, style: "currency", currency: "USD" }).format(n);
}

function compactNum(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(n);
}

/**
 * Market Valuation Trend chart for a mine site.
 * Combines the site's MSHA activity (employee hours per period) with statewide
 * USGS market production value to show how the site tracks against its market.
 */
export default function MarketValuationChart({ site, production = [], usgsMarketProduction = [], valuation = null }) {
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
      if ((r.record_type === "S&S Estimate" || r.is_estimate) && r.estimate_low != null && r.estimate_high != null) {
        points[key].estLow = Number(r.estimate_low);
        points[key].estHigh = Number(r.estimate_high);
      }
    }

    // Statewide USGS market production value by period — the market context.
    const marketRows = usgsMarketProduction.filter((r) => !siteGroup || r.commodity_group === siteGroup);
    for (const r of marketRows) {
      if (!r.year) continue;
      const key = periodKey(r.year, r.period);
      if (!points[key]) points[key] = { label: periodLabel(r.year, r.period), sort: key };
      if (r.quantity_metric_tons != null) {
        points[key].marketTons = Number(r.quantity_metric_tons);
      }
      // prior_year_annual_value_usd is the most reliable dollar figure USGS publishes per quarter.
      if (r.prior_year_annual_value_usd != null) {
        points[key].marketValue = Number(r.prior_year_annual_value_usd);
      }
    }

    return Object.values(points).sort((a, b) => a.sort.localeCompare(b.sort));
  }, [production, usgsMarketProduction, siteGroup]);

  const hasSiteData = data.some((d) => d.siteHours != null);
  const hasMarketData = data.some((d) => d.marketValue != null || d.marketTons != null);

  if (!hasSiteData && !hasMarketData) {
    return (
      <div className="rounded-xl border border-border bg-muted/20 p-6 text-center text-sm text-muted-foreground">
        Market trend data is not connected for this site yet. USGS statewide production and MSHA activity records will populate this chart as quarterly syncs accumulate.
      </div>
    );
  }

  const valuationLow = valuation?.available ? valuation.low : null;
  const valuationHigh = valuation?.available ? valuation.high : null;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.14em] text-sky-800">
            <TrendingUp className="h-4 w-4" /> Market valuation trend
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {site?.state ? `${site.state} ` : ""}statewide {siteGroup ? siteGroup.toLowerCase() : "aggregate"} market value vs. this site's MSHA activity over recent reporting periods.
          </p>
        </div>
        <div className="flex flex-wrap gap-3 text-[11px]">
          <div className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-sm bg-sky-500" /><span className="text-muted-foreground">Site activity (hrs)</span></div>
          <div className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-full bg-emerald-600" /><span className="text-muted-foreground">State market value ($)</span></div>
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
              yAxisId="value"
              orientation="right"
              tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v) => compactMoney(v)}
              label={{ value: "Market $", angle: 90, position: "insideRight", style: { fontSize: 10, fill: "hsl(var(--muted-foreground))" } }}
            />
            <Tooltip
              contentStyle={{ fontSize: 12, borderRadius: 12, border: "1px solid hsl(var(--border))", background: "hsl(var(--popover))" }}
              formatter={(value, name) => {
                if (name === "Site activity (hrs)") return [Number(value).toLocaleString() + " hrs", name];
                if (name === "State market value") return [compactMoney(value), name];
                return [value, name];
              }}
            />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            {hasSiteData && (
              <Bar yAxisId="hours" dataKey="siteHours" name="Site activity (hrs)" fill="hsl(199 89% 48%)" radius={[4, 4, 0, 0]} maxBarSize={42} />
            )}
            {hasMarketData && (
              <Line
                yAxisId="value"
                type="monotone"
                dataKey="marketValue"
                name="State market value"
                stroke="hsl(142 71% 45%)"
                strokeWidth={2.5}
                dot={{ r: 4, fill: "hsl(142 71% 45%)" }}
                activeDot={{ r: 6 }}
                connectNulls
              />
            )}
            {valuationLow != null && valuationHigh != null && (
              <ReferenceLine yAxisId="value" y={valuationHigh} stroke="hsl(var(--accent))" strokeDasharray="4 4" label={{ value: "Valuation high", fontSize: 10, fill: "hsl(var(--muted-foreground))", position: "insideTopRight" }} />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-3 flex items-start gap-2 rounded-lg border border-border bg-muted/20 p-3 text-[11px] leading-5 text-muted-foreground">
        <Activity className="mt-0.5 h-3.5 w-3.5 shrink-0 text-sky-600" />
        <p>
          Bars show this mine's MSHA employee hours per reporting period (a proxy for operating intensity). The line shows the statewide USGS {siteGroup ? siteGroup.toLowerCase() : "aggregate"} production value for {site?.state || "the state"} — the broader market this site sells into.
          {valuation?.available ? ` The dashed line marks the high end of S&S's indicative valuation range (${compactMoney(valuationHigh)}).` : ""}
          {" "}Statewide figures are USGS survey estimates, not this quarry's confidential tonnage.
        </p>
      </div>
    </div>
  );
}