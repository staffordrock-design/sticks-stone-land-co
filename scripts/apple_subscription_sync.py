#!/usr/bin/env python3
"""Idempotently audit/create S&S Rock Holdings App Store Connect subscriptions.

Runs only in GitHub Actions with ASC_PRIVATE_KEY provided as a repository secret.
Writes a sanitized JSON report to reports/apple_subscription_sync.json.
"""

from __future__ import annotations

import base64
import datetime as dt
import json
import os
import sys
import time
from decimal import Decimal
from pathlib import Path
from typing import Any
from urllib.parse import quote

import jwt
import requests

API = "https://api.appstoreconnect.apple.com"
BUNDLE_ID = "com.ssrockholdings.quarrymarketplace"
GROUP_REFERENCE = "S&S Rock Holdings Access"
GROUP_DISPLAY_NAME = "S&S Rock Holdings Access"
ISSUER_ID = os.getenv("ASC_ISSUER_ID", "7097918c-2758-4720-b0fa-938914c24b36")
KEY_IDS = [x.strip() for x in os.getenv("ASC_KEY_IDS", "").split(",") if x.strip()]
PRIVATE_KEY = os.getenv("ASC_PRIVATE_KEY", "")
REPORT_PATH = Path(os.getenv("ASC_REPORT_PATH", "reports/apple_subscription_sync.json"))
TODAY = dt.datetime.now(dt.timezone.utc).date().isoformat()

PRODUCTS = [
    {
        "product_id": "com.ssrockholdings.marketplace.monthly",
        "internal_name": "Quarry Access Monthly",
        "display_name": "Quarry Access Monthly",
        "description": "Monthly access to S&S Rock Holdings quarry marketplace, maps, mine identity and basic site intelligence.",
        "period": "ONE_MONTH",
        "group_level": 2,
        "usa_price": Decimal("69.00"),
    },
    {
        "product_id": "com.ssrockholdings.marketplace.annual",
        "internal_name": "Quarry Access Annual",
        "display_name": "Quarry Access Annual",
        "description": "Annual access to S&S Rock Holdings quarry marketplace, maps, mine identity and basic site intelligence.",
        "period": "ONE_YEAR",
        "group_level": 2,
        "usa_price": Decimal("690.00"),
    },
    {
        "product_id": "com.ssrockholdings.professional.monthly",
        "internal_name": "Professional Intelligence Monthly",
        "display_name": "Professional Intelligence Monthly",
        "description": "Monthly access to advanced parcel, geology, permit, environmental, production and quarry screening intelligence.",
        "period": "ONE_MONTH",
        "group_level": 1,
        "usa_price": Decimal("139.00"),
    },
    {
        "product_id": "com.ssrockholdings.professional.annual",
        "internal_name": "Professional Intelligence Annual",
        "display_name": "Professional Intelligence Annual",
        "description": "Annual access to advanced parcel, geology, permit, environmental, production and quarry screening intelligence.",
        "period": "ONE_YEAR",
        "group_level": 1,
        "usa_price": Decimal("1390.00"),
    },
]

report: dict[str, Any] = {
    "generated_at": dt.datetime.now(dt.timezone.utc).isoformat(),
    "bundle_id": BUNDLE_ID,
    "authenticated": False,
    "key_id_used": None,
    "app_id": None,
    "group": None,
    "products": {},
    "errors": [],
}


def save_report() -> None:
    REPORT_PATH.parent.mkdir(parents=True, exist_ok=True)
    REPORT_PATH.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def fail(message: str, *, fatal: bool = False) -> None:
    print(f"ERROR: {message}", file=sys.stderr)
    report["errors"].append(message)
    save_report()
    if fatal:
        raise SystemExit(1)


def make_token(key_id: str) -> str:
    now = int(time.time())
    return jwt.encode(
        {"iss": ISSUER_ID, "iat": now, "exp": now + 900, "aud": "appstoreconnect-v1"},
        PRIVATE_KEY,
        algorithm="ES256",
        headers={"kid": key_id, "typ": "JWT"},
    )


