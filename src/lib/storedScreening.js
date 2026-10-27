// Reads the stored screening values from a mine record.
//
// The S&S Opportunity Score and the S&S Estimate range are computed once by the
// compute-site-screening function and saved on the MiningSite record. Pages must
// display these stored numbers instead of recalculating them, because a page only
// ever loads part of the supporting data (geology, permits, comparables), so a
// recalculation produced a different number on each load.

function statusGroup(status = "") {
  const s = String(status || "").toLowerCase();
  if (s.includes("new mine") || !s.trim()) return "New / Potential";
  if (s.includes("intermittent") || s.includes("temporarily idled") || s.includes("nonproducing") || s.includes("non-producing") || s.includes("inactive")) return "Inactive / Idled";
  if (s.includes("historical") || s.includes("abandon")) return "Historical / Abandoned";
  if (s.includes("active")) return "Active";
  return "New / Potential";
}

function bandFor(score) {
  if (score >= 80) return "Very High";
  if (score >= 65) return "High";
  if (score >= 45) return "Moderate";
  return "Early";
}

// Missing values must stay missing. Number(null) and Number("") are 0, so a
// plain Number() coercion turned "this record has no stored value" into a real
// 0 and the cards displayed "$0 – $0 · 0 acres · $0–$0/ac" as if it were data.
function num(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function storedOpportunity(site, { parcel, geology } = {}) {
  if (!site) return null;
  const score = num(site.screening_opportunity_score);
  const rock = geology?.primary_rock || geology?.lithology || site.commodity || null;
  const owner = parcel?.owner_name || site.parcel_owner || null;
  const parcelId = parcel?.parcel_id || site.parcel_id || null;
  const acreage = num(parcel?.acreage ?? site.acreage);
  const hasPermit = Boolean(site.tdec_permit_number || site.npdes_permit_number);

  if (score == null) {
    return {
      score: null,
      band: null,
      pending: true,
      status: statusGroup(site.mine_status),
      rock,
      owner,
      parcelId,
      acreage,
      permitCount: 0,
      environmentalCount: 0,
      violations: 0,
      enforcement: false,
      connected: [rock ? "geology" : null, parcelId ? "parcel" : null, hasPermit ? "permit" : null].filter(Boolean),
      note: "S&S screening score is being calculated for this record and will show a stored value once complete.",
    };
  }

  return {
    score,
    band: site.screening_band || bandFor(score),
    pending: false,
    status: statusGroup(site.mine_status),
    rock,
    owner,
    parcelId,
    acreage,
    permitCount: 0,
    environmentalCount: 0,
    violations: 0,
    enforcement: false,
    connected: [
      rock ? "geology" : null,
      parcelId ? "parcel" : null,
      owner && !/pending|unknown|verify/i.test(owner) ? "owner" : null,
      acreage && acreage > 0 ? "acreage" : null,
      hasPermit ? "permit" : null,
    ].filter(Boolean),
    note: "S&S screening score based on operating status and connected public-source intelligence. It is not an appraisal, reserve estimate, title opinion, or sale recommendation.",
  };
}

export function storedValuation(site) {
  if (!site) return null;
  const low = num(site.screening_value_low);
  const high = num(site.screening_value_high);
  const mid = num(site.screening_value_mid);
  const acres = num(site.acreage);
  const perAcreLow = num(site.screening_value_per_acre_low);
  const perAcreHigh = num(site.screening_value_per_acre_high);

  // No stored range (or a non-positive one) means there is no estimate for this
  // record. Withhold it rather than rendering a zero that reads as a valuation.
  if (low == null || high == null || low <= 0 || high <= 0) {
    return {
      available: false,
      acres,
      reason: "No stored S&S Estimate range exists for this record yet.",
    };
  }

  const detail = [
    acres && acres > 0 ? `${Math.round(Number(acres)).toLocaleString()} acres` : null,
    perAcreLow && perAcreHigh && perAcreLow > 0 && perAcreHigh > 0
      ? `${Number(perAcreLow).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 })}–${Number(perAcreHigh).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 })}/ac`
      : null,
  ].filter(Boolean);

  return {
    available: true,
    acres,
    low,
    mid: mid ?? Math.round((low + high) / 2),
    high,
    perAcreLow,
    perAcreHigh,
    confidence: site.screening_value_confidence || "Low",
    detail,
    basis: [
      "comparable sales / regional market benchmark",
      acres ? `${Number(acres).toLocaleString()} acres` : null,
    ].filter(Boolean),
    disclaimer: "Indicative marketplace range from comparable sales / regional benchmarks. Not an appraisal, reserve estimate, or sale recommendation.",
  };
}