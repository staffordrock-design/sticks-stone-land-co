#!/usr/bin/env python3
# Audit refresh after App Store 1.0 build 45 upload.
"""Audit S&S Rock Holdings Apple subscriptions and link them to an editable review submission.

This script is intentionally conservative:
- it never cancels or withdraws an App Review submission;
- it only adds subscription versions to a review submission while that submission is READY_FOR_REVIEW;
- once Apple reports WAITING_FOR_REVIEW / IN_REVIEW, it audits only and leaves the queue untouched.

A sanitized report is written to reports/apple_review_link.json.
"""
from __future__ import annotations

import datetime as dt
import json
import os
import sys
import time
from decimal import Decimal
from pathlib import Path
from typing import Any

import jwt
import requests

API = "https://api.appstoreconnect.apple.com"
BUNDLE_ID = "com.ssrockholdings.quarrymarketplace"
ISSUER_ID = os.getenv("ASC_ISSUER_ID", "7097918c-2758-4720-b0fa-938914c24b36")
KEY_IDS = [x.strip() for x in os.getenv("ASC_KEY_IDS", "").split(",") if x.strip()]
PRIVATE_KEY = os.getenv("ASC_PRIVATE_KEY", "")
REPORT_PATH = Path(os.getenv("ASC_REVIEW_REPORT_PATH", "reports/apple_review_link.json"))
TODAY = dt.datetime.now(dt.timezone.utc).date()

PRODUCTS = {
    "com.ssrockholdings.quarryintelligence.monthly199": Decimal("199.00"),
}

ACTIVE_REVIEW_STATES = {
    "READY_FOR_REVIEW",
    "WAITING_FOR_REVIEW",
    "IN_REVIEW",
    "UNRESOLVED_ISSUES",
    "CANCELING",
    "COMPLETING",
}
EDITABLE_REVIEW_STATES = {"READY_FOR_REVIEW"}

report: dict[str, Any] = {
    "generated_at": dt.datetime.now(dt.timezone.utc).isoformat(),
    "bundle_id": BUNDLE_ID,
    "authenticated": False,
    "key_id_used": None,
    "app_id": None,
    "review_submission": None,
    "app_store_version": None,
    "products": {},
    "actions": [],
    "warnings": [],
    "errors": [],
}


def save() -> None:
    REPORT_PATH.parent.mkdir(parents=True, exist_ok=True)
    REPORT_PATH.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def err(message: str) -> None:
    print(f"ERROR: {message}", file=sys.stderr)
    report["errors"].append(message)
    save()


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
        self.s = requests.Session()
        self.s.headers.update({
            "Authorization": f"Bearer {token}",
            "Accept": "application/json",
            "Content-Type": "application/json",
        })

    def request(self, method: str, path_or_url: str, *, params=None, payload=None, allow=(200, 201)) -> dict[str, Any]:
        url = path_or_url if path_or_url.startswith("http") else API + path_or_url
        for attempt in range(5):
            r = self.s.request(method, url, params=params, json=payload, timeout=60)
            if r.status_code in allow:
                return r.json() if r.content else {}
            if r.status_code == 429 or r.status_code >= 500:
                time.sleep(min(2 ** attempt, 16))
                continue
            raise RuntimeError(f"{method} {url} -> {r.status_code}: {r.text[:1600]}")
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


def authenticate() -> ASC:
    if not PRIVATE_KEY:
        raise RuntimeError("GitHub secret ASC_PRIVATE_KEY is missing")
    if not KEY_IDS:
        raise RuntimeError("No App Store Connect key IDs configured")
    last = None
    for key_id in KEY_IDS:
        try:
            c = ASC(make_token(key_id))
            apps = c.all("/v1/apps", params={"filter[bundleId]": BUNDLE_ID, "limit": 10})
            if apps:
                report["authenticated"] = True
                report["key_id_used"] = key_id
                report["app_id"] = apps[0]["id"]
                save()
                return c
            last = f"key {key_id} authenticated but app not visible"
        except Exception as exc:
            last = f"key {key_id}: {type(exc).__name__}"
    raise RuntimeError(last or "Unable to authenticate")


