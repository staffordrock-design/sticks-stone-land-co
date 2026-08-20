# App Store Review Notes — S&S Rock Holdings

> Copy this entire document into the **Notes** field of the **App Review Information** section in App Store Connect for every submission.

---

## 1. Screen Recording

A screen recording captured on a physical device (latest iOS) is included with this submission. The recording demonstrates:

- **App launch** → Home dashboard with interactive quarry/mine map
- **Account registration** → Email + password sign-up → OTP verification flow
- **Login** → Email + password sign-in (also shows "Sign in with Apple" and Google options)
- **Account deletion** → Settings → Delete Account flow at `/account/delete`
- **Browsing mine sites** → Tapping a map marker → Mine Site Detail page with geology, parcel, permit, production, and USGS mineral intelligence
- **Subscription flow** → Subscribe page (`/subscribe`) showing Quarry Access ($69/mo) and Professional Intelligence ($139/mo) tiers → Apple in-app purchase sheet with subscription disclosure
- **Data Room access** → Listing detail page → NDA gate → Data Room access purchase ($250 one-time)
- **Intelligence report purchase** → Mine detail page → Standard ($189) / Enhanced ($389) report request
- **Seller property submission** → Sell Property form → Admin-reviewed before publishing
- **Support / content reporting** → Support page (`/support`) for reporting issues, content concerns, or data accuracy requests

**Note:** The app does not request location, camera, contacts, or App Tracking Transparency permissions. Maps use embedded tile services (OpenStreetMap, Esri World Imagery, USGS WMS) and do not access device GPS.

---

## 2. Devices Tested

| Device Model | OS Version |
|---|---|
| iPhone 15 Pro | iOS 17.x (latest) |
| iPhone 14 | iOS 17.x |
| iPhone SE (3rd gen) | iOS 17.x |
| iPad (10th gen) | iPadOS 17.x |

---

## 3. App Description & Target Audience

**S&S Rock Holdings** is a digital marketplace and business-intelligence platform for the quarry, aggregate, and mineral extraction industries. It provides GIS-mapped parcel listings, NDA-gated data rooms, and source-labeled intelligence reports on active and historical mine sites.

**Problem solved:** Buyers, operators, investors, and advisers in the quarry/aggregate industry lack a centralized, source-backed research tool for evaluating quarry and mineral-bearing properties. Public records (MSHA, TDEC, county parcel/GIS, USGS geology) are fragmented across dozens of government systems.

**Value provided:**
- Interactive map of 500+ mine/quarry sites across the Southeastern US with bedrock geology overlay
- Per-site intelligence: parcel/ownership, permitted acreage, geology/rock type, MSHA compliance, environmental records, production estimates, USGS MRDS mineral occurrences, and contract/royalty intelligence
- NDA-gated data rooms for confidential core drilling and environmental reports
- Downloadable PDF intelligence reports (Standard $189, Enhanced $389, Due-Diligence $1,500)
- Seller property submission pipeline with admin review before publishing

**Target audience:** Quarry operators, aggregate producers, mineral rights investors, acquisition professionals, land brokers, and industry advisers in the United States.

---

## 4. Setup & Login Instructions

### Review Account (pre-configured with full Professional access)

```
Email:    contact+appreview@ssrockholdings.com
Password: SSRockReview2026!
```

This account has a permanent Professional Intelligence entitlement (10-year) granted automatically on login via the `ensure-review-demo-entitlement` backend function. No in-app purchase is required to access paid features during review.

### Steps to access main features

1. **Launch the app** → Home dashboard loads automatically with the quarry map
2. **Sign in** using the review account above (or tap "Sign in with Apple")
3. **Browse the map** → Tap any mine marker to open the Mine Site Detail page
4. **View intelligence** → Scroll the detail page to see parcel, geology, production, USGS mineral, permit, and compliance cards
5. **Subscribe** → Tap the Subscription tab → Review available plans (review account already has full access)
6. **Data Room** → Open any listing detail (`/listings/:id`) → Complete NDA → Access data room documents
7. **Reports** → On any mine detail page, tap "Standard report" or "Enhanced report" to initiate a report request
8. **Sell property** → Tap "Sell" in the bottom nav → Fill out the property submission form
9. **Delete account** → Go to `/account/delete` → Confirm deletion

---

## 5. External Services & Third-Party Platforms

| Service | Purpose |
|---|---|
| **Apple In-App Purchases** (StoreKit) | Subscription payments and data room access purchases on iOS |
| **Google Play Billing** | Subscription payments on Android |
| **Stripe** | Web-based checkout for reports, data room access, and subscriptions |
| **USGS MRDS** (mrdata.usgs.gov) | Mineral Resources Data System — mineral occurrence data via WFS |
| **USGS State Geologic Map Compilation** | Bedrock geology WMS tile layer |
| **USGS Mineral Commodity Summaries** | Statewide aggregate production data |
| **MSHA** (Mine Safety & Health Administration) | Mine identity, operator, inspection, and violation records |
| **TDEC** (Tennessee Dept. of Environment & Conservation) | Surface mining permits and environmental records |
| **TN Comptroller IMPACT** | Parcel boundaries, ownership, and tax assessment data (GIS) |
| **Esri World Imagery** | Aerial/satellite map tiles |
| **OpenStreetMap** | Street map base layer |
| **Google OAuth** | "Sign in with Google" authentication |
| **Base44** | Backend-as-a-service: authentication, database, serverless functions, hosting |

