function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function n(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function calculateScenarioTonnage({ acres, depthFt = 200, densityLbFt3 = 165, recoveryPct = 75 } = {}) {
  const a = n(acres);
  const d = n(depthFt);
  const density = n(densityLbFt3);
  const recovery = n(recoveryPct);
  if (!a || a <= 0 || !d || d <= 0 || !density || density <= 0 || recovery == null) return null;
  const grossTonsPerAcre = (43560 * d * density) / 2000;
  const saleableTonsPerAcre = grossTonsPerAcre * clamp(recovery, 0, 100) / 100;
  return {
    acres: a,
    depthFt: d,
    densityLbFt3: density,
    recoveryPct: clamp(recovery, 0, 100),
    grossTonsPerAcre: Math.round(grossTonsPerAcre),
    saleableTonsPerAcre: Math.round(saleableTonsPerAcre),
    totalGrossTons: Math.round(grossTonsPerAcre * a),
    totalSaleableTons: Math.round(saleableTonsPerAcre * a),
    basis: "Screening geometry only: surface acres × assumed depth × bulk density × recovery. Not a reserve estimate.",
  };
}

export function calculateIndicativeQuarryValue({ site, parcel, profile, geology } = {}) {
  if (!site) return null;

  const acres = n(site.acreage) ?? n(parcel?.acreage);
  const scenarioDepths = [50, 100, 200, 500, 1000];
  const tonnageScenarios = scenarioDepths
    .map((depthFt) => calculateScenarioTonnage({ acres, depthFt }))
    .filter(Boolean);
  const tonnageScenario = tonnageScenarios.find((scenario) => scenario.depthFt === 200) || tonnageScenarios[0] || null;
  const landValue = n(parcel?.land_value);
  const assessedValue = n(parcel?.assessed_value);
  const anchorValue = landValue && landValue > 0 ? landValue : assessedValue && assessedValue > 0 ? assessedValue : null;

  if (!anchorValue || !acres || acres <= 0) {
    return {
      available: false,
      acres,
      reason: "A verified parcel acreage and tax/GIS land-value anchor are required before a dollar estimate is shown.",
    };
  }

  const screening = clamp(n(profile?.screening_score) ?? 50, 0, 100);
  const geologyScore = clamp(n(profile?.geology_score) ?? (geology ? 60 : 50), 0, 100);
  const marketScore = clamp(n(profile?.market_score) ?? 50, 0, 100);
  const accessScore = clamp(n(profile?.access_score) ?? 50, 0, 100);
  const regulatoryScore = clamp(n(profile?.regulatory_score) ?? 50, 0, 100);
  const photoScore = clamp(n(site.photo_condition_score) ?? 50, 0, 100);

  // Screening multipliers intentionally stay modest. This is marketplace intelligence,
  // not an appraisal, reserve estimate, or value of minerals in place.
  const potentialFactor = 0.82 + (screening / 100) * 0.36;
  const geologyFactor = 0.88 + (geologyScore / 100) * 0.24;
  const marketFactor = 0.9 + (marketScore / 100) * 0.2;
  const accessFactor = 0.94 + (accessScore / 100) * 0.12;
  const regulatoryFactor = 0.92 + (regulatoryScore / 100) * 0.16;
  const photoFactor = site.photo_condition_score == null ? 1 : 0.94 + (photoScore / 100) * 0.12;
  const permitFactor = site.tdec_permit_number || site.npdes_permit_number ? 1.06 : 1;
  const commodityEvidenceFactor = site.commodity || geology?.commodity_interpretation || geology?.primary_rock ? 1.03 : 1;

  const rawMid = anchorValue * potentialFactor * geologyFactor * marketFactor * accessFactor * regulatoryFactor * photoFactor * permitFactor * commodityEvidenceFactor;
  const confidence = profile?.confidence || geology?.confidence || "Low";
  const spread = confidence === "High" ? 0.18 : confidence === "Medium" ? 0.28 : 0.4;

  const low = Math.max(anchorValue * 0.7, rawMid * (1 - spread));
  const high = Math.max(low, rawMid * (1 + spread));
  const mid = (low + high) / 2;

  return {
    available: true,
    acres,
    low: Math.round(low),
    mid: Math.round(mid),
    high: Math.round(high),
    perAcreLow: Math.round(low / acres),
    perAcreHigh: Math.round(high / acres),
    confidence,
    basis: [
      "parcel/tax land value",
      `${Number(acres).toLocaleString()} acres`,
      profile ? "quarry-potential scoring" : null,
      geology ? (geology.commodity_interpretation || geology.primary_rock || "mapped geology") : null,
      site.tdec_permit_number || site.npdes_permit_number ? "permit evidence" : null,
      site.photo_condition_score != null ? "reviewed property photos" : null,
    ].filter(Boolean),
    tonnageScenario,
    tonnageScenarios,
    disclaimer: "Indicative marketplace screening range only. Depth scenarios are geometry models, not reserve estimates, engineering opinions, or guarantees of recoverable minerals.",
  };
}

export function formatCompactMoney(value) {
  if (value == null) return "—";
  return Number(value).toLocaleString(undefined, {
    style: "currency",
    currency: "USD",
    notation: "compact",
    maximumFractionDigits: 1,
  });
}
