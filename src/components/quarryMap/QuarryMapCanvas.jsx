import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  CircleMarker,
  LayersControl,
  MapContainer,
  Popup,
  TileLayer,
  Tooltip,
  useMap,
  useMapEvents,
  WMSTileLayer,
} from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { rockCategoryColor, rockCategoryFor } from "@/lib/rockTypes";
import TennesseeParcelLayer from "./TennesseeParcelLayer";
import { isPlausibleSoutheastCoordinate } from "@/utils/coordinates";

const USGS_GEOLOGY_WMS = "https://mrdata.usgs.gov/services/sgmc/wms";
const CENSUS_COUNTY_WMS = "https://tigerweb.geo.census.gov/arcgis/services/TIGERweb/tigerWMS_ACS2026/MapServer/WMSServer";
const DEFAULT_CENTER = [34.6, -85.4];
const STATE_FIPS = { "01": "AL", "12": "FL", "13": "GA", "21": "KY", "28": "MS", "37": "NC", "45": "SC", "47": "TN" };
const EMPTY = new Map();
const EMPTY_SITES = [];

function statusGroup(status = "") {
  const s = String(status).toLowerCase();
  if (s.includes("intermittent") || s.includes("temporarily idled") || s.includes("nonproducing") || s.includes("non-producing") || s.includes("inactive")) return "Inactive / Idled";
  if (s.includes("historical") || s.includes("abandon")) return "Historical / Abandoned";
  if (s.includes("active")) return "Active";
  return "New / Potential";
}

function statusColor(group) {
  if (group === "Active") return "#15803d";
  if (group === "Inactive / Idled") return "#d97706";
  if (group === "Historical / Abandoned") return "#64748b";
  return "#2563eb";
}

