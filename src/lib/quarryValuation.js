// Frontend copy of the comparable-sales quarry valuation engine.
// Mirrors base44/shared/quarryValuation.js (backend) so the marketplace UI and
// the weekly build-valuation-estimates function derive the same comp-based range.
// Kept self-contained (no base44/ imports) so it bundles cleanly into the client.
//
// This is marketplace screening intelligence from comparable sales / regional
// market benchmarks — NOT an appraisal, reserve estimate, or guaranteed value.

const ROCK_RULES = [
  { category: "Crushed Carbonate Stone", keywords: ["limestone", "dolomite", "dolostone", "marble", "chalk", "coquina", "travertine"] },
  { category: "Crushed Igneous / Granite Aggregate", keywords: ["granite", "gabbro", "basalt", "diabase", "diorite", "syenite", "rhyolite", "andesite", "porphyry"] },
  { category: "Crushed Quartzite / Metamorphic Aggregate", keywords: ["quartzite", "gneiss", "granite gneiss", "amphibolite", "hornfels"] },
  { category: "Dimension / Building Stone", keywords: ["sandstone", "flagstone", "brownstone", "slate", "soapstone", "serpentinite"] },
  { category: "Construction Sand & Gravel", keywords: ["sand", "gravel", "conglomerate", "alluvium", "terrace", "loess", "silt"] },
  { category: "Industrial / Specialty Mineral", keywords: ["chert", "flint", "barite", "fluorite", "sphalerite", "galena", "phosphate", "manganese", "bauxite", "diatomite", "vermiculite", "talc", "asbestos"] },
  { category: "Shale / Clay (Fill & Brick)", keywords: ["shale", "clay", "mudstone", "siltstone", "argillite", "phyllite", "till"] },
];

function rockCategoryFor(name) {
  const s = String(name || "").toLowerCase().trim();
  if (!s) return null;
  let best = null;
  let bestLen = 0;
  for (const rule of ROCK_RULES) {
    for (const kw of rule.keywords) {
      if (s.includes(kw) && kw.length > bestLen) {
        best = rule.category;
        bestLen = kw.length;
      }
    }
  }
  return best;
}

const STATUS_ADJUSTMENTS = {
  active: 1.08,
  idled: 0.94,
  new: 0.86,
  historical: 0.68,
  unknown: 1.0,
};

const REGIONAL_DEFAULT_PER_ACRE = {
  "Crushed Carbonate Stone": { permitted: 9500, unpermitted: 4200 },
  "Crushed Igneous / Granite Aggregate": { permitted: 11000, unpermitted: 4800 },
  "Crushed Quartzite / Metamorphic Aggregate": { permitted: 9000, unpermitted: 4000 },
  "Dimension / Building Stone": { permitted: 7500, unpermitted: 3500 },
  "Construction Sand & Gravel": { permitted: 5500, unpermitted: 2800 },
  "Industrial / Specialty Mineral": { permitted: 6500, unpermitted: 3000 },
  "Shale / Clay (Fill & Brick)": { permitted: 3500, unpermitted: 2000 },
  default: { permitted: 5000, unpermitted: 2600 },
};

