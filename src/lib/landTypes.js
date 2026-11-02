// Shared definitions for the land side of the marketplace (farms, ranches,
// timber/hunting and mineral-potential acreage) so the property-type switch,
// the results list, the map card and the detail page all agree.

export const LAND_TYPES = [
  { value: "Farm & Ranch", filter: "farm", label: "Farms & ranches", short: "Farm" },
  { value: "Timber & Hunting", filter: "timber", label: "Timber & hunting", short: "Timber" },
  { value: "Mineral Potential", filter: "mineral", label: "Mineral potential", short: "Minerals" },
];

export const PROPERTY_FILTERS = [
  { id: "all", label: "All land" },
  { id: "quarry", label: "Quarries" },
  { id: "farm", label: "Farms & ranches" },
  { id: "timber", label: "Timber & hunting" },
  { id: "mineral", label: "Mineral potential" },
];

const TYPE_STYLES = {
  "Farm & Ranch": "bg-emerald-100 text-emerald-900",
  "Timber & Hunting": "bg-amber-100 text-amber-900",
  "Mineral Potential": "bg-blue-100 text-blue-900",
};

const STATUS_STYLES = {
  "For Sale": "bg-emerald-600 text-white",
  "Under Contract": "bg-amber-600 text-white",
  "Available for Lease": "bg-blue-700 text-white",
  Sold: "bg-slate-600 text-white",
};

export function landTypeStyle(propertyType) {
  return TYPE_STYLES[propertyType] || "bg-slate-100 text-slate-800";
}

export function landStatusStyle(status) {
  return STATUS_STYLES[status] || "bg-slate-600 text-white";
}

const MARKER_COLORS = {
  "Farm & Ranch": "#15803d",
  "Timber & Hunting": "#b45309",
  "Mineral Potential": "#1d4ed8",
};

export function landMarkerColor(propertyType) {
  return MARKER_COLORS[propertyType] || "#0f766e";
}

export function landFilterFor(propertyType) {
  return LAND_TYPES.find((entry) => entry.value === propertyType)?.filter || null;
}

export function formatPrice(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  return "$" + Math.round(amount).toLocaleString();
}

export function formatAcreage(value) {
  const acres = Number(value);
  if (!Number.isFinite(acres) || acres <= 0) return null;
  return acres.toLocaleString(undefined, { maximumFractionDigits: 1 }) + " ac";
}

export function formatPricePerAcre(property) {
  const explicit = Number(property?.price_per_acre);
  if (Number.isFinite(explicit) && explicit > 0) return "$" + Math.round(explicit).toLocaleString() + "/ac";
  const price = Number(property?.asking_price);
  const acres = Number(property?.acreage);
  if (Number.isFinite(price) && price > 0 && Number.isFinite(acres) && acres > 0) {
    return "$" + Math.round(price / acres).toLocaleString() + "/ac";
  }
  return null;
}

// Land rows share the map's record shape so one map and one results list can
// carry quarries and land together. `_land` keeps the original record for the
// card and detail link.
export function toLandRecord(property) {
  const searchable = [
    property?.title,
    property?.county,
    property?.state,
    property?.city,
    property?.property_type,
    property?.description,
    property?.water_features,
    property?.road_frontage,
    ...(Array.isArray(property?.features) ? property.features : []),
    ...(Array.isArray(property?.use_types) ? property.use_types : []),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return {
    id: property?.id,
    record_kind: "land",
    mine_name: property?.title || "Land for sale",
    mine_status: property?.status || "For Sale",
    commodity: property?.property_type || null,
    state: property?.state || null,
    county: property?.county || null,
    city: property?.city || null,
    latitude: property?.latitude,
    longitude: property?.longitude,
    acreage: property?.acreage,
    source: "S&S Land Listing",
    _search: searchable,
    _land: property,
  };
}