#!/usr/bin/env python3
"""Retired legacy App Review mutation script.

The former version was hard-wired to TestFlight build 20 and retired subscription
products. It is intentionally non-mutating now so it cannot accidentally attach
an obsolete build or obsolete subscription versions to App Store Review.

Use .github/workflows/ios-testflight.yml for current builds and
scripts/apple_subscription_sync.py for the current Full Quarry Intelligence
subscription audit/sync.
"""

print(
    "RETIRED: apple_review_prepare.py makes no App Store Connect changes. "
    "Use the iOS TestFlight Upload workflow for the current build."
)
