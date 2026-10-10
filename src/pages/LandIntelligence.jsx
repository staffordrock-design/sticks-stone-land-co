import React, { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import L from "leaflet";
import { GeoJSON, MapContainer, ScaleControl, TileLayer, useMap, useMapEvents } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { ArrowLeft, ArrowRight, Database, ExternalLink, FileSearch, Layers, Loader2, MapPinned, Search, ShieldAlert } from "lucide-react";

// Public Tennessee Comptroller GeoViewer parcel service. We request only what the
// visitor is looking at and do not claim the GIS layers establish legal title.
const PARCEL_SERVICE = "https://geoviewer.cot.tn.gov/arcgis/rest/services/GeoViewer/GeoViewer_Parcels_R/MapServer/0";
const PARCEL_FIELDS = "GISLINK,PARID,PARCELID,OWNER,OWNJAN1,OSAP_NAME,CALC_ACRE,CAMADEEDAC,ADDRESS,LANDUSE,ZONING,APPRAISAL,PRICE,SALEDATE,DEEDBKPG,COUNTY,UPDATED";
const COUNTIES = {
  Polk: { center: [35.17, -84.65], zoom: 13 },
  Bradley: { center: [35.16, -84.88], zoom: 13 },
  McMinn: { center: [35.44, -84.59], zoom: 13 },
};

function formatMoney(number) {
  const n = Number(number);
  return number !== "" && number != null && Number.isFinite(n) ? n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }) : null;
}

function pick(properties, ...fields) {
  for (const field of fields) {
    const value = properties?.[field];
    if (value !== "" && value != null) return String(value).trim();
  }
  return null;
}

async function queryParcels(options, signal) {
  const params = new URLSearchParams({ f: "geojson", outFields: PARCEL_FIELDS, outSR: "4326", returnGeometry: "true", ...options });
  const response = await fetch(`${PARCEL_SERVICE}/query?${params.toString()}`, { signal });
  if (!response.ok) throw new Error("Tennessee parcel service is temporarily unavailable.");
  const data = await response.json();
  if (data.error) throw new Error(data.error.message || "The state parcel service rejected this search.");
  if (data.type !== "FeatureCollection") throw new Error("Unexpected response from the state parcel service.");
  return (data.features || []).filter((item) => item?.geometry && item?.properties);
}

function MapClick({ onSelect }) {
  useMapEvents({ click(event) { onSelect(event.latlng); } });
  return null;
}

function MapMove({ county, selected, onViewport }) {
  const map = useMap();
  const lastBounds = useRef("");
  useEffect(() => {
    map.setView(COUNTIES[county].center, COUNTIES[county].zoom);
  }, [county, map]);
  useEffect(() => {
    if (!selected?.geometry) return;
    const bounds = L.geoJSON(selected).getBounds();
    if (bounds.isValid()) map.fitBounds(bounds.pad(0.6), { maxZoom: 17 });
  }, [map, selected]);
  useMapEvents({
    moveend() {
      if (map.getZoom() < 14) { onViewport(null); return; }
      const bounds = map.getBounds();
      const key = [bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth()].map((v) => v.toFixed(4)).join(",");
      if (key !== lastBounds.current) { lastBounds.current = key; onViewport(key); }
    },
    zoomend() {
      if (map.getZoom() < 14) { lastBounds.current = ""; onViewport(null); }
    },
  });
  return null;
}

function Field({ label, value }) {
  if (!value) return null;
  return <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
    <dt className="text-xs font-semibold uppercase tracking-wider text-slate-500">{label}</dt>
    <dd className="mt-1 break-words text-sm font-semibold text-slate-900">{value}</dd>
  </div>;
}

