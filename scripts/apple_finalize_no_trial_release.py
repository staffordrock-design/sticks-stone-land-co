#!/usr/bin/env python3
from __future__ import annotations

import datetime as dt
import json
import os
import sys
import time
from pathlib import Path
from typing import Any

import jwt
import requests

API = "https://api.appstoreconnect.apple.com"
BUNDLE_ID = "com.base6a78376a454093ba2f431acd.app"
TARGET_VERSION = os.getenv("ASC_TARGET_VERSION", "2.130297.5")
PRODUCT_ID = "com.ssrockholdings.mobile.quarryintelligence.monthly199"
ISSUER_ID = os.getenv("ASC_ISSUER_ID", "7097918c-2758-4720-b0fa-938914c24b36")
KEY_IDS = [x.strip() for x in os.getenv("ASC_KEY_IDS", "").split(",") if x.strip()]
PRIVATE_KEY = os.getenv("ASC_PRIVATE_KEY", "")
REPORT_PATH = Path(os.getenv("ASC_FINALIZE_REPORT_PATH", "reports/apple_finalize_no_trial_release.json"))

report: dict[str, Any] = {
    "generated_at": dt.datetime.now(dt.timezone.utc).isoformat(),
    "bundle_id": BUNDLE_ID,
    "target_version": TARGET_VERSION,
    "product_id": PRODUCT_ID,
    "authenticated": False,
    "ready_to_finalize": False,
    "trial_offers_removed": 0,
    "remaining_intro_offers": None,
    "release_requested": False,
    "actions": [],
    "errors": [],
}


def save() -> None:
    REPORT_PATH.parent.mkdir(parents=True, exist_ok=True)
    REPORT_PATH.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def make_token(key_id: str) -> str:
    now = int(time.time())
    return jwt.encode(
        {"iss": ISSUER_ID, "iat": now, "exp": now + 900, "aud": "appstoreconnect-v1"},
        PRIVATE_KEY,
        algorithm="ES256",
        headers={"kid": key_id, "typ": "JWT"},
    )


class ASC:
    def __init__(self, bearer: str):
        self.s = requests.Session()
        self.s.headers.update({"Authorization": f"Bearer {bearer}", "Accept": "application/json", "Content-Type": "application/json"})

    def request(self, method: str, path: str, *, params=None, payload=None, allow=(200, 201)) -> dict[str, Any]:
        url = path if path.startswith("http") else API + path
        for attempt in range(6):
            r = self.s.request(method, url, params=params, json=payload, timeout=60)
            if r.status_code in allow:
                return r.json() if r.content else {}
            if r.status_code == 429 or r.status_code >= 500:
                time.sleep(min(2 ** attempt, 16))
                continue
            raise RuntimeError(f"{method} {url} -> {r.status_code}: {r.text[:1800]}")
        raise RuntimeError(f"{method} {url} failed after retries")

    def all(self, path: str, *, params=None) -> list[dict[str, Any]]:
        out: list[dict[str, Any]] = []
        url: str | None = path
        first = True
        while url:
            body = self.request("GET", url, params=params if first else None)
            first = False
            out.extend(body.get("data", []))
            url = (body.get("links") or {}).get("next")
        return out


def authenticate() -> tuple[ASC, str]:
    if not PRIVATE_KEY or not KEY_IDS:
        raise RuntimeError("App Store Connect credentials are not configured")
    for key_id in KEY_IDS:
        try:
            c = ASC(make_token(key_id))
            apps = c.all("/v1/apps", params={"filter[bundleId]": BUNDLE_ID, "limit": 10})
            if apps:
                report["authenticated"] = True
                report["key_id_used"] = key_id
                report["app_id"] = apps[0]["id"]
                save()
                return c, str(apps[0]["id"])
        except Exception:
            continue
    raise RuntimeError("Unable to authenticate to the S&S Rock Holdings App Store record")


def find_version(c: ASC, app_id: str) -> dict[str, Any]:
    rows = c.all(
        f"/v1/apps/{app_id}/appStoreVersions",
        params={"filter[platform]": "IOS", "filter[versionString]": TARGET_VERSION, "limit": 50},
    )
    if not rows:
        raise RuntimeError(f"App Store version {TARGET_VERSION} was not found")
    return rows[0]