def get_subscription_map(c: ASC, app_id: str) -> tuple[dict[str, dict[str, Any]], dict[str, dict[str, Any]]]:
    groups = c.all("/v1/apps/%s/subscriptionGroups" % app_id, params={"limit": 200})
    group_map: dict[str, dict[str, Any]] = {}
    subscriptions: dict[str, dict[str, Any]] = {}
    for g in groups:
        gid = g["id"]
        group_map[gid] = g
        linkages = c.all(f"/v1/subscriptionGroups/{gid}/relationships/subscriptions", params={"limit": 200})
        for link in linkages:
            sid = link["id"]
            body = c.request("GET", f"/v1/subscriptions/{sid}")
            sub = body["data"]
            pid = (sub.get("attributes") or {}).get("productId")
            if pid:
                sub = dict(sub)
                sub["_group_id"] = gid
                subscriptions[pid] = sub
    return subscriptions, group_map


def usa_price(c: ASC, subscription_id: str) -> dict[str, Any]:
    body = c.request(
        "GET",
        f"/v1/subscriptions/{subscription_id}/prices",
        params={
            "filter[territory]": "USA",
            "include": "subscriptionPricePoint,territory",
            "fields[subscriptionPrices]": "startDate,preserved,planType,territory,subscriptionPricePoint",
            "fields[subscriptionPricePoints]": "customerPrice,proceeds,proceedsYear2",
            "limit": 200,
        },
    )
    included = {x.get("id"): x for x in body.get("included", []) if x.get("type") == "subscriptionPricePoints"}
    rows = []
    for item in body.get("data", []):
        attrs = item.get("attributes") or {}
        rel = ((item.get("relationships") or {}).get("subscriptionPricePoint") or {}).get("data") or {}
        pp = included.get(rel.get("id"), {})
        price = (pp.get("attributes") or {}).get("customerPrice")
        rows.append({
            "start_date": attrs.get("startDate"),
            "customer_price": str(price) if price is not None else None,
            "price_point_id": rel.get("id"),
            "preserved": attrs.get("preserved"),
        })

    def sort_key(row: dict[str, Any]) -> tuple[int, str]:
        sd = row.get("start_date") or "0000-00-00"
        return (1 if sd <= TODAY.isoformat() else 0, sd)

    rows.sort(key=sort_key, reverse=True)
    current = next((r for r in rows if (r.get("start_date") or "0000-00-00") <= TODAY.isoformat()), rows[0] if rows else None)
    return {"current": current, "schedule": rows[:20]}


def usa_price_points(c: ASC, subscription_id: str) -> list[dict[str, Any]]:
    return c.all(
        f"/v1/subscriptions/{subscription_id}/pricePoints",
        params={"filter[territory]": "USA", "fields[subscriptionPricePoints]": "customerPrice", "limit": 8000},
    )


def ranked_price_points(points: list[dict[str, Any]], desired: Decimal) -> list[tuple[Decimal, dict[str, Any]]]:
    ranked: list[tuple[Decimal, dict[str, Any]]] = []
    for point in points:
        value = (point.get("attributes") or {}).get("customerPrice")
        if value is None:
            continue
        price = Decimal(str(value)).quantize(Decimal("0.01"))
        ranked.append((price, point))
    # Closest first. On an exact-distance tie, prefer the higher price so we do
    # not accidentally underprice a professional annual subscription.
    ranked.sort(key=lambda pair: (abs(pair[0] - desired), -pair[0]))
    return ranked


