import React from "react";
import { MapContainer, TileLayer, Polygon, Marker, Popup, LayersControl } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

export default function ParcelMap({ lat, lng, polygon, ownerName, parcelId, acreage, rockType, boundarySource, height = 380 }) {
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

  return (
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
      </LayersControl>
      {positions.length >= 3 && (
        <Polygon
          positions={positions}
          pathOptions={{
            color: "#b8732e",
            weight: 3,
            fillColor: "#d4923f",
            fillOpacity: 0.2,
          }}
        >
          <Popup>
            <div className="min-w-[220px]">
              <strong>{parcelId ? `Parcel ${parcelId}` : "Mapped parcel"}</strong>
              {ownerName && <div>Owner: {ownerName}</div>}
              {acreage != null && <div>Acreage: {Number(acreage).toLocaleString()}</div>}
              {rockType && <div>Rock: {rockType}</div>}
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
            {rockType && <div>Rock: {rockType}</div>}
            <div className="mt-1 text-xs">{positions.length >= 3 ? "Boundary loaded" : "Boundary geometry not loaded yet"}</div>
          </div>
        </Popup>
      </Marker>
    </MapContainer>
  );
}