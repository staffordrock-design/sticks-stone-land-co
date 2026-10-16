import React, { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  CircleMarker, LayersControl, MapContainer, Popup, TileLayer, Tooltip, WMSTileLayer, useMap, useMapEvents,
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

const US_CENTER = [39.8, -98.6];
const USGS_GEOLOGY_WMS = "https://mrdata.usgs.gov/services/sgmc/wms";
const USGS_MRDS_WMS = "https://mrdata.usgs.gov/services/mrds";
const MACROSTRAT_URL = "https://macrostrat.org/api/v2/geologic_units/map";

// Commodity-based marker color (inline so no cross-boundary import is needed).
function commodityColor(commodity = "") {
  const c = String(commodity || "").toLowerCase();
  if (c.includes("limestone") || c.includes("stone")) return "#1d4ed8";
  if (c.includes("dolomite")) return "#3b82f6";
  if (c.includes("sand")) return "#d97706";
  if (c.includes("gravel")) return "#b45309";
  if (c.includes("granite")) return "#7c3aed";
  if (c.includes("marble")) return "#6d28d9";
  if (c.includes("clay") || c.includes("shale")) return "#15803d";
  if (c.includes("quartz")) return "#0891b2";
  return "#475569";
}

// Grid-based clustering — same approach QuarryMarketplace uses, so 22k+ markers
// stay performant without a clustering dependency.
function clusterSites(sites, zoom) {
  if (zoom >= 9) return sites.map((site) => ({ kind: "site", site }));
  const cell = zoom <= 4 ? 2.0 : zoom === 5 ? 1.2 : zoom === 6 ? 0.7 : zoom === 7 ? 0.35 : 0.18;
  const groups = new Map();
  for (const site of sites) {
    const lat = Number(site.latitude);
    const lng = Number(site.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    const key = `${Math.floor(lat / cell)}:${Math.floor(lng / cell)}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(site);
  }
  return Array.from(groups.values()).map((group) => {
    if (group.length === 1) return { kind: "site", site: group[0] };
    return {
      kind: "cluster",
      sites: group,
      lat: group.reduce((sum, s) => sum + Number(s.latitude), 0) / group.length,
      lng: group.reduce((sum, s) => sum + Number(s.longitude), 0) / group.length,
    };
  });
}

function MapViewportTracker({ onChange }) {
  useMapEvents({
    moveend(event) { onChange(event.target.getZoom()); },
    zoomend(event) { onChange(event.target.getZoom()); },
  });
  return null;
}

function ClusterBubble({ cluster }) {
  const map = useMap();
  const count = cluster.sites.length;
  return (
    <CircleMarker
      center={[cluster.lat, cluster.lng]}
      radius={Math.min(24, 10 + Math.log2(count + 1) * 3)}
      pathOptions={{ color: "#fff", weight: 2.5, fillColor: "#0f172a", fillOpacity: 0.92 }}
      eventHandlers={{ click: () => map.flyTo([cluster.lat, cluster.lng], Math.min(11, map.getZoom() + 2), { duration: 0.5 }) }}
    >
      <Tooltip permanent direction="center" className="ss-map-cluster-count">{count}</Tooltip>
    </CircleMarker>
  );
}

// Click-anywhere geology lookup via the Macrostrat API. Uses an imperative
// Leaflet popup so the popup opens instantly at the click point and updates
// in place when the fetch resolves.
function GeologyClickHandler() {
  const map = useMap();
  useMapEvents({
    async click(e) {
      const { lat, lng } = e.latlng;
      const popup = L.popup().setLatLng([lat, lng]).setContent("Loading geology…").openOn(map);
      try {
        const res = await fetch(`${MACROSTRAT_URL}?lat=${lat}&lng=${lng}`);
        if (!res.ok) throw new Error(`Macrostrat returned ${res.status}`);
        const json = await res.json();
        const unit = json?.success?.data?.[0];
        if (!unit) {
          popup.setContent(`<div style="min-width:200px"><strong>No geologic unit</strong><br/><span style="color:#64748b">No mapped bedrock unit at this location.</span></div>`);
          return;
        }
        const name = unit.strat_name || unit.name || "Unnamed unit";
        const age = unit.best_int_name || [unit.b_int_name, unit.t_int_name].filter(Boolean).join(" – ") || (unit.b_age != null && unit.t_age != null ? `${unit.b_age}–${unit.t_age} Ma` : "");
        const lith = unit.lith || "";
        const descrip = unit.descrip ? String(unit.descrip).slice(0, 220) : "";
        const more = unit.descrip && String(unit.descrip).length > 220 ? "…" : "";
        popup.setContent(
          `<div style="min-width:240px;font-family:ui-sans-serif,system-ui,sans-serif">
            <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.14em;color:#64748b">Macrostrat geologic unit</div>
            <strong style="display:block;margin-top:4px;font-size:14px;color:#0f172a">${name}</strong>
            ${age ? `<div style="font-size:12px;color:#334155;margin-top:2px"><strong>Age:</strong> ${age}</div>` : ""}
            ${lith ? `<div style="font-size:12px;color:#334155;margin-top:2px"><strong>Lithology:</strong> ${lith}</div>` : ""}
            ${descrip ? `<div style="font-size:11px;color:#64748b;margin-top:6px;line-height:1.4">${descrip}${more}</div>` : ""}
            <div style="font-size:10px;color:#94a3b8;margin-top:6px">${lat.toFixed(4)}, ${lng.toFixed(4)} · Macrostrat (CC-BY 4.0)</div>
          </div>`
        );
      } catch (err) {
        popup.setContent(`<div style="min-width:200px"><strong>Could not load geology</strong><br/><span style="color:#64748b">${err?.message || "Try clicking again."}</span></div>`);
      }
    },
  });
  return null;
}

export default function USGeologyMap({ sites = [], listings = [], height = 640 }) {
  const [zoom, setZoom] = useState(4);
  const [showQuarries, setShowQuarries] = useState(true);
  const [showListings, setShowListings] = useState(true);

  const validSites = useMemo(
    () => sites.filter((s) => Number.isFinite(Number(s.latitude)) && Number.isFinite(Number(s.longitude))),
    [sites]
  );
  const validListings = useMemo(
    () => listings.filter((l) => Number.isFinite(Number(l.lat)) && Number.isFinite(Number(l.lng))),
    [listings]
  );
  const clusterItems = useMemo(() => clusterSites(validSites, zoom), [validSites, zoom]);

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card">
      <div className="flex flex-col gap-3 border-b border-border px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">USGS + Macrostrat</p>
          <p className="mt-1 text-sm text-foreground">
            National bedrock geology, MRDS mineral deposits, Southeast quarry sites, and verified listings.
            <span className="ml-1 font-semibold text-sky-700">Click anywhere for the mapped geologic unit.</span>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setShowQuarries((v) => !v)}
            className={`rounded-lg border px-3 py-2 text-sm font-medium transition ${showQuarries ? "border-slate-800 bg-slate-800 text-white" : "border-border bg-background text-muted-foreground hover:bg-muted"}`}
          >
            {showQuarries ? "✓ " : ""}Quarry sites ({validSites.length.toLocaleString()})
          </button>
          <button
            type="button"
            onClick={() => setShowListings((v) => !v)}
            className={`rounded-lg border px-3 py-2 text-sm font-medium transition ${showListings ? "border-emerald-700 bg-emerald-700 text-white" : "border-border bg-background text-muted-foreground hover:bg-muted"}`}
          >
            {showListings ? "✓ " : ""}Verified listings ({validListings.length})
          </button>
        </div>
      </div>

      <div className="relative">
        <MapContainer center={US_CENTER} zoom={4} minZoom={3} style={{ height, width: "100%" }} scrollWheelZoom>
          <MapViewportTracker onChange={setZoom} />
          <GeologyClickHandler />

          <LayersControl position="topright">
            <LayersControl.BaseLayer checked name="USGS Topographic">
              <TileLayer url="https://basemap.nationalmap.gov/arcgis/rest/services/USGSTopo/MapServer/tile/{z}/{y}/{x}" attribution="&copy; USGS National Map" />
            </LayersControl.BaseLayer>
            <LayersControl.BaseLayer name="Street map">
              <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="&copy; OpenStreetMap contributors" />
            </LayersControl.BaseLayer>
            <LayersControl.BaseLayer name="Satellite / aerial">
              <TileLayer url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}" attribution="Tiles &copy; Esri" />
            </LayersControl.BaseLayer>

            <LayersControl.Overlay name="Bedrock geology (USGS SGMC)">
              <WMSTileLayer url={USGS_GEOLOGY_WMS} layers="SGMC" format="image/png" transparent opacity={0.6} attribution="USGS State Geologic Map Compilation" />
            </LayersControl.Overlay>
            <LayersControl.Overlay name="MRDS mineral deposits (USGS)">
              <WMSTileLayer url={USGS_MRDS_WMS} layers="mrds-high,mrds-low" format="image/png" transparent opacity={0.85} attribution="USGS Mineral Resources Data System (MRDS)" />
            </LayersControl.Overlay>
          </LayersControl>

          {showQuarries && clusterItems.map((item) => {
            if (item.kind === "cluster") return <ClusterBubble key={`cluster-${item.lat}-${item.lng}-${item.sites.length}`} cluster={item} />;
            const site = item.site;
            const color = commodityColor(site.commodity);
            return (
              <CircleMarker
                key={site.id}
                center={[Number(site.latitude), Number(site.longitude)]}
                radius={5}
                pathOptions={{ color: "#fff", weight: 1, fillColor: color, fillOpacity: 0.85 }}
              >
                <Popup>
                  <div className="min-w-[220px]">
                    <strong>{site.mine_name || "Quarry / Mine Site"}</strong>
                    <div>{[site.county, site.state].filter(Boolean).join(", ")}</div>
                    {site.commodity && <div>Commodity: {site.commodity}</div>}
                    {site.mine_status && <div>Status: {site.mine_status}</div>}
                    <Link to={`/mines/${site.id}`} className="mt-2 inline-block font-semibold text-sky-800 hover:underline">
                      View site intelligence →
                    </Link>
                  </div>
                </Popup>
              </CircleMarker>
            );
          })}

          {showListings && validListings.map((listing) => (
            <CircleMarker
              key={listing.id}
              center={[Number(listing.lat), Number(listing.lng)]}
              radius={9}
              pathOptions={{ color: "#fff", weight: 3, fillColor: "#059669", fillOpacity: 0.95 }}
            >
              <Popup>
                <div className="min-w-[240px]">
                  <div className="text-xs font-bold uppercase tracking-wider text-emerald-700">Verified listing</div>
                  <strong className="mt-1 block text-base">{listing.title}</strong>
                  <div>{listing.location_name || [listing.county, listing.state].filter(Boolean).join(", ")}</div>
                  {Number(listing.asking_price) > 0 && <div>Asking: ${Number(listing.asking_price).toLocaleString()}</div>}
                  {listing.tier && <div>Tier: {listing.tier}</div>}
                  {Number(listing.acreage) > 0 && <div>Acreage: {Number(listing.acreage).toLocaleString()}</div>}
                  <Link to={`/listings/${listing.id}`} className="mt-2 inline-block font-semibold text-sky-800 hover:underline">
                    Open listing →
                  </Link>
                </div>
              </Popup>
            </CircleMarker>
          ))}
        </MapContainer>

        <div className="pointer-events-none absolute bottom-3 left-3 z-[500] rounded-lg bg-background/90 px-3 py-2 text-[10px] text-muted-foreground shadow-md">
          Geology & MRDS: USGS · Unit lookups: Macrostrat (CC-BY 4.0) · Quarry sites: S&amp;S Rock Holdings
        </div>
      </div>
    </div>
  );
}