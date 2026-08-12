// Shared rock-type → quarry-commodity classifier.
// Used by the TN geology sync (backend) and the marketplace UI (frontend) so
// both sides derive the same quarry-relevant labels from raw lithology names.
// This is screening intelligence from mapped surface geology, NOT a laboratory
// identification, reserve estimate, or proof of economic recoverability.

const RULES = [
  {
    category: "Crushed Carbonate Stone",
    quality: "High",
    keywords: ["limestone", "dolomite", "dolostone", "marble", "chalk", "coquina", "travertine"],
  },
  {
    category: "Crushed Igneous / Granite Aggregate",
    quality: "High",
    keywords: ["granite", "gabbro", "basalt", "diabase", "diorite", "syenite", "rhyolite", "andesite", "porphyry", "gabbroic"],
  },
  {
    category: "Crushed Quartzite / Metamorphic Aggregate",
    quality: "High",
    keywords: ["quartzite", "gneiss", "granite gneiss", "amphibolite", "hornfels"],
  },
  {
    category: "Dimension / Building Stone",
    quality: "Medium",
    keywords: ["sandstone", "flagstone", "brownstone", "slate", "soapstone", "serpentinite"],
  },
  {
    category: "Construction Sand & Gravel",
    quality: "Medium",
    keywords: ["sand", "gravel", "conglomerate", "alluvium", "terrace", "loess", "silt"],
  },
  {
    category: "Industrial / Specialty Mineral",
    quality: "Medium",
    keywords: ["chert", "flint", "barite", "fluorite", "sphalerite", "galena", "phosphate", "barite", "manganese", "bauxite", "diatomite", "vermiculite", "talc", "asbestos"],
  },
  {
    category: "Coal / Carbonaceous",
    quality: "Low",
    keywords: ["coal", "lignite", "anthracite", "peat", "carbonaceous"],
  },
  {
    category: "Shale / Clay (Fill & Brick)",
    quality: "Low",
    keywords: ["shale", "clay", "mudstone", "siltstone", "argillite", "phyllite", "slate", "till"],
  },
];

function normalize(name) {
  return String(name || "").toLowerCase().trim();
}

function matchRule(name) {
  const s = normalize(name);
  if (!s) return null;
  // Longest keyword match wins so "granite gneiss" beats "granite" where relevant.
  let best = null;
  let bestLen = 0;
  for (const rule of RULES) {
    for (const kw of rule.keywords) {
      if (s.includes(kw) && kw.length > bestLen) {
        best = rule;
        bestLen = kw.length;
      }
    }
  }
  return best;
}

export function classifyRock(rockName) {
  const rule = matchRule(rockName);
  if (!rule) return { category: null, quality: null };
  return { category: rule.category, quality: rule.quality };
}

// Combine primary + secondary rock into a single quarry-relevant interpretation.
// Falls back to the mine's declared commodity when classification is empty.
export function deriveCommodityInterpretation({ primary, secondary, siteCommodity } = {}) {
  const primaryClass = classifyRock(primary);
  const secondaryClass = classifyRock(secondary);

  const category = primaryClass?.category || secondaryClass?.category || null;
  const quality = primaryClass?.quality || secondaryClass?.quality || null;

  if (category && siteCommodity && !String(siteCommodity).toLowerCase().includes(category.toLowerCase().split(" ")[0])) {
    return `${category} · ${siteCommodity}`.trim();
  }
  return category || siteCommodity || null;
}

export function rockQualityTier(primary, secondary) {
  return classifyRock(primary)?.quality || classifyRock(secondary)?.quality || null;
}