# App Review Notes — S&S Rock Holdings Mobile

## 1. Current subscription model
S&S Rock Holdings Mobile now offers one auto-renewing iOS subscription:

- Full Quarry Intelligence Monthly
- Product ID: com.ssrockholdings.mobile.quarryintelligence.monthly199
- Price: $199.00 USD per month
- Introductory offer: 3-day free trial for eligible new subscribers
- Billing period: 1 month, auto-renewing

The retired Marketplace, Professional, annual, and Deal subscription tiers are not offered by the current app UI.

## 2. Purchase and access flow
Registration is not required to purchase the Apple subscription.

Signed-out iPhone path:
Launch → Membership → Full Quarry Intelligence → Subscribe → Apple StoreKit purchase sheet → eligible 3-day free trial → $199/month renewal.

After Apple confirms an active StoreKit entitlement, Full Quarry Intelligence unlocks on the device. Restore Purchases is available while signed out. An S&S account is optional for Apple subscription access and is used for account-linked tools such as saved opportunities, alerts, buyer/seller tools, messages, and network profiles.

The app does not open Stripe or another external checkout for the iOS subscription.

## 3. What Full Quarry Intelligence unlocks
The membership unlocks detailed quarry and mine intelligence, including source-linked mine identity and operating status, mapping, parcel/tax and ownership intelligence, permitted acreage where available, geology and rock type, MSHA/TDEC/environmental records, production/activity context, opportunity screening, and related professional workflow tools.

Custom reports, due-diligence research, surveys, reserve studies, environmental work, and similar engagements are separate professional services. Scope and pricing are confirmed directly by S&S Rock Holdings and are not additional in-app subscription tiers.

## 4. Apple review access
A dedicated App Review account is available. The review-account credentials are maintained in App Store Connect Review Information rather than in this repository.

Account deletion is available in the app at /account/delete.

## 5. External services and source data
The app uses Apple StoreKit, Base44, MSHA, Tennessee Department of Environment and Conservation / Division of Mineral & Geologic Resources, Tennessee Comptroller property sources, USGS, EPA sources, Esri imagery, and OpenStreetMap where applicable. Google Play Billing is Android-only. Stripe is limited to eligible website transactions.

Tennessee currently has the deepest parcel/ownership, permit/permitted-acreage, environmental, and geology coverage. Missing values are shown as unavailable or pending rather than guessed.

S&S Rock Holdings provides business-intelligence and screening information. It is not a title opinion, appraisal, certified reserve estimate, engineering opinion, geological certification, environmental assessment, or guarantee of commercially recoverable material. Government and other external data are source-labeled where available.

## 6. Subscription controls and legal links
The Membership screen shows the monthly price, free-trial eligibility language, auto-renewal terms, Restore Purchases, Manage Subscriptions, Terms of Use, Privacy Policy, and Apple standard EULA link. StoreKit presents Apple's final storefront price and confirmation before purchase.

The standard Apple Terms of Use (EULA) applies to the iOS app.

## 7. Prior-review fixes retained
- Apple subscription purchase does not require S&S registration.
- Active StoreKit entitlement unlocks Full Quarry Intelligence while signed out.
- Native Base44 API/public-settings routing is pinned to the production Base44 service.
- StoreKit product loading includes retry and timeout handling.
- The retired 60-second JavaScript preview gate is removed.
- The current app presents one $199/month Full Quarry Intelligence subscription rather than the retired multi-tier pricing model.
