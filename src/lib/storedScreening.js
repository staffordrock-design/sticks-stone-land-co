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

function num(value) {
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

  if (low == null || high == null) {
    return {
      available: false,
      acres,
      reason: "The S&S Estimate range is being calculated for this record and will show a stored value once complete.",
    };
  }

  return {
    available: true,
    acres,
    low,
    mid: mid ?? Math.round((low + high) / 2),
    high,
    perAcreLow: num(site.screening_value_per_acre_low),
    perAcreHigh: num(site.screening_value_per_acre_high),
    confidence: site.screening_value_confidence || "Low",
    basis: [
      "comparable sales / regional market benchmark",
      acres ? `${Number(acres).toLocaleString()} acres` : null,
    ].filter(Boolean),
    disclaimer: "Indicative marketplace range from comparable sales / regional benchmarks. Not an appraisal, reserve estimate, or sale recommendation.",
  };
}