class ASC:
    def __init__(self, token: str):
        self.session = requests.Session()
        self.session.headers.update(
            {
                "Authorization": f"Bearer {token}",
                "Accept": "application/json",
                "Content-Type": "application/json",
            }
        )

    def request(self, method: str, path_or_url: str, *, params=None, payload=None, allow=(200, 201)) -> dict[str, Any]:
        url = path_or_url if path_or_url.startswith("http") else API + path_or_url
        for attempt in range(5):
            response = self.session.request(method, url, params=params, json=payload, timeout=60)
            if response.status_code in allow:
                if not response.content:
                    return {}
                return response.json()
            if response.status_code == 429 or response.status_code >= 500:
                time.sleep(min(2 ** attempt, 16))
                continue
            detail = response.text[:2000]
            raise RuntimeError(f"{method} {url} -> {response.status_code}: {detail}")
        raise RuntimeError(f"{method} {url} failed after retries")

    def all(self, path: str, *, params=None) -> list[dict[str, Any]]:
        data: list[dict[str, Any]] = []
        url: str | None = path
        first = True
        while url:
            body = self.request("GET", url, params=params if first else None)
            first = False
            data.extend(body.get("data", []))
            url = (body.get("links") or {}).get("next")
        return data


def authenticate() -> ASC:
    if not PRIVATE_KEY:
        fail("GitHub secret ASC_PRIVATE_KEY is missing.", fatal=True)
    if not KEY_IDS:
        fail("No App Store Connect key IDs were configured for authentication.", fatal=True)

    last_error = None
    for key_id in KEY_IDS:
        try:
            token = make_token(key_id)
            client = ASC(token)
            apps = client.all("/v1/apps", params={"filter[bundleId]": BUNDLE_ID, "limit": 10})
            if apps:
                report["authenticated"] = True
                report["key_id_used"] = key_id
                report["app_id"] = apps[0]["id"]
                save_report()
                print(f"Authenticated to App Store Connect; app {BUNDLE_ID} found.")
                return client
            last_error = f"Key {key_id} authenticated but app {BUNDLE_ID} was not visible."
        except Exception as exc:  # sanitized into report; private key is never included by requests/PyJWT
            last_error = f"Key {key_id} could not authenticate: {type(exc).__name__}"
    fail(last_error or "Unable to authenticate to App Store Connect.", fatal=True)
    raise AssertionError


def ensure_group(client: ASC, app_id: str) -> str:
    groups = client.all(
        f"/v1/apps/{app_id}/subscriptionGroups",
        params={"include": "subscriptions,subscriptionGroupLocalizations", "limit": 200, "limit[subscriptions]": 50},
    )
    wanted_ids = {p["product_id"] for p in PRODUCTS}
    group = next((g for g in groups if (g.get("attributes") or {}).get("referenceName") == GROUP_REFERENCE), None)

    if not group:
        # Reuse a group already containing one of our product IDs, if one exists.
        for g in groups:
            gid = g["id"]
            body = client.request("GET", f"/v1/subscriptionGroups/{gid}", params={"include": "subscriptions"})
            included = body.get("included", [])
            if any((x.get("attributes") or {}).get("productId") in wanted_ids for x in included if x.get("type") == "subscriptions"):
                group = g
                break

    created = False
    if not group:
        payload = {
            "data": {
                "type": "subscriptionGroups",
                "attributes": {"referenceName": GROUP_REFERENCE},
                "relationships": {"app": {"data": {"type": "apps", "id": app_id}}},
            }
        }
        group = client.request("POST", "/v1/subscriptionGroups", payload=payload)["data"]
        created = True
        print("Created Apple subscription group.")

    group_id = group["id"]
    localizations = client.all(f"/v1/subscriptionGroups/{group_id}/subscriptionGroupLocalizations", params={"limit": 50})
    if not any((x.get("attributes") or {}).get("locale") == "en-US" for x in localizations):
        payload = {
            "data": {
                "type": "subscriptionGroupLocalizations",
                "attributes": {"name": GROUP_DISPLAY_NAME, "locale": "en-US"},
                "relationships": {"subscriptionGroup": {"data": {"type": "subscriptionGroups", "id": group_id}}},
            }
        }
        client.request("POST", "/v1/subscriptionGroupLocalizations", payload=payload)
        print("Created subscription group en-US localization.")

    report["group"] = {"id": group_id, "reference_name": (group.get("attributes") or {}).get("referenceName", GROUP_REFERENCE), "created": created}
    save_report()
    return group_id


