import React from "react";
import { Link } from "react-router-dom";
import { X } from "lucide-react";
import { rockCategoryColor } from "@/lib/rockTypes";

// Representative material per category, so the swatch uses the same
// classifier the markers do.
const ROCK_LEGEND = [
  { label: "Limestone / carbonate", sample: "Limestone" },
  { label: "Granite / igneous", sample: "Granite" },
  { label: "Sand & gravel", sample: "Sand & gravel" },
  { label: "Quartzite / metamorphic", sample: "Quartzite" },
  { label: "Sandstone / building stone", sample: "Sandstone" },
  { label: "Industrial mineral", sample: "Barite" },
  { label: "Shale / clay", sample: "Shale" },
];

export default function MapLayersPanel({
  values,
  onToggle,
  parcelsEnabled,
  countyPickMode,
  onToggleCountyPick,
  mineralNote,
  parcelNote,
  onClose,
}) {
  const layers = [
    { key: "geology", label: "Bedrock geology", hint: "USGS state geologic map" },
    { key: "counties", label: "County boundaries", hint: "Census TIGERweb" },
    { key: "minerals", label: "Mineral deposits", hint: "USGS MRDS occurrences" },
    { key: "parcels", label: "Parcel outlines", hint: "TN only · zoom level 14+", disabled: !parcelsEnabled },
  ];

  return (
    <div className="w-[248px] max-w-[70vw] rounded-2xl border border-slate-200 bg-white p-3 shadow-2xl">
      <div className="mb-2 flex items-center justify-between">
        <strong className="text-sm font-extrabold text-slate-900">Map layers</strong>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close layers"
          className="flex h-8 w-8 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {layers.map((layer) => (
        <label
          key={layer.key}
          className={
            "flex min-h-11 cursor-pointer items-center justify-between gap-2 border-t border-slate-100 py-1 " +
            (layer.disabled ? "opacity-50" : "")
          }
        >
          <span className="min-w-0">
            <span className="block text-xs font-bold text-slate-800">{layer.label}</span>
            <span className="block text-[10px] text-slate-500">{layer.hint}</span>
          </span>
          <input
            type="checkbox"
            checked={Boolean(values[layer.key])}
            onChange={(event) => onToggle(layer.key, event.target.checked)}
            disabled={layer.disabled}
            className="h-4 w-4 shrink-0 accent-blue-700"
          />
        </label>
      ))}

      <div className="mt-3 border-t border-slate-200 pt-3">
        <p className="text-[11px] font-bold text-slate-900">Marker color · rock type</p>
        <div className="mt-2 space-y-1.5">
          {ROCK_LEGEND.map((rock) => (
            <div key={rock.label} className="flex items-center gap-2 text-[10px] leading-3 text-slate-700">
              <span className="h-3 w-3 shrink-0 rounded-full border border-white shadow" style={{ backgroundColor: rockCategoryColor(rock.sample) }} />
              <span>{rock.label}</span>
            </div>
          ))}
        </div>
        <p className="mt-2 text-[10px] leading-4 text-slate-500">Outer ring shows operating status: green active, amber idled, gray historical, blue potential.</p>
      </div>

      <button
        type="button"
        onClick={onToggleCountyPick}
        className={
          "mt-3 w-full rounded-lg px-2 py-2.5 text-xs font-bold " +
          (countyPickMode ? "bg-blue-700 text-white" : "bg-slate-100 text-slate-800 hover:bg-slate-200")
        }
      >
        {countyPickMode ? "Cancel county picker" : "Pick county on map"}
      </button>

      {values.minerals && mineralNote && <p className="mt-2 text-[11px] text-slate-500">{mineralNote}</p>}
      {values.parcels && parcelNote && <p className="mt-1 text-[11px] text-slate-500">{parcelNote}</p>}
      <Link to="/data-sources" className="mt-3 block border-t border-slate-100 pt-2 text-[11px] font-bold text-blue-700">
        Data sources and limitations
      </Link>
    </div>
  );
}