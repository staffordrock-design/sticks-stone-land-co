#!/usr/bin/env python3
from __future__ import annotations

import json
import os
import sys
import time
from pathlib import Path
from typing import Any

import jwt
import requests

API = "https://api.appstoreconnect.apple.com"
BUNDLE_ID = "com.ssrockholdings.quarrymarketplace"
TARGET_BUILD = "45"
TARGET_VERSION = "1.0"
PRODUCT_ID = "com.ssrockholdings.quarryintelligence.monthly199"
ISSUER_ID = os.getenv("ASC_ISSUER_ID", "7097918c-2758-4720-b0fa-938914c24b36")
KEY_IDS = [x.strip() for x in os.getenv("ASC_KEY_IDS", "").split(",") if x.strip()]
PRIVATE_KEY = os.getenv("ASC_PRIVATE_KEY", "")
REPORT_PATH = Path("reports/apple_finish_build45_review.json")

report: dict[str, Any] = {
    "bundle_id": BUNDLE_ID,
    "target_build": TARGET_BUILD,
    "target_version": TARGET_VERSION,
    "product_id": PRODUCT_ID,
    "actions": [],
    "errors": [],
    "final": {},
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
    def __init__(self, token: str):
        self.s = requests.Session()
        self.s.headers.update({
            "Authorization": f"Bearer {token}",
            "Accept": "application/json",
            "Content-Type": "application/json",
        })

    def request(self, method: str, path: str, *, params=None, payload=None, allow=(200, 201)) -> dict[str, Any]:
        url = path if path.startswith("http") else API + path
        for attempt in range(5):
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


def authenticate() -> ASC:
    if not PRIVATE_KEY or not KEY_IDS:
        raise RuntimeError("App Store Connect credentials are not configured")
    for key_id in KEY_IDS:
        try:
            c = ASC(make_token(key_id))
            apps = c.all("/v1/apps", params={"filter[bundleId]": BUNDLE_ID, "limit": 10})
            if apps:
                report["key_id_used"] = key_id
                report["app_id"] = apps[0]["id"]
                save()
                return c
        except Exception:
            continue
    raise RuntimeError("Unable to authenticate to App Store Connect")


def find_version(c: ASC, app_id: str) -> dict[str, Any]:
    rows = c.all(
        f"/v1/apps/{app_id}/appStoreVersions",
        params={"filter[platform]": "IOS", "filter[versionString]": TARGET_VERSION, "limit": 50},
    )
    if not rows:
        raise RuntimeError("App Store version 1.0 was not found")
    return rows[0]


def verify_build45_attached(c: ASC, version_id: str) -> dict[str, Any]:
    build = c.request(
        "GET",
        f"/v1/appStoreVersions/{version_id}/build",
        params={"fields[builds]": "version,uploadedDate,processingState,expired"},
    ).get("data") or {}
    attrs = build.get("attributes") or {}
    if attrs.get("version") != TARGET_BUILD or attrs.get("processingState") != "VALID" or attrs.get("expired"):
        raise RuntimeError(f"Build 45 is not the valid build attached to version 1.0; found {attrs.get('version')}")
    report["build"] = {
        "id": build.get("id"),
        "version": attrs.get("version"),
        "processing_state": attrs.get("processingState"),
        "uploaded_date": attrs.get("uploadedDate"),
    }
    save()
    return build


def find_ready_review(c: ASC, app_id: str) -> dict[str, Any]:
    reviews = c.all(
        f"/v1/apps/{app_id}/reviewSubmissions",
        params={"filter[platform]": "IOS", "limit": 200},
    )
    ready = [r for r in reviews if (r.get("attributes") or {}).get("state") == "READY_FOR_REVIEW"]
    if not ready:
        waiting = [r for r in reviews if (r.get("attributes") or {}).get("state") in {"WAITING_FOR_REVIEW", "IN_REVIEW"}]
        if waiting:
            report["final"]["review_state"] = (waiting[0].get("attributes") or {}).get("state")
            report["final"]["review_id"] = waiting[0].get("id")
            save()
            return waiting[0]
        raise RuntimeError("No READY_FOR_REVIEW Apple submission was found to finish")
    ready.sort(key=lambda r: r.get("id") or "", reverse=True)
    review = ready[0]
    report["review_id"] = review["id"]
    report["review_state_before"] = "READY_FOR_REVIEW"
    save()
    return review


def find_subscription_and_group(c: ASC, app_id: str) -> tuple[dict[str, Any], str]:
    groups = c.all(f"/v1/apps/{app_id}/subscriptionGroups", params={"limit": 200})
    for group in groups:
        gid = group["id"]
        links = c.all(f"/v1/subscriptionGroups/{gid}/relationships/subscriptions", params={"limit": 200})
        for link in links:
            sub = c.request("GET", f"/v1/subscriptions/{link['id']}").get("data") or {}
            if (sub.get("attributes") or {}).get("productId") == PRODUCT_ID:
                report["subscription_id"] = sub["id"]
                report["subscription_group_id"] = gid
                save()
                return sub, gid
    raise RuntimeError("The $199 subscription could not be found")


def find_subscription_version(c: ASC, subscription_id: str) -> dict[str, Any]:
    versions = c.all(f"/v1/subscriptions/{subscription_id}/versions", params={"limit": 200})
    allowed = {"PREPARE_FOR_SUBMISSION", "READY_FOR_REVIEW", "DEVELOPER_REJECTED", "WAITING_FOR_REVIEW", "IN_REVIEW"}
    candidates = [v for v in versions if (v.get("attributes") or {}).get("state") in allowed]
    if not candidates:
        raise RuntimeError("No reviewable $199 subscription version was found")
    priority = {"READY_FOR_REVIEW": 5, "PREPARE_FOR_SUBMISSION": 4, "DEVELOPER_REJECTED": 3, "WAITING_FOR_REVIEW": 2, "IN_REVIEW": 1}
    candidates.sort(key=lambda v: (priority.get((v.get("attributes") or {}).get("state"), 0), v.get("id") or ""), reverse=True)
    return candidates[0]


def find_group_version(c: ASC, group_id: str) -> dict[str, Any]:
    body = c.request(
        "GET",
        f"/v1/subscriptionGroups/{group_id}",
        params={
            "include": "versions",
            "fields[subscriptionGroupVersions]": "version,state,subscriptionGroup",
            "limit[versions]": 50,
        },
    )
    versions = [x for x in body.get("included", []) if x.get("type") == "subscriptionGroupVersions"]
    allowed = {"PREPARE_FOR_SUBMISSION", "READY_FOR_REVIEW", "DEVELOPER_REJECTED", "WAITING_FOR_REVIEW", "IN_REVIEW"}
    candidates = [v for v in versions if (v.get("attributes") or {}).get("state") in allowed]
    if not candidates:
        states = [(v.get("id"), (v.get("attributes") or {}).get("state")) for v in versions]
        raise RuntimeError(f"No reviewable subscription group version found. Versions: {states}")
    priority = {"READY_FOR_REVIEW": 5, "PREPARE_FOR_SUBMISSION": 4, "DEVELOPER_REJECTED": 3, "WAITING_FOR_REVIEW": 2, "IN_REVIEW": 1}
    candidates.sort(key=lambda v: (priority.get((v.get("attributes") or {}).get("state"), 0), v.get("id") or ""), reverse=True)
    chosen = candidates[0]
    report["subscription_group_version_id"] = chosen["id"]
    report["subscription_group_version_state"] = (chosen.get("attributes") or {}).get("state")
    save()
    return chosen


def current_items(c: ASC, review_id: str) -> tuple[set[str], set[str], set[str]]:
    body = c.request(
        "GET",
        f"/v1/reviewSubmissions/{review_id}/items",
        params={"include": "appStoreVersion,subscriptionVersion,subscriptionGroupVersion", "limit": 200},
    )
    app_versions: set[str] = set()
    sub_versions: set[str] = set()
    group_versions: set[str] = set()
    for item in body.get("data", []):
        rel = item.get("relationships") or {}
        av = ((rel.get("appStoreVersion") or {}).get("data") or {}).get("id")
        sv = ((rel.get("subscriptionVersion") or {}).get("data") or {}).get("id")
        gv = ((rel.get("subscriptionGroupVersion") or {}).get("data") or {}).get("id")
        if av:
            app_versions.add(av)
        if sv:
            sub_versions.add(sv)
        if gv:
            group_versions.add(gv)
    return app_versions, sub_versions, group_versions


def add_item(c: ASC, review_id: str, relationship: str, resource_type: str, resource_id: str) -> None:
    payload = {
        "data": {
            "type": "reviewSubmissionItems",
            "relationships": {
                "reviewSubmission": {"data": {"type": "reviewSubmissions", "id": review_id}},
                relationship: {"data": {"type": resource_type, "id": resource_id}},
            },
        }
    }
    c.request("POST", "/v1/reviewSubmissionItems", payload=payload)
    report["actions"].append(f"Added {relationship} {resource_id} to review")
    save()


def submit(c: ASC, review_id: str) -> None:
    payload = {
        "data": {
            "type": "reviewSubmissions",
            "id": review_id,
            "attributes": {"submitted": True},
        }
    }
    c.request("PATCH", f"/v1/reviewSubmissions/{review_id}", payload=payload)
    report["actions"].append("Submitted build 45 + app version + $199 subscription + subscription group version")
    save()


def verify(c: ASC, review_id: str, version_id: str, sub_version_id: str, group_version_id: str) -> None:
    review = c.request("GET", f"/v1/reviewSubmissions/{review_id}").get("data") or {}
    state = (review.get("attributes") or {}).get("state")
    apps, subs, groups = current_items(c, review_id)
    build = verify_build45_attached(c, version_id)
    report["final"] = {
        "review_id": review_id,
        "review_state": state,
        "build_number": (build.get("attributes") or {}).get("version"),
        "app_version_linked": version_id in apps,
        "subscription_version_linked": sub_version_id in subs,
        "subscription_group_version_linked": group_version_id in groups,
    }
    save()
    if state not in {"WAITING_FOR_REVIEW", "IN_REVIEW"}:
        raise RuntimeError(f"Review did not enter the queue; state is {state}")
    if not all([version_id in apps, sub_version_id in subs, group_version_id in groups]):
        raise RuntimeError("Final review item verification failed")


def main() -> None:
    save()
    try:
        c = authenticate()
        app_id = str(report["app_id"])
        version = find_version(c, app_id)
        version_id = version["id"]
        report["app_store_version_id"] = version_id
        verify_build45_attached(c, version_id)

        review = find_ready_review(c, app_id)
        review_id = review["id"]
        current_state = (review.get("attributes") or {}).get("state")
        if current_state in {"WAITING_FOR_REVIEW", "IN_REVIEW"}:
            report["actions"].append("Review is already submitted; no recovery action needed")
            save()
            return

        subscription, group_id = find_subscription_and_group(c, app_id)
        sub_version = find_subscription_version(c, subscription["id"])
        group_version = find_group_version(c, group_id)
        sub_version_id = sub_version["id"]
        group_version_id = group_version["id"]
        report["subscription_version_id"] = sub_version_id
        save()

        apps, subs, groups = current_items(c, review_id)
        if version_id not in apps:
            add_item(c, review_id, "appStoreVersion", "appStoreVersions", version_id)
        if sub_version_id not in subs:
            add_item(c, review_id, "subscriptionVersion", "subscriptionVersions", sub_version_id)
        if group_version_id not in groups:
            add_item(c, review_id, "subscriptionGroupVersion", "subscriptionGroupVersions", group_version_id)

        submit(c, review_id)
        time.sleep(3)
        verify(c, review_id, version_id, sub_version_id, group_version_id)
        print("SUCCESS: Build 45 review submission is complete and waiting for Apple review.")
    except Exception as exc:
        report["errors"].append(f"{type(exc).__name__}: {str(exc)[:1800]}")
        save()
        print(report["errors"][-1], file=sys.stderr)
        raise


if __name__ == "__main__":
    main()
