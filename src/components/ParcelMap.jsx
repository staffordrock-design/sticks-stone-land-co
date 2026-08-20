import React from "react";
import { MapContainer, TileLayer, Polygon, Marker, Popup, LayersControl, WMSTileLayer } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { rockCategoryColor, rockCategoryFor } from "../../base44/shared/rockTypes";

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

// USGS State Geologic Map Compilation WMS — colored bedrock geology tiles.
const USGS_GEOLOGY_WMS = "https://mrdata.usgs.gov/services/sgmc/wms";

export default function ParcelMap({ lat, lng, polygon, ownerName, parcelId, acreage, rockType, boundarySource, height = 380, previewMode = false }) {
  const numericLat = Number(lat);
  const numericLng = Number(lng);
  const hasValidCenter =
    Number.isFinite(numericLat) &&
    Number.isFinite(numericLng) &&
    numericLat >= -90 &&
    numericLat <= 90 &&
    numericLng >= -180 &&
    numericLng <= 180;

  const positions = (polygon || [])
    .map((p) => [Number(p?.lat), Number(p?.lng)])
    .filter(
      ([pLat, pLng]) =>
        Number.isFinite(pLat) &&
        Number.isFinite(pLng) &&
        pLat >= -90 &&
        pLat <= 90 &&
        pLng >= -180 &&
        pLng <= 180
    );

  if (!hasValidCenter) {
    return (
      <div
        style={{ height }}
        className="flex w-full items-center justify-center rounded-xl border border-border bg-muted/30 px-6 text-center text-sm text-muted-foreground"
      >
        Map location unavailable for this record.
      </div>
    );
  }

  const center = [numericLat, numericLng];
  const effectiveRockType = previewMode ? null : rockType;
  const rockColor = previewMode ? "#334155" : rockCategoryColor(effectiveRockType);
  const rockCategory = previewMode ? null : rockCategoryFor(effectiveRockType);

  return (
    <div className="relative">
      <MapContainer
        center={center}
        zoom={13}
        style={{ height, width: "100%" }}
        scrollWheelZoom={false}
        className="rounded-xl overflow-hidden border border-border"
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
                opacity={0.6}
                attribution="USGS State Geologic Map Compilation"
              />
            </LayersControl.Overlay>
          )}
        </LayersControl>
        {positions.length >= 3 && (
          <Polygon
            positions={positions}
            pathOptions={{
              color: rockColor,
              weight: 3,
              fillColor: rockColor,
              fillOpacity: 0.3,
            }}
          >
            <Popup>
              <div className="min-w-[220px]">
                <strong>{parcelId ? `Parcel ${parcelId}` : "Mapped parcel"}</strong>
                {ownerName && <div>Owner: {ownerName}</div>}
                {acreage != null && <div>Acreage: {Number(acreage).toLocaleString()}</div>}
                {effectiveRockType && (
                  <div className="mt-1 flex items-center gap-1.5">
                    <span className="inline-block h-2.5 w-2.5 rounded-full border border-white/40" style={{ backgroundColor: rockColor }} />
                    <strong>{effectiveRockType}</strong>
                  </div>
                )}
                {rockCategory && <div className="text-xs text-slate-600">{rockCategory}</div>}
                {boundarySource && <div className="mt-1 text-xs">Boundary source: {boundarySource}</div>}
              </div>
            </Popup>
          </Polygon>
        )}
        <Marker position={center}>
          <Popup>
            <div className="min-w-[220px]">
              <strong>{parcelId ? `Parcel ${parcelId}` : "Parcel location"}</strong>
              {ownerName && <div>Owner: {ownerName}</div>}
              {acreage != null && <div>Acreage: {Number(acreage).toLocaleString()}</div>}
              {effectiveRockType && (
                <div className="mt-1 flex items-center gap-1.5">
                  <span className="inline-block h-2.5 w-2.5 rounded-full border border-white/40" style={{ backgroundColor: rockColor }} />
                  <strong>{effectiveRockType}</strong>
                </div>
              )}
              {rockCategory && <div className="text-xs text-slate-600">{rockCategory}</div>}
              <div className="mt-1 text-xs">{positions.length >= 3 ? "Boundary loaded" : "Boundary geometry not loaded yet"}</div>
            </div>
          </Popup>
        </Marker>
      </MapContainer>
      {effectiveRockType && (
        <div className="pointer-events-none absolute bottom-3 left-3 z-[500]">
          <div className="rounded-lg border border-border bg-card/95 px-3 py-2 shadow-sm backdrop-blur">
            <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Underground Rock</div>
            <div className="mt-1 flex items-center gap-1.5">
              <span className="inline-block h-3 w-3 rounded-full border border-white/40" style={{ backgroundColor: rockColor }} />
              <span className="text-sm font-bold text-foreground">{effectiveRockType}</span>
            </div>
            {rockCategory && <div className="text-[11px] text-muted-foreground">{rockCategory}</div>}
          </div>
        </div>
      )}
    </div>
  );
}