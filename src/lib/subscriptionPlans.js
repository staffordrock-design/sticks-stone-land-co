export const SUBSCRIPTION_PRODUCTS = {
  apple: {
    professional: {
      monthly: "com.ssrockholdings.mobile.quarryintelligence.monthly199",
      annual: null,
    },
  },
  google: {
    professional: {
      monthly: "ssrockholdings_professional_monthly",
      annual: null,
    },
  },
};

export const DATA_ROOM_APPLE_PRODUCT_ID = "com.ssrockholdings.dataroom.access";
export const DATA_ROOM_GOOGLE_PRODUCT_ID = "ssrockholdings_dataroom_access";

export const ACCESS_TIERS = [
  {
    code: "professional",
    name: "Full Quarry Intelligence",
    monthly: "$199/mo",
    featured: true,
    features: [
      "Full access to S&S quarry intelligence",
      "Mine/quarry identity, location and operating status",
      "Interactive quarry and mine mapping",
      "Parcel/tax and mapped ownership intelligence",
      "Mapped geology, rock type and mineral value guide",
      "MSHA, TDEC, environmental and production intelligence",
      "Advanced quarry opportunity screening",
      "Professional report request access",
    ],
  },
];


export const PLAN_DISPLAY = {
  monthly: { name: "Full Quarry Intelligence", price: "$199/mo" },
};

export const PROFESSIONAL_FEATURES = ACCESS_TIERS[0].features;