def find_subscription(c: ASC, app_id: str) -> dict[str, Any]:
    groups = c.all(f"/v1/apps/{app_id}/subscriptionGroups", params={"limit": 200})
    for group in groups:
        links = c.all(f"/v1/subscriptionGroups/{group['id']}/relationships/subscriptions", params={"limit": 200})
        for link in links:
            sub = c.request("GET", f"/v1/subscriptions/{link['id']}").get("data") or {}
            if (sub.get("attributes") or {}).get("productId") == PRODUCT_ID:
                return sub
    raise RuntimeError(f"Subscription {PRODUCT_ID} was not found")


def remove_introductory_offers(c: ASC, subscription_id: str) -> int:
    offers = c.all(f"/v1/subscriptions/{subscription_id}/introductoryOffers", params={"limit": 200})
    removed = 0
    for offer in offers:
        oid = str(offer.get("id") or "")
        if not oid:
            continue
        c.request("DELETE", f"/v1/subscriptionIntroductoryOffers/{oid}", allow=(204,))
        removed += 1
        report["actions"].append(f"Removed Apple introductory offer {oid}")
        save()
    remaining = c.all(f"/v1/subscriptions/{subscription_id}/introductoryOffers", params={"limit": 200})
    report["trial_offers_removed"] = removed
    report["remaining_intro_offers"] = len(remaining)
    save()
    if remaining:
        raise RuntimeError(f"Introductory offers still remain after deletion: {len(remaining)}")
    return removed


def release_version(c: ASC, version_id: str) -> None:
    payload = {
        "data": {
            "type": "appStoreVersionReleaseRequests",
            "relationships": {
                "appStoreVersion": {"data": {"type": "appStoreVersions", "id": version_id}}
            },
        }
    }
    c.request("POST", "/v1/appStoreVersionReleaseRequests", payload=payload)
    report["release_requested"] = True
    report["actions"].append(f"Requested manual App Store release for version {TARGET_VERSION}")
    save()


def main() -> None:
    save()
    try:
        c, app_id = authenticate()
        version = find_version(c, app_id)
        version_id = str(version["id"])
        state = (version.get("attributes") or {}).get("appVersionState") or (version.get("attributes") or {}).get("appStoreState")
        report["version_id"] = version_id
        report["version_state"] = state
        save()

        if state in {"READY_FOR_DISTRIBUTION", "PROCESSING_FOR_DISTRIBUTION", "READY_FOR_SALE", "PROCESSING_FOR_APP_STORE"}:
            # Release has already been requested. Verify the product no longer has intro offers.
            sub = find_subscription(c, app_id)
            offers = c.all(f"/v1/subscriptions/{sub['id']}/introductoryOffers", params={"limit": 200})
            report["remaining_intro_offers"] = len(offers)
            report["release_requested"] = True
            save()
            if offers:
                remove_introductory_offers(c, str(sub["id"]))
            print(f"Version {TARGET_VERSION} is already releasing/distributed; no-trial product verified.")
            return

        if state != "PENDING_DEVELOPER_RELEASE":
            report["actions"].append(f"No action: version state is {state}; waiting for Apple approval")
            save()
            print(f"NO_ACTION: version {TARGET_VERSION} state is {state}")
            return

        report["ready_to_finalize"] = True
        save()
        sub = find_subscription(c, app_id)
        remove_introductory_offers(c, str(sub["id"]))
        release_version(c, version_id)
        time.sleep(2)
        refreshed = c.request("GET", f"/v1/appStoreVersions/{version_id}").get("data") or {}
        report["version_state_after"] = (refreshed.get("attributes") or {}).get("appVersionState") or (refreshed.get("attributes") or {}).get("appStoreState")
        save()
        print(f"SUCCESS: removed Apple introductory offers and released version {TARGET_VERSION}.")
    except Exception as exc:
        report["errors"].append(f"{type(exc).__name__}: {str(exc)[:1800]}")
        save()
        print(report["errors"][-1], file=sys.stderr)
        raise


if __name__ == "__main__":
    main()
