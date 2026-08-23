# App Review Notes — S&S Rock Holdings

BEFORE SUBMISSION: replace `[TEST DEVICE / OS]` with the exact physical device used for the attached recording.

1. SCREEN RECORDING
A physical-device recording is attached and starts from a fresh launch. It shows Home/map → quarry record → Subscribe → Apple subscription purchase while signed out → StoreKit sheet → paid access → Restore Purchases / Manage Subscriptions. It also shows optional registration/login and account deletion. The app does not request location, camera, contacts, microphone, or App Tracking Transparency permission. There is no public user-to-user posting/chat; seller submissions are reviewed before publication and Support handles content/data concerns.

2. DEVICES TESTED
- Developer physical device: `[TEST DEVICE / OS]`
- Prior Apple review device reported: iPad Air 11-inch (M3), iPadOS 26.6

3. PURPOSE / AUDIENCE
S&S Rock Holdings provides quarry, aggregate, mineral-property and due-diligence intelligence for operators, producers, investors, acquisition professionals and industry advisers. It consolidates fragmented public mine, permit, parcel, geology, environmental and production/activity information into mapped quarry records and screening tools.

4. ACCESS / LOGIN
Registration is NOT required to browse the preview or purchase an Apple subscription.
Signed-out IAP path: Launch → Subscribe → Choose monthly/annual → native Apple StoreKit sheet → purchase → app reads StoreKit current entitlements and unlocks access without an S&S account. Restore Purchases also works signed out. Account creation is optional for users who later want account-linked S&S services.

Optional review account for account-specific features:
Email: contact+appreview@ssrockholdings.com
Password: SSRockReview2026!
Account deletion: /account/delete

5. EXTERNAL SERVICES
Apple StoreKit; Base44 backend/auth/database/functions; MSHA; TDEC Division of Mineral & Geologic Resources; Tennessee Comptroller IMPACT; USGS; EPA ECHO/ICIS-NPDES; Esri World Imagery; OpenStreetMap. Google Play Billing is used in Android. Stripe is used only for eligible website transactions; native iOS subscription purchase does not open external checkout.

6. REGIONAL DIFFERENCES
Features are consistent across regions; data depth varies by public-source availability. Tennessee currently has the deepest parcel/ownership, TDEC permit/permitted-acreage, environmental and geology coverage. Missing values remain unavailable/pending rather than being guessed.

7. REGULATED / THIRD-PARTY DATA
This is a business-intelligence/screening product, not a title opinion, appraisal, certified reserve estimate, engineering/geology opinion or environmental assessment. MSHA, TDEC, USGS, EPA and Tennessee Comptroller data comes from public government sources and is source-labeled. Seller confidential materials use controlled listing/data-room workflows.

8. IN-APP PURCHASES
Auto-renewing subscriptions are purchased from Subscribe:
- Quarry Access Monthly — com.ssrockholdings.marketplace.monthly — $69 / 1 month
- Quarry Access Annual — com.ssrockholdings.marketplace.annual — $690 / 1 year
- Professional Monthly — com.ssrockholdings.professional.monthly — $139 / 1 month
- Professional Annual — com.ssrockholdings.professional.annual — $1,000 / 1 year
The screen shows duration, auto-renew terms, Restore Purchases, Manage Subscriptions, Terms and Privacy. StoreKit storefront prices are shown at purchase.

PRIOR-REVIEW FIXES
- Removed required S&S registration from Apple subscription purchase.
- StoreKit entitlement unlocks access while signed out.
- Choose monthly/annual always invokes StoreKit instead of silently disabling when product metadata is delayed.
- Added visible purchase status/errors, restore/manage controls and explicit durations.
