import React, { useEffect, useMemo } from "react";
import { MapContainer, TileLayer, CircleMarker, Popup, useMapEvents } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

function ClickHandler({ onLocationSelect }) {
  useMapEvents({
    click(e) {
      onLocationSelect?.(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

export default function IntelligenceMap({
  sites = [],
  selectedSite,
  onLocationSelect,
  height = 420,
}) {
  const validSites = useMemo(
    () =>
      (sites || []).filter(
        (s) =>
          Number.isFinite(Number(s.latitude)) && Number.isFinite(Number(s.longitude))
      ),
    [sites]
  );

  const center = selectedSite
    ? [Number(selectedSite.latitude), Number(selectedSite.longitude)]
    : [35.8, -85.9];

  return (
    <div className="relative overflow-hidden rounded-2xl border border-border">
      <MapContainer
        center={center}
        zoom={selectedSite ? 14 : 7}
        style={{ height }}
        className="z-0"
      >
        <TileLayer
          url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
          attribution="Esri World Imagery"
        />
        <ClickHandler onLocationSelect={onLocationSelect} />
        {validSites.map((s) => {
          const isSelected = selectedSite?.id === s.id;
          return (
            <CircleMarker
              key={s.id}
              center={[Number(s.latitude), Number(s.longitude)]}
              radius={isSelected ? 10 : 6}
              pathOptions={{
                color: isSelected ? "#0369a1" : "#475569",
                fillColor: isSelected ? "#0369a1" : "#1e293b",
                fillOpacity: 0.7,
                weight: 2,
              }}
            >
              <Popup>
                <div className="text-xs">
                  <div className="font-bold">{s.mine_name}</div>
                  <div>{s.county ? `${s.county}, ` : ""}{s.state}</div>
                  <div>{s.commodity || "Commodity not recorded"}</div>
                  <div className="mt-1 text-muted-foreground">{s.mine_status || "Status not recorded"}</div>
                </div>
              </Popup>
            </CircleMarker>
          );
        })}
        {selectedSite && Number.isFinite(Number(selectedSite.latitude)) && (
          <CircleMarker
            center={[Number(selectedSite.latitude), Number(selectedSite.longitude)]}
            radius={14}
            pathOptions={{ color: "#0369a1", fillColor: "#0369a1", fillOpacity: 0.15, weight: 3 }}
          />
        )}
      </MapContainer>
      <div className="pointer-events-none absolute bottom-2 left-2 rounded-lg bg-white/90 px-3 py-1.5 text-[11px] font-medium text-slate-700 shadow-sm">
        Tap the map to analyze any location
      </div>
    </div>
  );
}