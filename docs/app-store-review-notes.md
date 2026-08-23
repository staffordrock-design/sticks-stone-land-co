# App Review Notes — S&S Rock Holdings

1. SCREEN RECORDING / PRIOR ISSUE FIX
A physical-device TestFlight recording of build 2.130297.1 (20) is provided. Tested on iPhone 15 Pro Max, iOS 27.0. It shows 263 quarry/aggregate records and maps loading, browsing while signed out, the Access screen stating registration is not required, and Quarry Access Monthly opening Apple's native TestFlight StoreKit purchase sheet at $69.00/month. This directly demonstrates the previously failing subscription action now reaches Apple's purchase sheet without requiring S&S registration.

The app does not request location, camera, contacts, microphone, or App Tracking Transparency permission. There is no public user-to-user posting/chat; seller submissions are reviewed before publication.

2. TEST DEVICE
- iPhone 15 Pro Max, iOS 27.0
- TestFlight build 2.130297.1 (20)
- Prior Apple review device: iPad Air 11-inch (M3), iPadOS 26.6

3. PURPOSE / AUDIENCE
S&S Rock Holdings provides quarry, aggregate, mineral-property and due-diligence intelligence for operators, producers, investors, acquisition professionals and industry advisers. It consolidates public mine, permit, parcel, geology, environmental and production/activity information into mapped quarry records and screening tools.

4. ACCESS / LOGIN
Registration is NOT required to browse or purchase an Apple subscription.
Signed-out path: Launch → Subscribe → Choose monthly/annual → native Apple StoreKit sheet → purchase → StoreKit entitlement unlocks access without an S&S account. Restore Purchases also works signed out. Account creation is optional for account-linked services.

Optional review account:
Email: contact+appreview@ssrockholdings.com
Password: SSRockReview2026!
Account deletion: /account/delete

5. EXTERNAL SERVICES
Apple StoreKit; Base44; MSHA; TDEC Division of Mineral & Geologic Resources; Tennessee Comptroller IMPACT; USGS; EPA ECHO/ICIS-NPDES; Esri World Imagery; OpenStreetMap. Google Play Billing is Android-only. Stripe is limited to eligible website transactions; native iOS subscriptions do not open external checkout.

6. REGIONAL / DATA NOTES
Features are consistent across regions; public-source depth varies. Tennessee currently has the deepest parcel/ownership, TDEC permit/permitted-acreage, environmental and geology coverage. Missing values remain unavailable/pending rather than being guessed.

This is a business-intelligence/screening product, not a title opinion, appraisal, certified reserve estimate, engineering/geology opinion or environmental assessment. Government-source data is source-labeled.

7. IN-APP PURCHASES
Auto-renewing subscriptions are purchased from Subscribe:
- Quarry Access Monthly — com.ssrockholdings.marketplace.monthly — $69 / 1 month
- Quarry Access Annual — com.ssrockholdings.marketplace.annual — $690 / 1 year
- Professional Monthly — com.ssrockholdings.professional.monthly — $139 / 1 month
- Professional Annual — com.ssrockholdings.professional.annual — $1,000 / 1 year
The screen shows duration, auto-renew terms, Restore Purchases, Manage Subscriptions, Terms and Privacy. StoreKit storefront prices are shown at purchase.

PRIOR-REVIEW FIXES
- Removed required S&S registration from Apple subscription purchase.
- StoreKit entitlement unlocks access while signed out.
- Corrected native Base44 API/public-settings routing so TestFlight loads quarry inventory/maps.
- Added StoreKit product retry/availability handling.
- Paid Apps Agreement, banking and tax setup are complete.