function n(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function statusKey(site) {
  const s = String(site?.mine_status || "").toLowerCase();
  if (s.includes("intermittent") || s.includes("idled") || s.includes("nonproducing") || s.includes("non-producing") || s.includes("inactive")) return "idled";
  if (s.includes("historical") || s.includes("abandon")) return "historical";
  if (s.includes("new mine")) return "new";
  if (s.includes("active")) return "active";
  return "unknown";
}

function compStatusKey(comp) {
  const s = String(comp?.operating_status || "").toLowerCase();
  if (s.includes("active")) return "active";
  if (s.includes("idle") || s.includes("nonproducing") || s.includes("inactive")) return "idled";
  if (s.includes("historical") || s.includes("abandon")) return "historical";
  if (s.includes("new") || s.includes("potential")) return "new";
  return "unknown";
}

export function regionalDefaultPerAcre(site, geology) {
  const category = rockCategoryFor(geology?.primary_rock || geology?.lithology || site?.commodity);
  const tier = REGIONAL_DEFAULT_PER_ACRE[category] || REGIONAL_DEFAULT_PER_ACRE.default;
  const permitted = Boolean(site?.tdec_permit_number || site?.npdes_permit_number);
  return permitted ? tier.permitted : tier.unpermitted;
}

function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export function matchComparableSales(site, comps = [], geology = null) {
  if (!site || !comps.length) return [];
  const siteState = String(site.state || "").toUpperCase();
  const siteCategory = rockCategoryFor(geology?.primary_rock || geology?.lithology || site.commodity);
  const siteStatus = statusKey(site);
  const sitePermitted = Boolean(site.tdec_permit_number || site.npdes_permit_number);
  const siteAcres = n(site.acreage) || 0;

  const scored = comps
    .map((comp) => {
      const compState = String(comp.state || "").toUpperCase();
      if (compState && compState !== siteState) return null;

      let score = compState ? 10 : 0;

      const cCat = rockCategoryFor(comp.rock_type || comp.commodity);
      if (siteCategory && cCat === siteCategory) score += 8;
      else if (siteCategory && cCat) score -= 2;

      const cStatus = compStatusKey(comp);
      if (cStatus === siteStatus) score += 5;
      else if (cStatus && siteStatus !== "unknown") score -= 1;

      const cPermitted = Boolean(comp.permitted);
      if (cPermitted === sitePermitted) score += 4;
      else if (cPermitted && !sitePermitted) score -= 1;

      const cAcres = n(comp.acreage) || 0;
      if (siteAcres > 0 && cAcres > 0) {
        const ratio = Math.max(siteAcres, cAcres) / Math.min(siteAcres, cAcres);
        if (ratio <= 1.5) score += 4;
        else if (ratio <= 3) score += 2;
        else if (ratio > 8) score -= 3;
      }

      const saleDate = comp.sale_date ? new Date(comp.sale_date) : null;
      if (saleDate && !Number.isNaN(saleDate.getTime())) {
        const ageYears = (Date.now() - saleDate.getTime()) / (1000 * 60 * 60 * 24 * 365);
        if (ageYears <= 2) score += 3;
        else if (ageYears <= 5) score += 1;
        else if (ageYears > 10) score -= 2;
      }

      if (comp.verification_status === "Verified") score += 3;
      else if (comp.verification_status === "Public Record") score += 2;
      else if (comp.verification_status === "Broker/Market") score += 1;

      return { comp, score };
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score);

  return scored.slice(0, 6).map((s) => s.comp);
}

export function calculateComparableQuarryValue({ site, parcel, profile, geology, comps = [] } = {}) {
  if (!site) return null;
  const acres = n(site.acreage) ?? n(parcel?.acreage);
  if (!acres || acres <= 0) {
    return {
      available: false,
      acres,
      reason: "A verified parcel acreage is required before a comp-based estimate is shown.",
    };
  }

  const matched = matchComparableSales(site, comps, geology);
  const perAcreValues = matched
    .map((c) => {
      const ppa = n(c.price_per_acre);
      if (ppa && ppa > 0) return ppa;
      const price = n(c.sale_price);
      const cAcres = n(c.acreage);
      if (price > 0 && cAcres > 0) return price / cAcres;
      return null;
    })
    .filter((v) => v && v > 0);

  let basePerAcre;
  let basis;
  let confidence;
  if (perAcreValues.length >= 2) {
    basePerAcre = median(perAcreValues);
    basis = `${perAcreValues.length} comparable sale${perAcreValues.length === 1 ? "" : "s"}`;
    confidence = perAcreValues.length >= 5 ? "High" : "Medium";
  } else {
    basePerAcre = regionalDefaultPerAcre(site, geology);
    basis = "regional market benchmark (no matching comps yet)";
    confidence = "Low";
  }

  const sKey = statusKey(site);
  const statusAdj = STATUS_ADJUSTMENTS[sKey] ?? 1;
  const permitted = Boolean(site.tdec_permit_number || site.npdes_permit_number);
  const permitAdj = permitted ? 1.12 : 0.9;
  let acreageAdj = 1;
  if (acres > 1000) acreageAdj = 0.9;
  else if (acres > 500) acreageAdj = 0.95;
  else if (acres < 50) acreageAdj = 1.05;
  const hasRock = Boolean(geology?.primary_rock || geology?.lithology || site.commodity);
  const geologyAdj = hasRock ? 1.06 : 0.96;
  const photoScore = n(site.photo_condition_score);
  const photoAdj = photoScore != null ? 0.95 + (clamp(photoScore, 0, 100) / 100) * 0.12 : 1;
  const screening = n(profile?.screening_score);
  const screeningAdj = screening != null ? 0.96 + (clamp(screening, 0, 100) / 100) * 0.12 : 1;

  const combined = statusAdj * permitAdj * acreageAdj * geologyAdj * photoAdj * screeningAdj;
  const mid = basePerAcre * acres * combined;
  const spread = confidence === "High" ? 0.15 : confidence === "Medium" ? 0.25 : 0.35;
  const low = Math.round(mid * (1 - spread));
  const high = Math.round(mid * (1 + spread));
  const midR = Math.round((low + high) / 2);

  return {
    available: true,
    acres,
    low,
    mid: midR,
    high,
    perAcreLow: Math.round(low / acres),
    perAcreHigh: Math.round(high / acres),
    confidence,
    method: "comparable_sales",
    basis: [basis, `${Number(acres).toLocaleString()} acres`, permitted ? "permit evidence" : "no permit on file", hasRock ? "mapped geology" : null].filter(Boolean),
    matchedCompCount: perAcreValues.length,
    disclaimer: "Indicative marketplace range from comparable sales / regional benchmarks. Not an appraisal, reserve estimate, or sale recommendation.",
  };
}