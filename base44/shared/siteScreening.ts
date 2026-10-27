// Deterministic screening for a single mine site.
//
// The S&S Opportunity Score and the S&S Estimate range are computed ONCE with the
// complete source data and stored on the MiningSite record, so every page shows
// the same number on every load. The display layer must read the stored values and
// never recompute them from whatever records a page happened to load.
import { calculateComparableQuarryValue } from "./quarryValuation.js";

function statusGroup(status: any = "") {
  const s = String(status || "").toLowerCase();
  if (s.includes("new mine") || !s.trim()) return "New / Potential";
  if (s.includes("intermittent") || s.includes("temporarily idled") || s.includes("nonproducing") || s.includes("non-producing") || s.includes("inactive")) return "Inactive / Idled";
  if (s.includes("historical") || s.includes("abandon")) return "Historical / Abandoned";
  if (s.includes("active")) return "Active";
  return "New / Potential";
}

export function computeOpportunityScore({ site, parcel, geology, permits = [], environmental = [], profile }: any = {}) {
  if (!site) return null;

  const status = statusGroup(site.mine_status);
  const statusPoints: Record<string, number> = {
    "New / Potential": 35,
    "Inactive / Idled": 28,
    "Historical / Abandoned": 18,
    Active: 10,
  };
  const statusScore = statusPoints[status] ?? 15;

  const rock = geology?.primary_rock || geology?.lithology || site.commodity;
  const geologyPoints = rock ? 15 : 0;

  const owner = parcel?.owner_name || site.parcel_owner;
  const parcelId = parcel?.parcel_id || site.parcel_id;
  const parcelPoints = parcelId ? 8 : 0;
  const ownerPoints = owner && !/pending|unknown|verify/i.test(owner) ? 7 : 0;

  const acreage = Number(parcel?.acreage ?? site.acreage);
  const acreagePoints = Number.isFinite(acreage) && acreage > 0 ? 10 : 0;

  const hasPermit = (permits || []).length > 0 || Boolean(site.tdec_permit_number || site.npdes_permit_number);
  const permitPoints = hasPermit ? 10 : 0;

  const locationPoints = Number.isFinite(Number(site.latitude)) && Number.isFinite(Number(site.longitude)) ? 5 : 0;

  const persisted = Number(profile?.screening_score);
  const profilePoints = Number.isFinite(persisted) && persisted > 0 ? Math.min(10, Math.round(persisted / 10)) : 0;

  const violations = (environmental || []).reduce((sum: number, row: any) => sum + Math.max(0, Number(row?.violation_count) || 0), 0);
  const enforcement = (environmental || []).some((row: any) => row?.enforcement_action || Number(row?.penalty_amount) > 0);
  const riskDeduction = Math.min(15, Math.min(10, violations * 2) + (enforcement ? 5 : 0));

  const score = Math.max(0, Math.min(100,
    statusScore + geologyPoints + parcelPoints + ownerPoints + acreagePoints + permitPoints + locationPoints + profilePoints - riskDeduction
  ));

  const band = score >= 80 ? "Very High" : score >= 65 ? "High" : score >= 45 ? "Moderate" : "Early";

  return { score, band, status, violations, enforcement };
}

// Writes the stored screening fields for one site. Values that cannot be computed
// stay null rather than being guessed.
export function buildSiteScreening({ site, parcel, geology, permits, environmental, profile, comps }: any = {}) {
  const opportunity = computeOpportunityScore({ site, parcel, geology, permits, environmental, profile });
  const valuation = calculateComparableQuarryValue({ site, parcel, profile, geology, comps: comps || [] });
  const computedAt = new Date().toISOString();

  return {
    screening_opportunity_score: opportunity ? opportunity.score : null,
    screening_band: opportunity ? opportunity.band : null,
    screening_value_low: valuation?.available ? valuation.low : null,
    screening_value_mid: valuation?.available ? valuation.mid : null,
    screening_value_high: valuation?.available ? valuation.high : null,
    screening_value_per_acre_low: valuation?.available ? valuation.perAcreLow : null,
    screening_value_per_acre_high: valuation?.available ? valuation.perAcreHigh : null,
    screening_value_confidence: valuation?.available ? valuation.confidence : null,
    screening_computed_at: computedAt,
  };
}