def create_usa_price(c: ASC, sid: str, point: dict[str, Any]) -> None:
    payload = {
        "data": {
            "type": "subscriptionPrices",
            "attributes": {"startDate": TODAY.isoformat(), "preserveCurrentPrice": False},
            "relationships": {
                "subscription": {"data": {"type": "subscriptions", "id": sid}},
                "subscriptionPricePoint": {"data": {"type": "subscriptionPricePoints", "id": point["id"]}},
            },
        }
    }
    c.request("POST", "/v1/subscriptionPrices", payload=payload)


def ensure_usa_price(c: ASC, sid: str, desired: Decimal, audit: dict[str, Any]) -> None:
    current = ((audit.get("usa_pricing") or {}).get("current") or {}).get("customer_price")
    current_decimal = Decimal(str(current)).quantize(Decimal("0.01")) if current is not None else None
    if current_decimal == desired:
        audit["price_status"] = "MATCHES_EXPECTED"
        return

    points = usa_price_points(c, sid)
    ranked = ranked_price_points(points, desired)
    audit["nearest_valid_usa_price_points"] = [str(price) for price, _ in ranked[:8]]
    if not ranked:
        audit["price_status"] = "NO_USA_PRICE_POINTS_AVAILABLE"
        report["warnings"].append(f"{audit['product_id']}: Apple returned no USA subscription price points")
        return

    exact = next(((price, point) for price, point in ranked if price == desired), None)
    if exact:
        chosen_price, point = exact
        create_usa_price(c, sid, point)
        audit["price_status"] = "UPDATED_TO_EXPECTED"
        audit["selected_apple_price"] = str(chosen_price)
        report["actions"].append(f"Set {audit['product_id']} USA price to ${chosen_price}")
        audit["usa_pricing"] = usa_price(c, sid)
        return

    best_price, best_point = ranked[0]
    audit["closest_apple_price"] = str(best_price)
    difference_ratio = abs(best_price - desired) / desired if desired else Decimal("1")

    # If Apple's nearest valid tier is within 2% of the intended price, use it.
    # This covers normal Apple tier rounding while refusing a materially different
    # fallback. Pricing is editable while an IAP/subscription is in review, so
    # this does not withdraw the review submission.
    if difference_ratio <= Decimal("0.02") and current_decimal != best_price:
        create_usa_price(c, sid, best_point)
        audit["price_status"] = "UPDATED_TO_NEAREST_VALID_APPLE_PRICE"
        audit["selected_apple_price"] = str(best_price)
        report["actions"].append(
            f"Set {audit['product_id']} USA price to nearest Apple tier ${best_price} (target ${desired})"
        )
        audit["usa_pricing"] = usa_price(c, sid)
        return

    audit["price_status"] = "EXPECTED_PRICE_POINT_NOT_FOUND"
    report["warnings"].append(
        f"{audit['product_id']}: Apple has no close USA price point for ${desired}; nearest available is ${best_price}"
    )


def subscription_versions(c: ASC, sid: str) -> list[dict[str, Any]]:
    return c.all(f"/v1/subscriptions/{sid}/versions", params={"limit": 200})


def choose_or_create_subscription_version(c: ASC, sid: str, versions: list[dict[str, Any]]) -> tuple[dict[str, Any], bool]:
    active = [v for v in versions if (v.get("attributes") or {}).get("state") in {
        "PREPARE_FOR_SUBMISSION", "READY_FOR_REVIEW", "WAITING_FOR_REVIEW", "IN_REVIEW", "REJECTED"
    }]
    if active:
        return active[-1], False
    if versions:
        return versions[-1], False
    payload = {
        "data": {
            "type": "subscriptionVersions",
            "relationships": {"subscription": {"data": {"type": "subscriptions", "id": sid}}},
        }
    }
    version = c.request("POST", "/v1/subscriptionVersions", payload=payload)["data"]
    return version, True


def version_assets(c: ASC, version_id: str) -> tuple[int, int]:
    locs = c.all(f"/v1/subscriptionVersions/{version_id}/localizations", params={"limit": 50})
    images = c.all(f"/v1/subscriptionVersions/{version_id}/images", params={"limit": 50})
    return len(locs), len(images)