def list_group_subscriptions(client: ASC, group_id: str) -> dict[str, dict[str, Any]]:
    body = client.request("GET", f"/v1/subscriptionGroups/{group_id}", params={"include": "subscriptions", "limit[subscriptions]": 50})
    items = [x for x in body.get("included", []) if x.get("type") == "subscriptions"]
    result = {}
    for item in items:
        product_id = (item.get("attributes") or {}).get("productId")
        if product_id:
            item = dict(item)
            item["_group_id"] = group_id
            result[product_id] = item
    return result


def list_all_app_subscriptions(client: ASC, app_id: str) -> dict[str, dict[str, Any]]:
    """Find subscriptions across every group for this app.

    Product IDs are unique in App Store Connect, but they may already live in a
    different group than the one our local tracker expects. Reuse those exact
    Apple records rather than attempting to recreate duplicate product IDs.
    """
    groups = client.all(f"/v1/apps/{app_id}/subscriptionGroups", params={"limit": 200})
    result: dict[str, dict[str, Any]] = {}
    for group in groups:
        group_id = group["id"]
        for product_id, item in list_group_subscriptions(client, group_id).items():
            result[product_id] = item
    return result


def create_subscription(client: ASC, group_id: str, product: dict[str, Any]) -> dict[str, Any]:
    attrs = {
        "name": product["internal_name"],
        "productId": product["product_id"],
        "subscriptionPeriod": product["period"],
        "familySharable": False,
        "reviewNote": "Provides access to S&S Rock Holdings quarry intelligence features shown in the app.",
        "groupLevel": product["group_level"],
        "availableInAllTerritories": True,
    }
    payload = {
        "data": {
            "type": "subscriptions",
            "attributes": attrs,
            "relationships": {"group": {"data": {"type": "subscriptionGroups", "id": group_id}}},
        }
    }
    try:
        return client.request("POST", "/v1/subscriptions", payload=payload)["data"]
    except RuntimeError as exc:
        # Compatibility fallback if Apple rejects the legacy availability creation attribute.
        if "availableInAllTerritories" in str(exc) or "ATTRIBUTE" in str(exc).upper():
            del attrs["availableInAllTerritories"]
            return client.request("POST", "/v1/subscriptions", payload=payload)["data"]
        raise


def ensure_localization(client: ASC, subscription_id: str, product: dict[str, Any]) -> None:
    locs = client.all(f"/v1/subscriptions/{subscription_id}/subscriptionLocalizations", params={"limit": 50})
    if any((x.get("attributes") or {}).get("locale") == "en-US" for x in locs):
        return
    payload = {
        "data": {
            "type": "subscriptionLocalizations",
            "attributes": {
                "name": product["display_name"],
                "locale": "en-US",
                "description": product["description"],
            },
            "relationships": {"subscription": {"data": {"type": "subscriptions", "id": subscription_id}}},
        }
    }
    client.request("POST", "/v1/subscriptionLocalizations", payload=payload)


def decimal_price(value: Any) -> Decimal:
    return Decimal(str(value)).quantize(Decimal("0.01"))


def find_usa_price_point(client: ASC, subscription_id: str, desired: Decimal) -> dict[str, Any]:
    # Apple documents include=territory for this endpoint, but the live API for
    # this app currently rejects that relationship. The price-point id itself
    # encodes the territory, so requesting the filtered data alone is enough.
    points = client.all(
        f"/v1/subscriptions/{subscription_id}/pricePoints",
        params={"filter[territory]": "USA", "limit": 8000},
    )
    for point in points:
        price = (point.get("attributes") or {}).get("customerPrice")
        if price is not None and decimal_price(price) == desired:
            return point
    available = sorted({str((p.get("attributes") or {}).get("customerPrice")) for p in points if (p.get("attributes") or {}).get("customerPrice") is not None})
    raise RuntimeError(f"No USA Apple price point exactly matches ${desired}; {len(available)} price points checked.")