export default function LandIntelligence() {
  const [county, setCounty] = useState("Polk");
  const [mapStyle, setMapStyle] = useState("satellite");
  const [parcelId, setParcelId] = useState("");
  const [selected, setSelected] = useState(null);
  const [nearby, setNearby] = useState([]);
  const [viewport, setViewport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [mapLoading, setMapLoading] = useState(false);
  const [error, setError] = useState("");
  const [searched, setSearched] = useState(false);
  const selectionRequest = useRef(null);
  const nearbyRequest = useRef(null);

  const changeCounty = (name) => {
    selectionRequest.current?.abort();
    nearbyRequest.current?.abort();
    setCounty(name);
    setSelected(null);
    setNearby([]);
    setViewport(null);
    setError("");
    setSearched(false);
  };

  const lookupPoint = useCallback(async ({ lat, lng }) => {
    selectionRequest.current?.abort();
    const controller = new AbortController();
    selectionRequest.current = controller;
    setSelected(null);
    setSearched(true);
    setLoading(true);
    setError("");
    try {
      const matches = await queryParcels({
        geometry: JSON.stringify({ x: lng, y: lat, spatialReference: { wkid: 4326 } }),
        geometryType: "esriGeometryPoint",
        spatialRel: "esriSpatialRelIntersects",
        inSR: "4326",
        resultRecordCount: "3",
      }, controller.signal);
      if (!controller.signal.aborted) {
        setSelected(matches[0] || null);
        if (!matches.length) setError("No parcel record was returned at that exact point. Try clicking inside a nearby lot, rather than the road.");
      }
    } catch (err) {
      if (!controller.signal.aborted) setError(err.message || "Parcel lookup failed.");
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, []);

  const lookupId = async (event) => {
    event.preventDefault();
    const term = parcelId.trim();
    if (term.length < 3) { setError("Enter at least three characters of a parcel number."); return; }
    // Search only parcel identifiers; never interpolate arbitrary SQL syntax.
    if (!/^[a-zA-Z0-9.\- _]+$/.test(term)) { setError("Use only letters, numbers, spaces, periods and hyphens."); return; }
    selectionRequest.current?.abort();
    const controller = new AbortController();
    selectionRequest.current = controller;
    setSearched(true);
    setSelected(null);
    setLoading(true);
    setError("");
    try {
      const clean = term.replace(/'/g, "''");
      const features = await queryParcels({
        where: `(PARID LIKE '%${clean}%' OR GISLINK LIKE '%${clean}%' OR PARCELID LIKE '%${clean}%') AND UPPER(COUNTY) = '${county.toUpperCase()}'`,
        resultRecordCount: "10",
      }, controller.signal);
      if (!controller.signal.aborted) {
        if (features.length > 0) setSelected(features[0]);
        else setError("No matching parcel was returned for this county. Try the map or another parcel number.");
      }
    } catch (err) {
      if (!controller.signal.aborted) setError(err.message || "Parcel search failed.");
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  };

  // Limited viewport queries make the map useful at street-level zoom without
  // downloading countywide parcel data or confusing drawn lines with surveys.
  useEffect(() => {
    nearbyRequest.current?.abort();
    if (!viewport) { setNearby([]); setMapLoading(false); return; }
    const controller = new AbortController();
    nearbyRequest.current = controller;
    const timer = setTimeout(async () => {
      const [west, south, east, north] = viewport.split(",").map(Number);
      setMapLoading(true);
      try {
        const features = await queryParcels({
          outFields: "GISLINK,PARID",
          geometry: JSON.stringify({ xmin: west, ymin: south, xmax: east, ymax: north, spatialReference: { wkid: 4326 } }),
          geometryType: "esriGeometryEnvelope",
          spatialRel: "esriSpatialRelIntersects",
          inSR: "4326",
          resultRecordCount: "150",
        }, controller.signal);
        if (!controller.signal.aborted) setNearby(features);
      } catch {
        if (!controller.signal.aborted) setNearby([]);
      } finally {
        if (!controller.signal.aborted) setMapLoading(false);
      }
    }, 450);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [viewport]);

  const p = selected?.properties || {};
  const owner = pick(p, "OWNER", "OWNJAN1", "OSAP_NAME");
  const parcelNumber = pick(p, "PARID", "PARCELID", "GISLINK");
  const parcelAcres = pick(p, "CALC_ACRE", "CAMADEEDAC");
  const acreage = parcelAcres && Number.isFinite(Number(parcelAcres)) ? `${Number(parcelAcres).toLocaleString(undefined, { maximumFractionDigits: 2 })} acres` : null;
  const address = pick(p, "ADDRESS");
  const lastSale = formatMoney(p.PRICE);
  const value = formatMoney(p.APPRAISAL);

  return <div className="min-h-screen bg-slate-50 pb-28 text-slate-900">
    <div className="border-b border-slate-800 bg-slate-950 px-5 pb-8 pt-6 text-white" style={{ paddingTop: "max(24px, env(safe-area-inset-top))" }}>
      <div className="mx-auto max-w-7xl">
        <Link to="/intelligence" className="inline-flex items-center gap-2 text-sm text-slate-300 hover:text-white"><ArrowLeft className="h-4 w-4" /> Intelligence Center</Link>
        <div className="mt-6 flex flex-wrap items-center gap-2 text-xs font-bold uppercase tracking-widest text-sky-300"><MapPinned className="h-4 w-4" /> S&amp;S Rock Holdings · Tennessee pilot</div>
        <h1 className="mt-2 font-heading text-3xl font-black sm:text-4xl">Land Intelligence</h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-300 sm:text-base">Research parcels beyond quarry listings. Explore public-source boundaries, recorded owner fields, acreage, tax appraisal and deed references—then connect your findings to S&amp;S geology and mineral research.</p>
      </div>
    </div>

    <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.6fr)_minmax(320px,1fr)]">
        <section className="min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="p-4 sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-heading text-lg font-bold">Explore Tennessee parcels</h2>
              <div className="inline-flex rounded-lg border border-slate-200 p-1 text-xs font-semibold">
                <button type="button" onClick={() => setMapStyle("satellite")} aria-pressed={mapStyle === "satellite"} className={`rounded-md px-3 py-2 ${mapStyle === "satellite" ? "bg-slate-900 text-white" : "text-slate-700"}`}>Satellite</button>
                <button type="button" onClick={() => setMapStyle("street")} aria-pressed={mapStyle === "street"} className={`rounded-md px-3 py-2 ${mapStyle === "street" ? "bg-slate-900 text-white" : "text-slate-700"}`}>Streets</button>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {Object.keys(COUNTIES).map((name) => <button key={name} type="button" onClick={() => changeCounty(name)} aria-pressed={county === name} className={`rounded-full border px-4 py-2 text-sm font-semibold ${county === name ? "border-sky-800 bg-sky-800 text-white" : "border-slate-300 bg-white hover:bg-slate-100"}`}>{name} County</button>)}
            </div>
            <p className="mt-3 text-xs leading-5 text-slate-500">Zoom in to see available parcel outlines. Tap inside a parcel to inspect its record. Blue outlines represent GIS screening data, not surveyed boundaries.</p>
          </div>

          <div className="relative isolate z-0 h-[430px] w-full bg-slate-100 sm:h-[560px]">
            <MapContainer center={COUNTIES.Polk.center} zoom={COUNTIES.Polk.zoom} scrollWheelZoom={true} className="h-full w-full" style={{ height: "100%", width: "100%" }}>
              {mapStyle === "satellite" ? <TileLayer attribution="Tiles © Esri" url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}" /> : <TileLayer attribution='&copy; OpenStreetMap contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />}
              <MapClick onSelect={lookupPoint} />
              <MapMove county={county} selected={selected} onViewport={setViewport} />
              <ScaleControl position="bottomleft" imperial metric />
              {nearby.length > 0 && <GeoJSON key={`nearby-${viewport}`} data={{ type: "FeatureCollection", features: nearby }} style={{ color: "#38bdf8", weight: 1.5, fillOpacity: 0.03, opacity: 0.9 }} interactive={false} />}
              {selected && <GeoJSON key={`selected-${parcelNumber || selected.id || Date.now()}`} data={selected} style={{ color: "#f59e0b", weight: 4, fillColor: "#fbbf24", fillOpacity: 0.2 }} interactive={false} />}
            </MapContainer>
            {mapLoading && <div className="pointer-events-none absolute bottom-4 right-3 z-[500] rounded-lg bg-white/95 px-3 py-2 text-xs font-semibold shadow"><Loader2 className="mr-1 inline h-3 w-3 animate-spin" /> Loading nearby parcels</div>}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 px-4 py-3 text-xs text-slate-500">
            <span>Source: Tennessee Comptroller GeoViewer · coverage varies by county</span>
            <a href={PARCEL_SERVICE} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-semibold text-sky-700 hover:underline">View source <ExternalLink className="h-3 w-3" /></a>
          </div>
        </section>

        <div className="space-y-5">
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="flex items-center gap-2 font-heading text-xl font-bold"><FileSearch className="h-5 w-5 text-sky-700" /> Parcel lookup</h2>
            <p className="mt-2 text-sm text-slate-600">Search by parcel number or tap the map. Searching uses your selected county.</p>
            <form onSubmit={lookupId} className="mt-4 flex gap-2">
              <input value={parcelId} onChange={(e) => setParcelId(e.target.value)} placeholder="Parcel number or GIS link" aria-label="Parcel ID" className="min-w-0 flex-1 rounded-xl border border-slate-300 px-3 py-3 text-sm outline-none focus:ring-2 focus:ring-sky-500" />
              <button type="submit" disabled={loading} className="inline-flex min-h-11 items-center gap-1 rounded-xl bg-slate-900 px-4 text-sm font-bold text-white disabled:opacity-50"><Search className="h-4 w-4" /> Search</button>
            </form>
            {loading && <p role="status" className="mt-4 flex items-center gap-2 text-sm text-slate-600"><Loader2 className="h-4 w-4 animate-spin" /> Looking up official parcel data…</p>}
            {error && <p role="status" className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">{error}</p>}
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="flex items-center gap-2 font-heading text-xl font-bold"><Database className="h-5 w-5 text-sky-700" /> Parcel investigation</h2>
            {!selected && <div className="mt-4 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-5 text-sm leading-6 text-slate-600">{searched && !loading ? "No parcel selected. Try another location or parcel number." : "Select a property to see only the information actually returned by Tennessee's public GIS system."}</div>}
            {selected && <>
              <div className="mt-4 rounded-xl border border-sky-200 bg-sky-50 p-4">
                <p className="text-xs font-bold uppercase tracking-wider text-sky-900">Selected parcel</p>
                <p className="mt-1 break-all text-xl font-bold">{parcelNumber || "Identifier unavailable"}</p>
                <p className="mt-1 text-sm text-slate-700">{pick(p, "COUNTY") || county} County, Tennessee</p>
              </div>
              <dl className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
                <Field label="Assessor-listed owner" value={owner} />
                <Field label="GIS acreage (approx.)" value={acreage} />
                <Field label="Property address" value={address} />
                <Field label="Land use" value={pick(p, "LANDUSE")} />
                <Field label="Zoning field (verify locally)" value={pick(p, "ZONING")} />
                <Field label="Tax appraisal — not market value" value={value} />
                <Field label="Recorded sale price field" value={lastSale} />
                <Field label="Sale date field" value={pick(p, "SALEDATE")} />
                <Field label="Deed book/page reference" value={pick(p, "DEEDBKPG")} />
                <Field label="GIS last updated" value={pick(p, "UPDATED")} />
              </dl>
              <p className="mt-4 text-xs leading-5 text-slate-500">Fields may be missing or outdated. Owner of record is not proof of legal title. A deed reference is not a complete chain of title. Confirm land use, zoning, access, minerals and acreage with the appropriate offices and licensed professionals.</p>
            </>}
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="font-heading text-lg font-bold">Explore what's beneath the property</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">Continue to S&amp;S's existing geological and mineral intelligence. Geological layers are regional context; they do not prove minerals or economically recoverable reserves on any parcel.</p>
            <Link to="/mineral-intelligence" className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-xl bg-sky-700 px-4 py-3 text-sm font-bold text-white hover:bg-sky-800"><Layers className="h-4 w-4" /> Open Mineral Intelligence <ArrowRight className="h-4 w-4" /></Link>
          </section>
        </div>
      </div>
      <div className="mt-6 flex items-start gap-3 rounded-2xl border border-slate-200 bg-white p-5 text-sm leading-6 text-slate-600">
        <ShieldAlert className="mt-1 h-5 w-5 shrink-0 text-amber-700" />
        <p><strong className="text-slate-900">Research tool—not a title report, appraisal or survey.</strong> This Tennessee pilot relies on the state's public parcel service and may not cover every county or property equally. Land is not necessarily for sale just because it appears on the map.</p>
      </div>
    </main>
  </div>;
}
