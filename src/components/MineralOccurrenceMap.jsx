import React, { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { MapContainer, TileLayer, CircleMarker, Popup, LayersControl, WMSTileLayer, Tooltip } from "react-leaflet";
import "leaflet/dist/leaflet.css";

const SOUTHEAST_CENTER = [34.6, -85.4];
const USGS_GEOLOGY_WMS = "https://mrdata.usgs.gov/services/sgmc/wms";

const COMMODITY_COLORS = {
  stone: "#2563eb",
  limestone: "#1d4ed8",
  dolomite: "#3b82f6",
  sand: "#d97706",
  gravel: "#b45309",
  granite: "#7c3aed",
  marble: "#6d28d9",
  slate: "#8b5cf6",
  clay: "#16a34a",
  shale: "#15803d",
  quartz: "#0891b2",
  gold: "#ca8a04",
  iron: "#dc2626",
  other: "#64748b",
};

function commodityColor(commodity = "") {
  const c = String(commodity).toLowerCase();
  if (c.includes("stn") || c.includes("stone")) return COMMODITY_COLORS.stone;
  if (c.includes("lst") || c.includes("limestone")) return COMMODITY_COLORS.limestone;
  if (c.includes("dob") || c.includes("dolomite")) return COMMODITY_COLORS.dolomite;
  if (c.includes("sdg") || c.includes("sand")) return COMMODITY_COLORS.sand;
  if (c.includes("grt") || c.includes("gravel")) return COMMODITY_COLORS.gravel;
  if (c.includes("grn") || c.includes("granite")) return COMMODITY_COLORS.granite;
  if (c.includes("mbl") || c.includes("marble")) return COMMODITY_COLORS.marble;
  if (c.includes("slt") || c.includes("slate")) return COMMODITY_COLORS.slate;
  if (c.includes("cly") || c.includes("clay")) return COMMODITY_COLORS.clay;
  if (c.includes("sha") || c.includes("shale")) return COMMODITY_COLORS.shale;
  if (c.includes("qtz") || c.includes("quartz")) return COMMODITY_COLORS.quartz;
  if (c.includes("gold") || c.includes("au")) return COMMODITY_COLORS.gold;
  if (c.includes("iron") || c.includes("fe")) return COMMODITY_COLORS.iron;
  return COMMODITY_COLORS.other;
}

const STATUS_RADIUS = { matched: 8, nearby: 6, historical: 5, unmatched: 4 };
const STATUS_LABELS = {
  matched: "Matched to mine site",
  nearby: "Nearby a mine site",
  historical: "Historical producer",
  unmatched: "Unmatched occurrence",
};

export default function MineralOccurrenceMap({ occurrences = [], height = 600 }) {
  const [stateFilter, setStateFilter] = useState("All");
  const [statusFilter, setStatusFilter] = useState("All");
  const [showGeology, setShowGeology] = useState(false);

  const states = useMemo(() => {
    const set = new Set();
    for (const o of occurrences) if (o.occurrence_state) set.add(o.occurrence_state);
    return ["All", ...[...set].sort()];
  }, [occurrences]);

  const filtered = useMemo(() => {
    return occurrences.filter((o) => {
      if (!o.latitude || !o.longitude) return false;
      const lat = Number(o.latitude);
      const lng = Number(o.longitude);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
      if (stateFilter !== "All" && o.occurrence_state !== stateFilter) return false;
      if (statusFilter !== "All" && o.match_status !== statusFilter) return false;
      return true;
    });
  }, [occurrences, stateFilter, statusFilter]);

  const stats = useMemo(() => {
    const byStatus = { matched: 0, nearby: 0, historical: 0, unmatched: 0 };
    const byState = {};
    for (const o of filtered) {
      byStatus[o.match_status] = (byStatus[o.match_status] || 0) + 1;
      if (o.occurrence_state) byState[o.occurrence_state] = (byState[o.occurrence_state] || 0) + 1;
    }
    return { total: filtered.length, byStatus, byState };
  }, [filtered]);

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card">
      <div className="flex flex-col gap-3 border-b border-border px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
            USGS Mineral Occurrence Intelligence
          </p>
          <p className="mt-1 text-sm text-foreground">
            {stats.total.toLocaleString()} mapped occurrences · colored by commodity, sized by match confidence
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={stateFilter}
            onChange={(e) => setStateFilter(e.target.value)}
            className="rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            aria-label="Filter by state"
          >
            {states.map((s) => (
              <option key={s} value={s}>{s === "All" ? "All states" : s}</option>
            ))}
          </select>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            aria-label="Filter by match status"
          >
            <option value="All">All statuses</option>
            <option value="matched">Matched only</option>
            <option value="nearby">Nearby only</option>
            <option value="historical">Historical only</option>
            <option value="unmatched">Unmatched only</option>
          </select>
          <button
            onClick={() => setShowGeology(!showGeology)}
            className={`rounded-lg border px-3 py-2 text-sm font-medium transition ${showGeology ? "border-slate-800 bg-slate-800 text-white" : "border-border bg-background text-muted-foreground hover:bg-muted"}`}
          >
            Bedrock geology
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-px bg-border sm:grid-cols-4">
        {[
          ["Matched", stats.byStatus.matched, "#1d4ed8"],
          ["Nearby", stats.byStatus.nearby, "#3b82f6"],
          ["Historical", stats.byStatus.historical, "#64748b"],
          ["Unmatched", stats.byStatus.unmatched, "#94a3b8"],
        ].map(([label, count, color]) => (
          <div key={label} className="bg-background px-5 py-3">
            <div className="flex items-center gap-2">
              <span className="inline-block h-3 w-3 rounded-full" style={{ backgroundColor: color }} />
              <span className="font-heading text-xl font-bold text-foreground">{count.toLocaleString()}</span>
            </div>
            <div className="mt-1 text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">{label}</div>
          </div>
        ))}
      </div>

      <div className="relative">
        <MapContainer
          center={SOUTHEAST_CENTER}
          zoom={5}
          minZoom={4}
          style={{ height, width: "100%" }}
          scrollWheelZoom
        >
          <LayersControl position="topright">
            <LayersControl.BaseLayer checked name="Street map">
              <TileLayer
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                attribution="&copy; OpenStreetMap contributors"
              />
            </LayersControl.BaseLayer>
            <LayersControl.BaseLayer name="Satellite / aerial">
              <TileLayer
                url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
                attribution="Tiles &copy; Esri"
              />
            </LayersControl.BaseLayer>
            <LayersControl.BaseLayer name="USGS Topographic">
              <TileLayer
                url="https://basemap.nationalmap.gov/arcgis/rest/services/USGSTopo/MapServer/tile/{z}/{y}/{x}"
                attribution="&copy; USGS National Map"
              />
            </LayersControl.BaseLayer>
            {showGeology && (
              <LayersControl.Overlay checked name="Bedrock geology (USGS)">
                <WMSTileLayer
                  url={USGS_GEOLOGY_WMS}
                  layers="SGMC"
                  format="image/png"
                  transparent
                  opacity={0.6}
                  attribution="USGS State Geologic Map Compilation"
                />
              </LayersControl.Overlay>
            )}
          </LayersControl>

          {filtered.map((o) => {
            const color = commodityColor(o.commodity);
            const radius = STATUS_RADIUS[o.match_status] || 4;
            const isHighInterest = o.match_status === "matched" || o.match_status === "nearby";
            return (
              <CircleMarker
                key={o.id}
                center={[Number(o.latitude), Number(o.longitude)]}
                radius={radius}
                pathOptions={{
                  color: isHighInterest ? "#fff" : "rgba(255,255,255,0.5)",
                  weight: isHighInterest ? 1.5 : 1,
                  fillColor: color,
                  fillOpacity: o.match_status === "matched" ? 0.9 : 0.65,
                }}
              >
                <Tooltip direction="top" offset={[0, -radius]} opacity={1}>
                  <span className="text-xs font-semibold">{o.occurrence_name}</span>
                </Tooltip>
                <Popup>
                  <div className="min-w-[240px]">
                    <strong>{o.occurrence_name}</strong>
                    {o.development_status && <div className="mt-1 text-xs text-slate-600">{o.development_status}</div>}
                    <div className="mt-2 space-y-1 text-xs">
                      <div><strong>MRDS ID:</strong> {o.mrds_id}</div>
                      <div><strong>State:</strong> {o.occurrence_state || "—"}</div>
                      {o.occurrence_county && <div><strong>County:</strong> {o.occurrence_county}</div>}
                      {o.commodity && (
                        <div className="flex items-center gap-1.5">
                          <strong>Commodity:</strong>
                          <span className="inline-block h-2.5 w-2.5 rounded-full border border-white/40" style={{ backgroundColor: color }} />
                          {o.commodity}
                        </div>
                      )}
                      {o.commodity_list && o.commodity_list !== o.commodity && (
                        <div><strong>Commodities:</strong> {o.commodity_list}</div>
                      )}
                      {o.deposit_type && <div><strong>Deposit type:</strong> {o.deposit_type}</div>}
                      {o.mineralogy && <div><strong>Mineralogy:</strong> {o.mineralogy}</div>}
                      {o.host_rock && <div><strong>Host rock:</strong> {o.host_rock}</div>}
                      {o.production_size && <div><strong>Production size:</strong> {o.production_size}</div>}
                      {o.operation_type && <div><strong>Operation:</strong> {o.operation_type}</div>}
                      <div><strong>Match:</strong> {STATUS_LABELS[o.match_status] || o.match_status}</div>
                      {o.distance_meters != null && o.match_status === "matched" && (
                        <div><strong>Distance to mine:</strong> {Math.round(o.distance_meters)} m</div>
                      )}
                    </div>
                    {o.match_status === "matched" && o.mining_site_id && (
                      <Link to={`/mines/${o.mining_site_id}`} className="mt-2 inline-block font-semibold text-sky-700 hover:underline">
                        View mine site intelligence →
                      </Link>
                    )}
                    {o.source_url && (
                      <a href={o.source_url} target="_blank" rel="noopener noreferrer" className="mt-1 block text-xs text-slate-500 hover:underline">
                        USGS MRDS source record ↗
                      </a>
                    )}
                  </div>
                </Popup>
              </CircleMarker>
            );
          })}
        </MapContainer>

        <div className="pointer-events-none absolute bottom-3 left-3 z-[500] rounded-lg bg-background/90 px-3 py-2 shadow-md">
          <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Commodity legend</p>
          <div className="grid grid-cols-2 gap-x-3 gap-y-1">
            {[
              ["Stone / Limestone", "#1d4ed8"],
              ["Sand / Gravel", "#b45309"],
              ["Granite / Marble", "#6d28d9"],
              ["Clay / Shale", "#15803d"],
              ["Quartz", "#0891b2"],
              ["Other", "#64748b"],
            ].map(([label, color]) => (
              <div key={label} className="flex items-center gap-1.5">
                <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
                <span className="text-[10px] text-foreground">{label}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="pointer-events-none absolute bottom-3 right-3 z-[500] rounded-lg bg-background/90 px-3 py-2 shadow-md">
          <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Marker size = confidence</p>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5"><span className="inline-block h-4 w-4 rounded-full bg-slate-700" /><span className="text-[10px] text-foreground">Matched</span></div>
            <div className="flex items-center gap-1.5"><span className="inline-block h-3 w-3 rounded-full bg-slate-500" /><span className="text-[10px] text-foreground">Nearby</span></div>
            <div className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-full bg-slate-400" /><span className="text-[10px] text-foreground">Historical</span></div>
          </div>
        </div>
      </div>

      <div className="border-t border-border px-5 py-3">
        <p className="text-xs text-muted-foreground">
          {stats.total.toLocaleString()} occurrences displayed. Filter by state and match status to isolate investment clusters —
          areas with dense <strong>matched</strong> or <strong>nearby</strong> markers indicate active mineral districts with existing mine infrastructure.
          Toggle the bedrock geology overlay to see what formations underlie each cluster.
        </p>
      </div>
    </div>
  );
}