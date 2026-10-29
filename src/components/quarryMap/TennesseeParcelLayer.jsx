import React, { useEffect, useState } from "react";
import { GeoJSON, Popup, useMap } from "react-leaflet";

// Public Tennessee Comptroller parcel geometry, loaded only for the visible
// viewport at neighborhood zoom. It is GIS screening data, NOT a legal survey.
const PARCEL_QUERY = "https://maps.cot.tn.gov/server3/rest/services/IMPACT/Parcels/FeatureServer/0/query";
const PARCEL_SOURCE = "https://maps.cot.tn.gov/server3/rest/services/IMPACT/Parcels/FeatureServer/0";

function intersectsTennessee(bounds) {
  return bounds.getNorth() >= 34.85 && bounds.getSouth() <= 36.75
    && bounds.getEast() >= -90.45 && bounds.getWest() <= -81.6;
}

function validGeometry(feature) {
  return feature?.geometry && ["Polygon", "MultiPolygon"].includes(feature.geometry.type)
    && feature?.properties;
}

function parcelLabel(properties) {
  return String(properties?.GISLINK || properties?.GISLINK2 || "Unidentified parcel").trim();
}

export default function TennesseeParcelLayer({ onStatus }) {
  const map = useMap();
  const [viewport, setViewport] = useState(null);
  const [features, setFeatures] = useState([]);
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    const refreshViewport = () => {
      const bounds = map.getBounds();
      if (map.getZoom() < 14 || !intersectsTennessee(bounds)) {
        setViewport(null);
        return;
      }
      const bbox = [bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth()]
        .map((n) => n.toFixed(5)).join(",");
      setViewport((previous) => previous === bbox ? previous : bbox);
    };
    refreshViewport();
    map.on("moveend", refreshViewport);
    map.on("zoomend", refreshViewport);
    return () => {
      map.off("moveend", refreshViewport);
      map.off("zoomend", refreshViewport);
    };
  }, [map]);

  useEffect(() => {
    if (!viewport) {
      setFeatures([]);
      setSelected(null);
      onStatus?.("Zoom to level 14 or closer over Tennessee to see parcel outlines.");
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      onStatus?.("Loading Tennessee parcel outlines…");
      const [west, south, east, north] = viewport.split(",").map(Number);
      const params = new URLSearchParams({
        f: "geojson",
        where: "1=1",
        geometry: JSON.stringify({ xmin: west, ymin: south, xmax: east, ymax: north, spatialReference: { wkid: 4326 } }),
        geometryType: "esriGeometryEnvelope",
        spatialRel: "esriSpatialRelIntersects",
        inSR: "4326",
        outSR: "4326",
        outFields: "GISLINK,GISLINK2,CALC_ACRE,COUNTY_ID",
        returnGeometry: "true",
        resultRecordCount: "150",
      });
      try {
        const response = await fetch(`${PARCEL_QUERY}?${params.toString()}`, { signal: controller.signal });
        if (!response.ok) throw new Error("The Tennessee parcel service is unavailable.");
        const json = await response.json();
        if (json.error || json.type !== "FeatureCollection") throw new Error("The parcel service did not return GIS boundaries.");
        if (controller.signal.aborted) return;
        const rows = (json.features || []).filter(validGeometry);
        setFeatures(rows);
        setSelected(null);
        onStatus?.(rows.length >= 150
          ? "Showing the first 150 parcel outlines. Zoom closer for more detail."
          : `${rows.length} Tennessee parcel outlines in view. Tap one for its parcel ID.`);
      } catch (error) {
        if (controller.signal.aborted) return;
        setFeatures([]);
        setSelected(null);
        onStatus?.("Parcel outlines could not load. Try again after moving the map.");
      }
    }, 400);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [viewport, onStatus]);

  return (
    <>
      {features.length > 0 && (
        <GeoJSON
          key={viewport}
          data={{ type: "FeatureCollection", features }}
          style={{ color: "#0284c7", weight: 2, fillColor: "#38bdf8", fillOpacity: 0.045, opacity: 0.95 }}
          onEachFeature={(feature, layer) => {
            layer.on("click", (event) => {
              setSelected({ feature, position: [event.latlng.lat, event.latlng.lng] });
            });
          }}
        />
      )}
      {selected && (
        <Popup position={selected.position} key={`${viewport}-${parcelLabel(selected.feature.properties)}`}>
          <div className="min-w-[220px] space-y-1 text-xs">
            <strong className="block text-sm">Tennessee GIS parcel</strong>
            <div><b>Parcel ID:</b> {parcelLabel(selected.feature.properties)}</div>
            {Number(selected.feature.properties?.CALC_ACRE) > 0 && (
              <div><b>GIS acreage:</b> {Number(selected.feature.properties.CALC_ACRE).toLocaleString(undefined, { maximumFractionDigits: 2 })}</div>
            )}
            <a href={PARCEL_SOURCE} target="_blank" rel="noopener noreferrer" className="block font-semibold text-sky-700 underline">
              Tennessee Comptroller GIS source
            </a>
            <p className="text-[11px] leading-4 text-slate-500">Approximate tax-map outline, not a surveyed boundary or title verification.</p>
          </div>
        </Popup>
      )}
    </>
  );
}
