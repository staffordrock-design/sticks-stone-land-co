// Frontend rock-type → quarry-commodity classifier.
// Mirrors base44/shared/rockTypes.js so the map colors and labels match the
// labels the backend sync writes onto records.

const RULES = [
  {
    category: "Crushed Carbonate Stone",
    keywords: ["limestone", "dolomite", "dolostone", "marble", "chalk", "coquina", "travertine"],
  },
  {
    category: "Crushed Igneous / Granite Aggregate",
    keywords: ["granite", "gabbro", "basalt", "diabase", "diorite", "syenite", "rhyolite", "andesite", "porphyry", "gabbroic"],
  },
  {
    category: "Crushed Quartzite / Metamorphic Aggregate",
    keywords: ["quartzite", "gneiss", "granite gneiss", "amphibolite", "hornfels"],
  },
  {
    category: "Dimension / Building Stone",
    keywords: ["sandstone", "flagstone", "brownstone", "slate", "soapstone", "serpentinite"],
  },
  {
    category: "Construction Sand & Gravel",
    keywords: ["sand", "gravel", "conglomerate", "alluvium", "terrace", "loess", "silt"],
  },
  {
    category: "Industrial / Specialty Mineral",
    keywords: ["chert", "flint", "barite", "fluorite", "sphalerite", "galena", "phosphate", "manganese", "bauxite", "diatomite", "vermiculite", "talc", "asbestos"],
  },
  {
    category: "Coal / Carbonaceous",
    keywords: ["coal", "lignite", "anthracite", "peat", "carbonaceous"],
  },
  {
    category: "Shale / Clay (Fill & Brick)",
    keywords: ["shale", "clay", "mudstone", "siltstone", "argillite", "phyllite", "slate", "till"],
  },
];

const ROCK_CATEGORY_COLORS = {
  "Crushed Carbonate Stone": "#2563eb",
  "Crushed Igneous / Granite Aggregate": "#dc2626",
  "Crushed Quartzite / Metamorphic Aggregate": "#9333ea",
  "Dimension / Building Stone": "#d97706",
  "Construction Sand & Gravel": "#0d9488",
  "Industrial / Specialty Mineral": "#db2777",
  "Coal / Carbonaceous": "#475569",
  "Shale / Clay (Fill & Brick)": "#92400e",
};

function matchRule(name) {
  const s = String(name || "").toLowerCase().trim();
  if (!s) return null;
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
  if (!rule) return { category: null };
  return { category: rule.category };
}

export function rockCategoryColor(rockName) {
  const { category } = classifyRock(rockName);
  return category ? ROCK_CATEGORY_COLORS[category] : "#64748b";
}

export function rockCategoryFor(rockName) {
  return classifyRock(rockName)?.category || null;
}