def territory_id_from_point(point: dict[str, Any]) -> str | None:
    rel = ((point.get("relationships") or {}).get("territory") or {}).get("data") or {}
    if rel.get("id"):
        return rel["id"]

    # Subscription price-point IDs are URL-safe base64 JSON and contain a
    # territory key ("t"), for example {"s":"…","t":"USA","p":"…"}.
    # This fallback keeps the sync compatible with Apple responses that omit
    # relationship data even when territory-filtered.
    raw_id = str(point.get("id") or "")
    if raw_id:
        try:
            padded = raw_id + "=" * ((4 - len(raw_id) % 4) % 4)
            decoded = json.loads(base64.urlsafe_b64decode(padded).decode("utf-8"))
            territory = decoded.get("t") or decoded.get("territory")
            if territory:
                return str(territory)
        except Exception:
            pass
    return None


def ensure_prices(client: ASC, subscription_id: str, desired: Decimal) -> dict[str, Any]:
    current = client.all(
        f"/v1/subscriptions/{subscription_id}/prices",
        params={"include": "territory,subscriptionPricePoint", "limit": 200},
    )
    current_territories = set()
    for item in current:
        rel = ((item.get("relationships") or {}).get("territory") or {}).get("data") or {}
        if rel.get("id"):
            current_territories.add(rel["id"])

    usa_point = find_usa_price_point(client, subscription_id, desired)
    points = [usa_point]
    # Standard equalizations are sufficient for configuring the matching Apple
    # price tier in each territory. Decode territory from the opaque IDs rather
    # than relying on included relationship objects.
    equalized = client.all(
        f"/v1/subscriptionPricePoints/{quote(usa_point['id'], safe='')}/equalizations",
        params={"limit": 8000},
    )
    points.extend(equalized)

    by_territory: dict[str, dict[str, Any]] = {}
    for point in points:
        territory = territory_id_from_point(point)
        if territory:
            by_territory[territory] = point

    created = 0
    failed: list[str] = []
    for territory, point in by_territory.items():
        if territory in current_territories:
            continue
        payload = {
            "data": {
                "type": "subscriptionPrices",
                "attributes": {"startDate": TODAY, "preserveCurrentPrice": False},
                "relationships": {
                    "subscription": {"data": {"type": "subscriptions", "id": subscription_id}},
                    "subscriptionPricePoint": {"data": {"type": "subscriptionPricePoints", "id": point["id"]}},
                },
            }
        }
        try:
            client.request("POST", "/v1/subscriptionPrices", payload=payload)
            created += 1
            time.sleep(0.03)
        except Exception as exc:
            failed.append(f"{territory}:{type(exc).__name__}")

    return {
        "usa_price": str(desired),
        "territories_available_from_equalization": len(by_territory),
        "existing_price_territories": len(current_territories),
        "prices_created": created,
        "price_failures": failed[:20],
    }


def read_subscription_state(client: ASC, subscription_id: str) -> str | None:
    body = client.request("GET", f"/v1/subscriptions/{subscription_id}")
    return (body.get("data", {}).get("attributes") or {}).get("state")


def main() -> None:
    save_report()
    client = authenticate()
    app_id = str(report["app_id"])
    group_id = ensure_group(client, app_id)
    existing = list_all_app_subscriptions(client, app_id)

    for product in PRODUCTS:
        pid = product["product_id"]
        entry = {"created": False, "localized": False, "pricing": None, "state": None, "id": None}
        report["products"][pid] = entry
        try:
            sub = existing.get(pid)
            if not sub:
                sub = create_subscription(client, group_id, product)
                existing[pid] = sub
                entry["created"] = True
                print(f"Created {pid}")
            sid = sub["id"]
            entry["id"] = sid
            entry["group_id"] = sub.get("_group_id") or group_id
            ensure_localization(client, sid, product)
            entry["localized"] = True
            entry["pricing"] = ensure_prices(client, sid, product["usa_price"])
            entry["state"] = read_subscription_state(client, sid)
        except Exception as exc:
            message = f"{pid}: {type(exc).__name__}: {str(exc)[:700]}"
            report["errors"].append(message)
            entry["error"] = message
            print(f"ERROR {message}", file=sys.stderr)
        finally:
            save_report()

    # Final refresh of states for any products that reached Apple.
    for pid, entry in report["products"].items():
        if entry.get("id"):
            try:
                entry["state"] = read_subscription_state(client, entry["id"])
            except Exception:
                pass
    save_report()

    if report["errors"]:
        print(f"Completed with {len(report['errors'])} issue(s). See {REPORT_PATH}.")
    else:
        print(f"Apple subscription sync completed successfully. See {REPORT_PATH}.")


if __name__ == "__main__":
    main()