def active_review(c: ASC, app_id: str) -> tuple[dict[str, Any] | None, list[dict[str, Any]]]:
    body = c.request(
        "GET",
        f"/v1/apps/{app_id}/reviewSubmissions",
        params={
            "filter[platform]": "IOS",
            "include": "appStoreVersionForReview",
            "fields[reviewSubmissions]": "platform,submittedDate,state,appStoreVersionForReview",
            "fields[appStoreVersions]": "platform,versionString,appStoreState,appVersionState,createdDate",
            "limit": 200,
        },
    )
    included = body.get("included", [])
    submissions = body.get("data", [])
    candidates = [s for s in submissions if (s.get("attributes") or {}).get("state") in ACTIVE_REVIEW_STATES]
    candidates.sort(key=lambda s: ((s.get("attributes") or {}).get("submittedDate") or "", s.get("id") or ""), reverse=True)
    chosen = candidates[0] if candidates else None
    if chosen:
        rel = ((chosen.get("relationships") or {}).get("appStoreVersionForReview") or {}).get("data") or {}
        version = next((x for x in included if x.get("type") == "appStoreVersions" and x.get("id") == rel.get("id")), None)
        if version:
            report["app_store_version"] = {
                "id": version.get("id"),
                "version_string": (version.get("attributes") or {}).get("versionString"),
                "app_store_state": (version.get("attributes") or {}).get("appStoreState"),
                "app_version_state": (version.get("attributes") or {}).get("appVersionState"),
            }
    return chosen, included


def review_items(c: ASC, review_id: str) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    body = c.request(
        "GET",
        f"/v1/reviewSubmissions/{review_id}/items",
        params={
            "include": "appStoreVersion,subscriptionVersion,subscriptionGroupVersion",
            "fields[reviewSubmissionItems]": "state,appStoreVersion,subscriptionVersion,subscriptionGroupVersion",
            "fields[subscriptionVersions]": "version,state,subscription",
            "fields[appStoreVersions]": "platform,versionString,appStoreState,appVersionState",
            "fields[subscriptionGroupVersions]": "version,state,subscriptionGroup",
            "limit": 200,
        },
    )
    return body.get("data", []), body.get("included", [])


def linked_subscription_version_ids(items: list[dict[str, Any]]) -> set[str]:
    out: set[str] = set()
    for item in items:
        rel = ((item.get("relationships") or {}).get("subscriptionVersion") or {}).get("data") or {}
        if rel.get("id"):
            out.add(rel["id"])
    return out


def add_subscription_version_to_review(c: ASC, review_id: str, version_id: str) -> None:
    payload = {
        "data": {
            "type": "reviewSubmissionItems",
            "relationships": {
                "reviewSubmission": {"data": {"type": "reviewSubmissions", "id": review_id}},
                "subscriptionVersion": {"data": {"type": "subscriptionVersions", "id": version_id}},
            },
        }
    }
    c.request("POST", "/v1/reviewSubmissionItems", payload=payload)


