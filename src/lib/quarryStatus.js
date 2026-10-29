// Shared quarry operating-status grouping + badge styling so the map, the
// results list and the property card always agree.

export const STATUS_STYLES = {
  Active: "bg-emerald-600 text-white",
  "Inactive / Idled": "bg-amber-500 text-white",
  "Historical / Abandoned": "bg-slate-600 text-white",
  "New / Potential": "bg-blue-700 text-white",
};

export function statusGroup(status = "") {
  const value = String(status).toLowerCase();
  if (["intermittent", "temporarily idled", "nonproducing", "non-producing", "inactive"].some((term) => value.includes(term))) {
    return "Inactive / Idled";
  }
  if (value.includes("historical") || value.includes("abandon")) return "Historical / Abandoned";
  if (value.includes("active")) return "Active";
  return "New / Potential";
}

export function statusStyle(status) {
  return STATUS_STYLES[statusGroup(status)] || STATUS_STYLES["New / Potential"];
}

export function formatAcreage(value) {
  const acres = Number(value);
  if (!Number.isFinite(acres) || acres <= 0) return null;
  return acres.toLocaleString(undefined, { maximumFractionDigits: 1 }) + " ac";
}