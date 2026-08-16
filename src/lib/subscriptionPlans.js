export const SUBSCRIPTION_PRODUCTS = {
  apple: {
    marketplace: {
      monthly: "com.ssrockholdings.marketplace.monthly",
      annual: "com.ssrockholdings.marketplace.annual",
    },
    professional: {
      monthly: "com.ssrockholdings.professional.monthly",
      annual: "com.ssrockholdings.professional.annual",
    },
    deal_investor: {
      monthly: "com.ssrockholdings.deal.monthly",
      annual: "com.ssrockholdings.deal.annual",
    },
  },
  google: {
    marketplace: {
      monthly: "ssrockholdings_marketplace_monthly",
      annual: "ssrockholdings_marketplace_annual",
    },
    professional: {
      monthly: "ssrockholdings_professional_monthly",
      annual: "ssrockholdings_professional_annual",
    },
    deal_investor: {
      monthly: "ssrockholdings_deal_monthly",
      annual: "ssrockholdings_deal_annual",
    },
  },
};

export const DATA_ROOM_APPLE_PRODUCT_ID = "com.ssrockholdings.dataroom.access";

export const ACCESS_TIERS = [
  {
    code: "marketplace",
    name: "Quarry Access",
    monthly: "$69/mo",
    annual: "$690/yr",
    features: [
      "Access to S&S quarry intelligence",
      "Mine/quarry identity, location and operating status",
      "Interactive quarry and mine mapping",
      "Basic site and commodity intelligence",
      "Report purchasing access",
    ],
  },
  {
    code: "professional",
    name: "Professional Intelligence",
    monthly: "$139/mo",
    annual: "$1,390/yr",
    featured: true,
    features: [
      "Everything in Quarry Access",
      "Parcel/tax and mapped ownership intelligence",
      "Mapped geology, rock type and mineral value guide",
      "MSHA, TDEC, environmental and production intelligence",
      "Advanced quarry opportunity screening",
      "Preferred pricing on downloadable intelligence reports",
    ],
  },
];

export const REPORT_PRODUCTS = [
  { code: "snapshot", name: "Site Snapshot", price: "$89", description: "Basic site identity, map, commodity, operating status and screening summary." },
  { code: "standard", name: "Standard S&S Quarry Intelligence Report", price: "$189", description: "Parcel/owner, geology, rock type, MSHA, permits, environmental and production/activity intelligence." },
  { code: "enhanced", name: "Enhanced Intelligence Report", price: "$389", description: "Standard report plus property context, nearby market context, valuation screening, mineral-value analysis and logistics screening." },
  { code: "due_diligence", name: "Deal Due-Diligence Report", price: "$1,500", description: "Transaction-focused acquisition intelligence with deeper ownership/deed review where available, regulatory and environmental risk flags, valuation context and executive deal summary." },
  { code: "custom", name: "Custom Intelligence", price: "Starting at $2,500", description: "Custom research scope for complex properties, portfolios, special data requests or buyer-specific diligence." },
];

export const PLAN_DISPLAY = {
  monthly: { name: "Professional Intelligence", price: "$139/mo" },
  annual: { name: "Professional Intelligence Annual", price: "$1,390/yr", note: "Annual access priced at approximately two months free" },
};

export const PROFESSIONAL_FEATURES = ACCESS_TIERS[1].features;