// Reserve life and in-ground mineral value screening.
//
// Computes, from data S&S already holds (acreage, rock class, modeled annual
// production), how many tons of rock a property could plausibly contain, how
// many years that reserve would last at its current production rate, and what
// the in-ground mineral value screens out to.
//
// This is screening intelligence, NOT a reserve estimate or appraisal. Mineable
// depth, recovery and royalty assumptions are regional industry ranges, not
// drill-confirmed quantities. Public data cannot establish a certified reserve.
import { rockCategoryFor } from "./rockTypes.js";

const CUBIC_YARDS_PER_ACRE_FOOT = 43560 / 27; // 1,613.33 yd³ per acre-foot

// Permitted/parcel acreage includes plant site, haul roads, ponds, buffers and
// untouched ground. Only part of it is ever worked for rock.
const WORKED_FOOTPRINT = 0.4;

// Per rock class: mineable depth, in-place density, recovery factor, and the
// royalty value of a ton left in the ground (not a finished-product price).
const ROCK_MODEL = {
  "Crushed Carbonate Stone": { depth: 110, density: 1.55, recovery: 0.85, royalty: 1.6 },
  "Crushed Igneous / Granite Aggregate": { depth: 95, density: 1.65, recovery: 0.8, royalty: 1.85 },
  "Crushed Quartzite / Metamorphic Aggregate": { depth: 90, density: 1.6, recovery: 0.8, royalty: 1.6 },
  "Dimension / Building Stone": { depth: 65, density: 1.6, recovery: 0.3, royalty: 2.5 },
  "Construction Sand & Gravel": { depth: 55, density: 1.4, recovery: 0.9, royalty: 1.05 },
  "Industrial / Specialty Mineral": { depth: 70, density: 1.5, recovery: 0.7, royalty: 3.25 },
  "Shale / Clay (Fill & Brick)": { depth: 60, density: 1.35, recovery: 0.85, royalty: 0.7 },
  default: { depth: 80, density: 1.5, recovery: 0.8, royalty: 1.3 },
};

// Low and high cases widen the two assumptions that move the answer most.
const LOW_CASE = { depth: 0.65, royalty: 0.75 };
const HIGH_CASE = { depth: 1.45, royalty: 1.3 };

function positive(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function round(value) {
  return Number.isFinite(value) ? Math.round(value) : null;
}

export function reserveModelFor(rockName) {
  const category = rockCategoryFor(rockName);
  const model = (category && ROCK_MODEL[category]) || ROCK_MODEL.default;
  return { category: category || null, ...model };
}

function tonsFor(acres, depth, density, recovery) {
  return acres * depth * CUBIC_YARDS_PER_ACRE_FOOT * density * recovery;
}

// Returns null when the record has no usable acreage — never guesses acreage.
export function computeReserveLife({ site, geology, annualTons } = {}) {
  if (!site) return null;

  const permitted = positive(site.permitted_acres);
  const parcel = positive(site.acreage);
  const acres = permitted || parcel;
  if (!acres) return null;
  const basis = permitted ? "Permitted acreage" : "Parcel acreage";

  const rock = geology?.primary_rock || geology?.lithology || site.commodity || "";
  const model = reserveModelFor(rock);

  const midTons = tonsFor(acres, model.depth, model.density, model.recovery);
  const lowTons = tonsFor(acres, model.depth * LOW_CASE.depth, model.density, model.recovery);
  const highTons = tonsFor(acres, model.depth * HIGH_CASE.depth, model.density, model.recovery);

  const valueLow = lowTons * model.royalty * LOW_CASE.royalty;
  const valueMid = midTons * model.royalty;
  const valueHigh = highTons * model.royalty * HIGH_CASE.royalty;

  const rate = positive(annualTons);
  const lifeYears = rate ? midTons / rate : null;

  const signals = [
    Boolean(permitted),
    Boolean(rate),
    Boolean(model.category),
    Boolean(geology?.primary_rock || geology?.lithology),
  ].filter(Boolean).length;
  const confidence = signals >= 4 ? "High" : signals >= 3 ? "Medium" : "Low";

  return {
    reserve_acres: round(acres),
    reserve_acres_basis: basis,
    reserve_rock_class: model.category || "Unclassified rock",
    mineable_depth_ft: model.depth,
    reserve_tons_low: round(lowTons),
    reserve_tons_mid: round(midTons),
    reserve_tons_high: round(highTons),
    annual_production_tons: rate ? round(rate) : null,
    remaining_life_years: lifeYears ? Math.round(lifeYears * 10) / 10 : null,
    reserve_value_low: round(valueLow),
    reserve_value_mid: round(valueMid),
    reserve_value_high: round(valueHigh),
    reserve_value_per_acre: round(valueMid / acres),
    reserve_value_confidence: confidence,
    reserve_computed_at: new Date().toISOString(),
  };
}