# App Review Notes — S&S Rock Holdings

IMPORTANT BEFORE SUBMISSION: replace `[PHYSICAL TEST DEVICE / OS]` below with the exact physical device used for the attached recording.

## 1. Physical-device recording
A physical-device screen recording is attached. It begins from a fresh app launch and demonstrates the normal user flow: Home/map → quarry record → Subscribe → Apple subscription purchase while signed out → StoreKit purchase sheet → paid access → Restore Purchases / Manage Subscriptions. It also shows optional account registration/login and account deletion. The app does not request location, camera, contacts, microphone, or App Tracking Transparency permission. The app has no public user-to-user posting/chat; seller submissions are reviewed by S&S before publication and Support is available for content/data concerns.

## 2. Devices tested
- Developer physical test device: `[PHYSICAL TEST DEVICE / OS]`
- Prior App Review device reported by Apple: iPad Air 11-inch (M3), iPadOS 26.6

## 3. Purpose / audience
S&S Rock Holdings is quarry, aggregate, mineral-property and due-diligence intelligence for quarry operators, aggregate producers, investors, acquisition professionals, land professionals and industry advisers. It consolidates fragmented public-source mine, permit, parcel, geology, environmental and production/activity information into mapped quarry records and screening tools.

## 4. Access instructions
No registration is required to browse the public preview or purchase an Apple subscription.

IAP test path while SIGNED OUT:
1. Launch app.
2. Open Subscribe.
3. Tap Choose monthly or Choose annual.
4. The native Apple StoreKit purchase sheet opens.
5. After purchase, the app reads StoreKit current entitlements and unlocks the purchased level without requiring an S&S account.
6. Restore Purchases also works while signed out.
7. Account creation is optional and is offered only for users who want account-linked S&S services/access.

Optional review account for inspecting account-specific features:
Email: contact+appreview@ssrockholdings.com
Password: SSRockReview2026!
Account deletion: /account/delete

## 5. External services
Apple StoreKit (iOS IAP); Base44 (app backend/auth/database/functions); MSHA; TDEC Division of Mineral & Geologic Resources; Tennessee Comptroller IMPACT parcel/assessment GIS; USGS; EPA ECHO/ICIS-NPDES; Esri World Imagery; OpenStreetMap. Google Play Billing is used in the Android build. Stripe is used only for eligible website transactions; the native iOS subscription flow does not open external checkout.

## 6. Regional differences
App functionality is consistent across regions. Data depth varies by source availability. Tennessee has the deepest current parcel/ownership, TDEC permit, permitted-acreage, environmental and geology coverage; other states are enriched progressively. Missing values remain identified as unavailable/pending rather than being guessed.

## 7. Regulated / third-party data
The app is a business-intelligence and screening product. It is not a legal title opinion, appraisal, certified reserve estimate, engineering/geology opinion or environmental assessment. MSHA, TDEC, USGS, EPA and Tennessee Comptroller information comes from public government sources and is source-labeled. Seller-provided confidential materials are only presented through controlled listing/data-room workflows.

## 8. In-App Purchases
Subscriptions are auto-renewing and purchased through Apple StoreKit from Subscribe:
- Quarry Access Monthly — com.ssrockholdings.marketplace.monthly — $69 / 1 month
- Quarry Access Annual — com.ssrockholdings.marketplace.annual — $690 / 1 year
- Professional Intelligence Monthly — com.ssrockholdings.professional.monthly — $139 / 1 month
- Professional Intelligence Annual — com.ssrockholdings.professional.annual — $1,000 / 1 year

The Subscribe screen displays duration, auto-renewal terms, Restore Purchases, Manage Subscriptions, Terms of Use and Privacy Policy. Prices shown during purchase are the App Store storefront prices returned by StoreKit.

## Changes made in response to prior review
- Removed required S&S registration from the Apple subscription purchase path.
- StoreKit entitlement now unlocks subscription access even while signed out.
- Fixed Choose monthly / Choose annual so tapping always invokes StoreKit instead of becoming silently disabled when preliminary product metadata is delayed.
- Added visible purchase errors/status, Restore Purchases, Manage Subscriptions and explicit subscription durations.