---

## 6. Regional Differences

The app functions consistently across all US regions. However, data coverage varies by state:

- **Tennessee (primary coverage):** Full parcel/ownership, TDEC permit, MSHA, environmental, geology, and USGS MRDS intelligence. TN Comptroller IMPACT GIS is the parcel data source.
- **Other Southeastern states (AL, AR, FL, GA, KY, LA, MS, NC, SC, VA, WV):** MSHA mine records and USGS geology/MRDS data are available. County-level parcel data is enriched on a rolling basis via the Priority Parcel Enrichment workflow.
- **All other states:** MSHA mine records and USGS MRDS/geology data are available where USGS has coverage.

No features are region-locked. Subscription and purchase flows work identically across all regions.

---

## 7. Regulated Industry & Third-Party Material

**Regulated industry:** The app compiles publicly available government data (MSHA, TDEC, USGS, county assessor/GIS) and presents it with source attribution. S&S Rock Holdings LLC is not a licensed real estate broker, appraiser, geologist, or environmental consultant. All intelligence is labeled as a screening and business-intelligence product — not a certified reserve estimate, engineering opinion, title opinion, appraisal, or environmental assessment.

**Third-party material:** All government data is sourced from public records and attributed with source URLs on each record. USGS, MSHA, TDEC, and TN Comptroller data are public-domain or public-record sources. Esri World Imagery and OpenStreetMap are used under their respective attribution licenses (displayed on the map).

**NDA-gated content:** Data room documents (core drilling, environmental reports) are seller-supplied confidential materials. Access requires NDA acceptance and payment. S&S verifies seller authorization before publishing listings.

**Authorization:** S&S Rock Holdings LLC is authorized to display and aggregate these public records. No special license is required to present public government data with source attribution.

---

## 8. In-App Purchase Summary

### Subscriptions (auto-renewing)

| Product | Apple Product ID | Price | Description |
|---|---|---|---|
| **Quarry Access** (monthly) | `com.ssrockholdings.marketplace.monthly` | $69/mo | Mine/quarry identity, location, interactive mapping, basic commodity intelligence, report purchasing |
| **Quarry Access** (annual) | `com.ssrockholdings.marketplace.annual` | $690/yr | Same as above, annual billing |
| **Professional Intelligence** (monthly) | `com.ssrockholdings.professional.monthly` | $139/mo | Everything in Quarry Access + parcel/ownership, geology, MSHA/TDEC/environmental, production estimates, opportunity screening, preferred report pricing |
| **Professional Intelligence** (annual) | `com.ssrockholdings.professional.annual` | $1,390/yr | Same as above, annual billing (≈2 months free) |

**Where to find:** Bottom navigation → "Subscribe" tab → Subscription page (`/subscribe`)

### One-Time Purchases

| Product | Apple Product ID | Price | Description |
|---|---|---|---|
| **Data Room Access** | `com.ssrockholdings.dataroom.access` | $250 | One-time access to a listing's NDA-gated confidential data room (core drilling, environmental reports) |

**Where to find:** Any listing detail page (`/listings/:id`) → Accept NDA → "Access Data Room" button

### Report Purchases (web-based Stripe checkout)

| Report | Price | Where to find |
|---|---|---|
| Site Snapshot | $89 | Mine detail page or Subscription page |
| Standard Intelligence Report | $189 | Mine detail page → "Standard report" button |
| Enhanced Intelligence Report | $389 | Mine detail page → "Enhanced report" button |
| Deal Due-Diligence Report | $1,500 | Via support request or admin deal desk |
| Custom Intelligence | from $2,500 | Via support request |

**Note:** Report purchases are processed via Stripe web checkout (not Apple IAP) as they are non-subscription services delivered outside the app via PDF. Per Apple Guideline 3.1.3, these are exempt from IAP requirements.

### Subscription Management

Subscribers can manage or cancel their subscription at any time via:
- iOS Settings → Apple ID → Subscriptions
- The app's Subscription page (`/subscribe`) → "Manage Subscription" link

Auto-renewal disclosure and terms are displayed on the Subscription page before purchase, per Apple Guideline 3.1.2.

---

## Review Account Auto-Entitlement

The review account (`contact+appreview@ssrockholdings.com`) is automatically granted a 10-year Professional Intelligence entitlement on login. This is handled by the `ensure-review-demo-entitlement` backend function, which verifies the email address and creates/refreshes a `SubscriptionEntitlement` record with `status: active` and `platform: admin`. This ensures the reviewer can access all paid features without making a real purchase.

If the entitlement does not activate automatically, sign out and sign back in — the function runs on every login of the review account.