def main() -> None:
    save()
    try:
        c = authenticate()
        app_id = str(report["app_id"])
        subs, groups = get_subscription_map(c, app_id)

        review, _ = active_review(c, app_id)
        review_id = review.get("id") if review else None
        review_state = (review.get("attributes") or {}).get("state") if review else None
        if review:
            report["review_submission"] = {
                "id": review_id,
                "state": review_state,
                "submitted_date": (review.get("attributes") or {}).get("submittedDate"),
                "editable": review_state in EDITABLE_REVIEW_STATES,
            }
        else:
            report["warnings"].append("No active iOS review submission was found for this app.")

        version_id = ((report.get("app_store_version") or {}).get("id"))
        if version_id:
            try:
                build_body = c.request(
                    "GET",
                    f"/v1/appStoreVersions/{version_id}/build",
                    params={"fields[builds]": "version,uploadedDate,processingState,expired"},
                )
                build = build_body.get("data") or {}
                if build:
                    report["app_store_version"]["build"] = {
                        "id": build.get("id"),
                        "version": (build.get("attributes") or {}).get("version"),
                        "uploaded_date": (build.get("attributes") or {}).get("uploadedDate"),
                        "processing_state": (build.get("attributes") or {}).get("processingState"),
                        "expired": (build.get("attributes") or {}).get("expired"),
                    }
                else:
                    report["app_store_version"]["build"] = None
            except Exception as build_exc:
                report["app_store_version"]["build_audit_error"] = f"{type(build_exc).__name__}: {str(build_exc)[:500]}"

        items: list[dict[str, Any]] = []
        linked: set[str] = set()
        if review_id:
            items, _ = review_items(c, review_id)
            linked = linked_subscription_version_ids(items)

        for pid, desired in PRODUCTS.items():
            audit: dict[str, Any] = {
                "product_id": pid,
                "expected_usa_price": str(desired),
                "subscription_id": None,
                "group_id": None,
                "subscription_state": None,
                "usa_pricing": None,
                "price_status": None,
                "subscription_version_id": None,
                "subscription_version_state": None,
                "version_localizations": None,
                "version_images": None,
                "linked_to_current_review": False,
            }
            report["products"][pid] = audit
            sub = subs.get(pid)
            if not sub:
                audit["error"] = "Product ID not found under this app's subscription groups"
                err(f"{pid}: product not found")
                continue

            sid = sub["id"]
            audit["subscription_id"] = sid
            audit["group_id"] = sub.get("_group_id")
            audit["subscription_state"] = (sub.get("attributes") or {}).get("state")

            try:
                audit["usa_pricing"] = usa_price(c, sid)
                ensure_usa_price(c, sid, desired, audit)
            except Exception as exc:
                audit["price_status"] = "ERROR"
                audit["pricing_error"] = f"{type(exc).__name__}: {str(exc)[:700]}"
                report["warnings"].append(f"{pid}: could not fully audit/update USA pricing")

            try:
                versions = subscription_versions(c, sid)
                version, created = choose_or_create_subscription_version(c, sid, versions)
                vid = version["id"]
                vstate = (version.get("attributes") or {}).get("state")
                audit["subscription_version_id"] = vid
                audit["subscription_version_state"] = vstate
                if created:
                    report["actions"].append(f"Created review version for {pid}")
                try:
                    loc_count, image_count = version_assets(c, vid)
                    audit["version_localizations"] = loc_count
                    audit["version_images"] = image_count
                except Exception as asset_exc:
                    audit["asset_audit_error"] = f"{type(asset_exc).__name__}: {str(asset_exc)[:500]}"

                if vid in linked:
                    audit["linked_to_current_review"] = True
                elif review_id and review_state in EDITABLE_REVIEW_STATES:
                    add_subscription_version_to_review(c, review_id, vid)
                    audit["linked_to_current_review"] = True
                    linked.add(vid)
                    report["actions"].append(f"Added {pid} subscription version to current Apple review submission")
                elif review_id:
                    audit["link_blocked_by_review_state"] = review_state
            except Exception as exc:
                audit["version_error"] = f"{type(exc).__name__}: {str(exc)[:700]}"
                report["warnings"].append(f"{pid}: could not finish subscription-version review linkage")
            finally:
                save()

        if review_id:
            final_items, _ = review_items(c, review_id)
            final_linked = linked_subscription_version_ids(final_items)
            report["review_submission"]["subscription_version_item_count"] = len(final_linked)
            for pid, audit in report["products"].items():
                vid = audit.get("subscription_version_id")
                if vid:
                    audit["linked_to_current_review"] = vid in final_linked

        save()
    except Exception as exc:
        err(f"Fatal: {type(exc).__name__}: {str(exc)[:1000]}")
        raise


if __name__ == "__main__":
    main()
