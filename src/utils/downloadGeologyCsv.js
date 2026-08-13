function csvCell(value) {
  const s = value === null || value === undefined ? "" : String(value);
  return `"${s.replace(/"/g, '""')}"`;
}

export function downloadGeologyCsv(records = [], filename = "SS-Geology-Data.csv") {
  const headers = [
    "Mine Name",
    "MSHA ID",
    "County",
    "State",
    "Primary Rock",
    "Secondary Rock",
    "Lithology",
    "Geologic Unit",
    "Geologic Age",
    "Commodity Interpretation",
    "Confidence",
    "Source Agency",
    "Source Map Layer",
    "Source URL",
    "Last Source Update",
    "Mining Site ID",
    "Parcel ID",
    "Notes",
  ];

  const rows = records.map((r) => [
    r.mine_name,
    r.msha_mine_id,
    r.county,
    r.state,
    r.primary_rock,
    r.secondary_rock,
    r.lithology,
    r.geologic_unit,
    r.geologic_age,
    r.commodity_interpretation,
    r.confidence,
    r.source_agency,
    r.source_map_layer,
    r.source_url,
    r.last_source_update,
    r.mining_site_id,
    r.parcel_id,
    r.notes,
  ]);

  const csv = [headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
