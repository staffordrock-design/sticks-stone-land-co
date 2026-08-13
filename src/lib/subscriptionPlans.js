export const SUBSCRIPTION_PRODUCTS = {
  apple: {
    monthly: "com.sticksandstone.pro.monthly",
    annual: "com.sticksandstone.pro.annual",
  },
  google: {
    monthly: "sticks_stone_pro_monthly",
    annual: "sticks_stone_pro_annual",
  },
};

export const ACCESS_TIERS = [
  {
    code: "marketplace",
    name: "Marketplace Access",
    monthly: "$69/mo",
    annual: "$690/yr",
    features: [
      "Access to the S&S quarry marketplace",
      "Basic mine/quarry identity, location and operating status",
      "Map browsing and saved opportunities",
      "Buyer profile and seller listing tools",
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
      "Everything in Marketplace Access",
      "Parcel/tax and mapped ownership intelligence",
      "Mapped geology, rock type and mineral value guide",
      "MSHA, TDEC, environmental and production intelligence",
      "Advanced quarry opportunity screening",
      "Preferred pricing on downloadable intelligence reports",
    ],
  },
  {
    code: "deal_investor",
    name: "Deal / Investor",
    monthly: "$289/mo",
    annual: "$2,890/yr",
    features: [
      "Everything in Professional Intelligence",
      "Confidential data-room and NDA workflows",
      "Advanced deal desk and acquisition tools",
      "Expanded valuation and transaction screening",
      "Priority report handling and preferred report pricing",
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
