import React, { useMemo } from "react";
import { Link } from "react-router-dom";
import { MapContainer, TileLayer, CircleMarker, Popup, LayersControl, WMSTileLayer } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { rockCategoryColor, rockCategoryFor } from "../../base44/shared/rockTypes";
import GeologyMapLegend from "./GeologyMapLegend";
import { isPlausibleSoutheastCoordinate } from "@/utils/coordinates";

const SOUTHEAST_CENTER = [34.6, -85.4];

// USGS State Geologic Map Compilation WMS — colored bedrock geology tiles
// showing what rock formation is underground across the US.
const USGS_GEOLOGY_WMS = "https://mrdata.usgs.gov/services/sgmc/wms";

export default function TennesseeMineMap({ sites = [], geologyMap = {}, height = 520, previewMode = false }) {
  const mappedSites = useMemo(
    () => sites.filter((site) => isPlausibleSoutheastCoordinate(site.latitude, site.longitude, site.state)),
    [sites]
  );

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card">
      <div className="flex flex-col gap-1 border-b border-border px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
            Southeast Quarry Intelligence Map
          </p>
          <p className="mt-1 text-sm text-foreground">
            {mappedSites.length.toLocaleString()} mapped mine and quarry records{previewMode ? " · detailed geology available with membership" : " · markers colored by rock type"}
          </p>
        </div>
        <p className="text-xs text-muted-foreground">
          {previewMode ? "Free map preview · open a record to unlock deeper intelligence" : <span>Toggle the <strong>Bedrock Geology</strong> layer to see what rock is underground</span>}
        </p>
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
            {!previewMode && (
              <LayersControl.Overlay name="Bedrock geology (USGS)">
                <WMSTileLayer
                  url={USGS_GEOLOGY_WMS}
                  layers="SGMC"
                  format="image/png"
                  transparent
                  opacity={0.65}
                  attribution="USGS State Geologic Map Compilation"
                />
              </LayersControl.Overlay>
            )}
          </LayersControl>

          {mappedSites.map((site) => {
            const geo = geologyMap[site.id] || (site.msha_mine_id ? geologyMap[`msha:${site.msha_mine_id}`] : null);
            const rockName = previewMode ? site.commodity : (geo?.primary_rock || geo?.lithology || site.commodity);
            const color = rockCategoryColor(rockName);
            const category = rockCategoryFor(rockName);
            const isListing = site.is_verified_listing && site.listing_id;
            return (
              <CircleMarker
                key={site.id}
                center={[Number(site.latitude), Number(site.longitude)]}
                radius={isListing ? 8 : 6}
                pathOptions={{
                  color: "#fff",
                  weight: 1.5,
                  fillColor: color,
                  fillOpacity: 0.85,
                }}
              >
                <Popup>
                  <div className="min-w-[220px]">
                    <strong>{site.mine_name || "Mine / Quarry Site"}</strong>
                    <div>{[site.county, site.state].filter(Boolean).join(", ")}</div>
                    {site.mine_status && <div>Status: {site.mine_status}</div>}
                    {site.commodity && <div>Commodity: {site.commodity}</div>}
                    {!previewMode && rockName && (
                      <div className="mt-1 flex items-center gap-1.5">
                        <span className="inline-block h-2.5 w-2.5 rounded-full border border-white/40" style={{ backgroundColor: color }} />
                        <strong>{rockName}</strong>
                      </div>
                    )}
                    {!previewMode && category && (
                      <div className="text-xs text-slate-600">{category}</div>
                    )}
                    {!previewMode && geo?.geologic_age && <div className="text-xs text-slate-600">Age: {geo.geologic_age}</div>}
                    {!previewMode && geo?.formation_name && <div className="text-xs text-slate-600">Formation: {geo.formation_name}</div>}
                    {previewMode && <div className="mt-1 text-xs font-semibold text-slate-600">Geology, owner/operator, permits and production unlock in the full record.</div>}
                    {site.msha_mine_id && <div>MSHA ID: {site.msha_mine_id}</div>}
                    <Link
                      to={isListing ? `/listings/${site.listing_id}` : `/mines/${site.id}`}
                      className="mt-2 inline-block font-semibold text-sky-800 hover:underline"
                    >
                      {isListing ? "View verified listing →" : "View site intelligence →"}
                    </Link>
                  </div>
                </Popup>
              </CircleMarker>
            );
          })}
        </MapContainer>
        <div className="pointer-events-none absolute bottom-7 right-2 z-[500]">
          <GeologyMapLegend compact />
        </div>
      </div>
    </div>
  );
}