function clusterSites(sites, zoom) {
  if (zoom >= 9) return sites.map((site) => ({ kind: "site", site }));
  const cell = zoom <= 5 ? 1.25 : zoom === 6 ? 0.7 : zoom === 7 ? 0.35 : 0.18;
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

// Accepts either a Map (search page) or a plain keyed object (home page).
function lookupRow(source, key) {
  if (!source || !key) return null;
  if (typeof source.get === "function") return source.get(key) || null;
  return source[key] || null;
}

function formatDate(value) {
  if (!value) return "Not dated";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleDateString();
}

function ZoomWatcher({ onZoom }) {
  const map = useMap();
  useEffect(() => {
    const handler = () => onZoom(map.getZoom());
    handler();
    map.on("zoomend", handler);
    return () => map.off("zoomend", handler);
  }, [map, onZoom]);
  return null;
}

function ViewportReporter({ onChange }) {
  useMapEvents({
    moveend(event) {
      const map = event.target;
      const b = map.getBounds();
      onChange({
        zoom: map.getZoom(),
        bounds: { south: b.getSouth(), west: b.getWest(), north: b.getNorth(), east: b.getEast() },
      });
    },
  });
  return null;
}

function CountyClickPicker({ enabled, onCounty }) {
  useMapEvents({
    async click(event) {
      if (!enabled) return;
      const { lat, lng } = event.latlng;
      try {
        const params = new URLSearchParams({
          where: "1=1",
          geometry: `${lng},${lat}`,
          geometryType: "esriGeometryPoint",
          inSR: "4326",
          spatialRel: "esriSpatialRelIntersects",
          outFields: "STATE,BASENAME,NAME",
          returnGeometry: "false",
          f: "json",
        });
        const response = await fetch(`https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/State_County/MapServer/1/query?${params.toString()}`);
        const data = await response.json();
        const attributes = data?.features?.[0]?.attributes;
        if (attributes?.BASENAME) {
          onCounty({
            county: attributes.BASENAME,
            state: STATE_FIPS[String(attributes.STATE || "").padStart(2, "0")] || null,
          });
        }
      } catch {
        // County selection stays optional if Census TIGERweb is unavailable.
      }
    },
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

function MineralCluster({ group }) {
  const map = useMap();
  return (
    <CircleMarker
      center={[group.lat, group.lng]}
      radius={Math.min(22, 9 + Math.log2(group.sites.length + 1) * 2.7)}
      pathOptions={{ color: "#fff", weight: 2, fillColor: "#6d28d9", fillOpacity: 0.9 }}
      eventHandlers={{ click: () => map.flyTo([group.lat, group.lng], Math.min(11, map.getZoom() + 2), { duration: 0.45 }) }}
    >
      <Tooltip permanent direction="center" className="ss-map-cluster-count">{group.sites.length}</Tooltip>
    </CircleMarker>
  );
}

function MineralDepositLayer({ minerals, zoom }) {
  const grouped = useMemo(() => clusterSites(minerals.slice(0, 1500), zoom), [minerals, zoom]);
  return grouped.map((item) => {
    if (item.kind === "cluster") {
      return <MineralCluster key={`usgs-cluster-${item.lat}-${item.lng}-${item.sites.length}`} group={item} />;
    }
    const occurrence = item.site;
    const source = String(occurrence.source_url || "");
    const trustedSource = /^https:\/\/mrdata\.usgs\.gov\//i.test(source) ? source : null;
    return (
      <CircleMarker
        key={`usgs-${occurrence.mrds_id || occurrence.id}`}
        center={[Number(occurrence.latitude), Number(occurrence.longitude)]}
        radius={zoom >= 10 ? 6 : 4}
        pathOptions={{ color: "#ffffff", weight: 1.5, fillColor: "#7c3aed", fillOpacity: 0.9 }}
      >
        <Tooltip direction="top"><span className="text-xs font-semibold">USGS: {occurrence.occurrence_name || "Mineral occurrence"}</span></Tooltip>
        <Popup>
          <div className="min-w-[225px] space-y-1 text-xs">
            <strong className="block text-sm">{occurrence.occurrence_name || "Mineral occurrence"}</strong>
            <div><b>USGS MRDS:</b> {occurrence.mrds_id || "Unlisted"}</div>
            <div><b>Commodity:</b> {occurrence.commodity_list || occurrence.commodity || "Not reported"}</div>
            {occurrence.deposit_type && <div><b>Deposit type:</b> {occurrence.deposit_type}</div>}
            {occurrence.development_status && <div><b>Reported status:</b> {occurrence.development_status}</div>}
            {occurrence.match_status && <div><b>S&S match:</b> {occurrence.match_status}</div>}
            {occurrence.mining_site_id && occurrence.match_status === "matched" && (
              <Link to={`/mines/${occurrence.mining_site_id}`} className="block font-semibold text-sky-700 underline">View related mine record</Link>
            )}
            {trustedSource && <a href={trustedSource} target="_blank" rel="noopener noreferrer" className="block font-semibold text-violet-700 underline">View USGS source</a>}
            <p className="pt-1 text-[11px] text-slate-500">Historical/recorded mineral occurrence; not proof of current reserves, grade, recoverability or land rights.</p>
          </div>
        </Popup>
      </CircleMarker>
    );
  });
}

function MapController({ sites, selectedId }) {
  const map = useMap();

  useEffect(() => {
    if (!sites.length) return;
    const selected = sites.find((s) => s.id === selectedId);
    if (selected) {
      map.flyTo([Number(selected.latitude), Number(selected.longitude)], Math.max(map.getZoom(), 11), { duration: 0.6 });
      return;
    }
    const points = sites
      .slice(0, 250)
      .map((s) => [Number(s.latitude), Number(s.longitude)])
      .filter(([lat, lng]) => Number.isFinite(lat) && Number.isFinite(lng));
    if (!points.length) return;
    if (points.length === 1) map.setView(points[0], 10);
    else map.fitBounds(points, { padding: [28, 28], maxZoom: 9 });
  }, [map, selectedId, sites]);

  return null;
}

function SitePopup({ site, geo, parcel, verification, premium }) {
  const rock = geo?.primary_rock || geo?.lithology || site.commodity;
  const owner = verification?.owner_name || parcel?.owner_name;
  const parcelId = verification?.parcel_id || parcel?.parcel_id || site.parcel_id;
  const deed = verification?.deed_book_page || parcel?.deed_book_page;
  const acreage = parcel?.acreage || site.acreage;
  const isListing = site.is_verified_listing && site.listing_id;

  return (
    <div className="min-w-[240px]">
      <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
        {isListing ? "Verified seller listing" : "Quarry intelligence record"}
      </div>
      <strong className="mt-1 block text-base leading-snug">{site.mine_name || "Quarry / Mine Site"}</strong>
      <div className="text-xs text-slate-600">{[site.county, site.state].filter(Boolean).join(", ") || "Location on file"}</div>

      <div className="mt-2 flex flex-wrap gap-1">
        <span className="rounded-full bg-slate-900 px-2 py-0.5 text-[10px] font-bold text-white">{statusGroup(site.mine_status)}</span>
        {site.source && <span className="rounded-full border border-slate-300 px-2 py-0.5 text-[10px] font-bold text-slate-700">{site.source}</span>}
      </div>

      {rock && (
        <div className="mt-2 text-xs">
          <span className="font-bold">Rock:</span> {rock} <span className="text-slate-500">({rockCategoryFor(rock)})</span>
        </div>
      )}
      {Number(acreage) > 0 && <div className="text-xs"><span className="font-bold">Acreage:</span> {Number(acreage).toLocaleString()}</div>}

      {premium ? (
        <>
          {owner && <div className="text-xs"><span className="font-bold">Owner:</span> {owner}</div>}
          {parcelId && <div className="text-xs"><span className="font-bold">Parcel:</span> {parcelId}</div>}
          {deed && <div className="text-xs"><span className="font-bold">Deed:</span> {deed}</div>}
          {site.msha_mine_id && <div className="text-xs"><span className="font-bold">MSHA ID:</span> {site.msha_mine_id}</div>}
        </>
      ) : (
        <div className="mt-2 rounded-lg border border-sky-200 bg-sky-50 p-2 text-[11px] leading-4 text-sky-900">
          Owner, parcel, deed, geology, permit and production detail unlock with Full Quarry Intelligence.
        </div>
      )}

      <div className="mt-2 text-[10px] text-slate-500">
        Source checked {formatDate(verification?.verified_at || parcel?.last_source_update || site.last_source_update)}
      </div>

      <Link
        to={isListing ? `/listings/${site.listing_id}` : `/mines/${site.id}`}
        className="mt-2 inline-block text-xs font-bold text-sky-800"
      >
        {isListing ? "Open listing →" : premium ? "Open full intelligence →" : "Open record →"}
      </Link>
    </div>
  );
}

export default function QuarryMapCanvas({
  sites = [],
  geologyMap = EMPTY,
  parcelByMine = EMPTY,
  verificationBySite = EMPTY,
  premium = false,
  selectedId = null,
  onSelectSite,
  onViewport,
  countyPickMode = false,
  onCountyPick,
  minerals = EMPTY_SITES,
  showParcels = false,
  onParcelStatus,
}) {
  const [zoom, setZoom] = useState(6);

  const mappedSites = useMemo(
    () => sites.filter((site) => isPlausibleSoutheastCoordinate(site.latitude, site.longitude, site.state)),
    [sites]
  );

  const clusterItems = useMemo(() => clusterSites(mappedSites.slice(0, 3000), zoom), [mappedSites, zoom]);
  const handleZoom = useCallback((next) => setZoom(next), []);

  return (
    <MapContainer
      center={DEFAULT_CENTER}
      zoom={6}
      minZoom={4}
      style={{ height: "100%", width: "100%" }}
      scrollWheelZoom
    >
      <MapController sites={mappedSites} selectedId={selectedId} />
      <ZoomWatcher onZoom={handleZoom} />
      {onViewport && <ViewportReporter onChange={onViewport} />}
      {onCountyPick && <CountyClickPicker enabled={countyPickMode} onCounty={onCountyPick} />}
      {showParcels && <TennesseeParcelLayer onStatus={onParcelStatus} />}
      {minerals.length > 0 && <MineralDepositLayer minerals={minerals} zoom={zoom} />}

      <LayersControl position="topright">
        <LayersControl.BaseLayer checked name="Street">
          <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="&copy; OpenStreetMap contributors" />
        </LayersControl.BaseLayer>
        <LayersControl.BaseLayer name="Satellite / aerial">
          <TileLayer url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}" attribution="Tiles &copy; Esri" />
        </LayersControl.BaseLayer>
        <LayersControl.BaseLayer name="USGS Topographic">
          <TileLayer url="https://basemap.nationalmap.gov/arcgis/rest/services/USGSTopo/MapServer/tile/{z}/{y}/{x}" attribution="&copy; USGS National Map" />
        </LayersControl.BaseLayer>
        <LayersControl.Overlay name="Bedrock geology (USGS)">
          <WMSTileLayer url={USGS_GEOLOGY_WMS} layers="SGMC" format="image/png" transparent opacity={0.58} attribution="USGS State Geologic Map Compilation" />
        </LayersControl.Overlay>
        <LayersControl.Overlay checked name="County boundaries (Census)">
          <WMSTileLayer url={CENSUS_COUNTY_WMS} layers="11" format="image/png" transparent opacity={0.55} attribution="U.S. Census Bureau TIGERweb" />
        </LayersControl.Overlay>
      </LayersControl>

      {clusterItems.map((item) => {
        if (item.kind === "cluster") {
          return <ClusterBubble key={`cluster-${item.lat}-${item.lng}-${item.sites.length}`} cluster={item} />;
        }
        const site = item.site;
        const geo = lookupRow(geologyMap, site.id) || (site.msha_mine_id ? lookupRow(geologyMap, `msha:${site.msha_mine_id}`) : null);
        const parcel = site.msha_mine_id ? lookupRow(parcelByMine, String(site.msha_mine_id)) : null;
        const verification = lookupRow(verificationBySite, site.id) || (site.msha_mine_id ? lookupRow(verificationBySite, `msha:${site.msha_mine_id}`) : null);
        const rock = geo?.primary_rock || geo?.lithology || site.commodity;
        const linked = Boolean(verification?.status === "Verified" || parcel?.source_url);
        const isSelected = selectedId === site.id;

        return (
          <CircleMarker
            key={site.id}
            center={[Number(site.latitude), Number(site.longitude)]}
            radius={isSelected ? 10 : linked ? 8 : 6}
            pathOptions={{
              color: statusColor(statusGroup(site.mine_status)),
              weight: isSelected ? 5 : linked ? 3 : 2,
              fillColor: rockCategoryColor(rock),
              fillOpacity: 0.92,
            }}
            eventHandlers={{ click: () => onSelectSite?.(site.id) }}
          >
            <Popup>
              <SitePopup site={site} geo={geo} parcel={parcel} verification={verification} premium={premium} />
            </Popup>
          </CircleMarker>
        );
      })}
    </MapContainer>
  );
}