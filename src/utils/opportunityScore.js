function statusGroup(status = "") {
  const s = String(status).toLowerCase();
  if (s.includes("new mine") || !s.trim()) return "New / Potential";
  if (s.includes("intermittent") || s.includes("temporarily idled") || s.includes("nonproducing") || s.includes("non-producing") || s.includes("inactive")) return "Inactive / Idled";
  if (s.includes("historical") || s.includes("abandon")) return "Historical / Abandoned";
  if (s.includes("active")) return "Active";
  return "New / Potential";
}

export function calculateOpportunityScore({ site, parcel, geology, permits = [], environmental = [], profile } = {}) {
  if (!site) return null;

  const status = statusGroup(site.mine_status);
  const statusPoints = {
    "New / Potential": 35,
    "Inactive / Idled": 28,
    "Historical / Abandoned": 18,
    Active: 10,
  }[status] ?? 15;

  const rock = geology?.primary_rock || geology?.lithology || site.commodity;
  const geologyPoints = rock ? 15 : 0;

  const owner = parcel?.owner_name || site.parcel_owner;
  const parcelId = parcel?.parcel_id || site.parcel_id;
  const parcelPoints = parcelId ? 8 : 0;
  const ownerPoints = owner && !/pending|unknown|verify/i.test(owner) ? 7 : 0;

  const acreage = Number(parcel?.acreage ?? site.acreage);
  const acreagePoints = Number.isFinite(acreage) && acreage > 0 ? 10 : 0;

  const hasPermit = permits.length > 0 || Boolean(site.tdec_permit_number || site.npdes_permit_number);
  const permitPoints = hasPermit ? 10 : 0;

  const locationPoints = Number.isFinite(Number(site.latitude)) && Number.isFinite(Number(site.longitude)) ? 5 : 0;

  const persisted = Number(profile?.screening_score);
  const profilePoints = Number.isFinite(persisted) && persisted > 0 ? Math.min(10, Math.round(persisted / 10)) : 0;

  const violations = environmental.reduce((sum, row) => sum + Math.max(0, Number(row?.violation_count) || 0), 0);
  const enforcement = environmental.some((row) => row?.enforcement_action || Number(row?.penalty_amount) > 0);
  const riskDeduction = Math.min(15, Math.min(10, violations * 2) + (enforcement ? 5 : 0));

  const score = Math.max(0, Math.min(100,
    statusPoints + geologyPoints + parcelPoints + ownerPoints + acreagePoints + permitPoints + locationPoints + profilePoints - riskDeduction
  ));

  const band = score >= 80 ? "Very High" : score >= 65 ? "High" : score >= 45 ? "Moderate" : "Early";
  const connected = [
    rock ? "geology" : null,
    parcelId ? "parcel" : null,
    owner && !/pending|unknown|verify/i.test(owner) ? "owner" : null,
    Number.isFinite(acreage) && acreage > 0 ? "acreage" : null,
    hasPermit ? "permit" : null,
    environmental.length ? "environmental" : null,
  ].filter(Boolean);

  return {
    score,
    band,
    status,
    rock: rock || null,
    owner: owner || null,
    parcelId: parcelId || null,
    acreage: Number.isFinite(acreage) && acreage > 0 ? acreage : null,
    permitCount: permits.length,
    environmentalCount: environmental.length,
    violations,
    enforcement,
    connected,
    note: "S&S screening score based on operating status and connected public-source intelligence. It is not an appraisal, reserve estimate, title opinion, or sale recommendation.",
  };
}

export function opportunityBandClasses(band) {
  if (band === "Very High") return "border-emerald-300 bg-emerald-50 text-emerald-950";
  if (band === "High") return "border-sky-300 bg-sky-50 text-sky-950";
  if (band === "Moderate") return "border-amber-300 bg-amber-50 text-amber-950";
  return "border-slate-300 bg-slate-50 text-slate-800";
}
