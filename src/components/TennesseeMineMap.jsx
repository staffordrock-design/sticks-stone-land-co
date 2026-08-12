import React from "react";
import { Link } from "react-router-dom";
import { MapContainer, TileLayer, Marker, Popup, LayersControl } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

const TN_CENTER = [35.85, -86.35];

function isValidCoordinate(lat, lng) {
  const nLat = Number(lat);
  const nLng = Number(lng);
  return (
    Number.isFinite(nLat) &&
    Number.isFinite(nLng) &&
    nLat >= -90 &&
    nLat <= 90 &&
    nLng >= -180 &&
    nLng <= 180
  );
}

export default function TennesseeMineMap({ sites = [], height = 520 }) {
  const mappedSites = sites.filter((site) =>
    isValidCoordinate(site.latitude, site.longitude)
  );

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border px-5 py-4">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
            Tennessee Quarry Intelligence Map
          </p>
          <p className="mt-1 text-sm text-foreground">
            {mappedSites.length.toLocaleString()} mapped mine and quarry records
          </p>
        </div>
      </div>
      <MapContainer
        center={TN_CENTER}
        zoom={7}
        minZoom={6}
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
        </LayersControl>
        {mappedSites.map((site) => (
          <Marker
            key={site.id}
            position={[Number(site.latitude), Number(site.longitude)]}
          >
            <Popup>
              <div className="min-w-[210px]">
                <strong>{site.mine_name || "Mine / Quarry Site"}</strong>
                <div>{[site.county, site.state].filter(Boolean).join(", ")}</div>
                {site.mine_status && <div>Status: {site.mine_status}</div>}
                {site.commodity && <div>Commodity: {site.commodity}</div>}
                {site.msha_mine_id && <div>MSHA ID: {site.msha_mine_id}</div>}
                <Link
                  to={`/mines/${site.id}`}
                  className="mt-2 inline-block font-semibold text-amber-800 hover:underline"
                >
                  View site intelligence →
                </Link>
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}
