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
BUNDLE_ID = "com.ssrockholdings.quarrymarketplace"
TARGET_VERSION = "1.0"
TARGET_BUILD = "45"
PRODUCT_ID = "com.ssrockholdings.quarryintelligence.monthly199"
ISSUER_ID = os.getenv("ASC_ISSUER_ID", "7097918c-2758-4720-b0fa-938914c24b36")
KEY_IDS = [x.strip() for x in os.getenv("ASC_KEY_IDS", "").split(",") if x.strip()]
PRIVATE_KEY = os.getenv("ASC_PRIVATE_KEY", "")
REPORT_PATH = Path("reports/apple_swap_build45.json")

ACTIVE_REVIEW_STATES = {
    "READY_FOR_REVIEW",
    "WAITING_FOR_REVIEW",
    "IN_REVIEW",
    "UNRESOLVED_ISSUES",
    "CANCELING",
    "COMPLETING",
}
LOCKED_VERSION_STATES = {"WAITING_FOR_REVIEW", "IN_REVIEW"}

report: dict[str, Any] = {
    "generated_at": dt.datetime.now(dt.timezone.utc).isoformat(),
    "bundle_id": BUNDLE_ID,
    "target_version": TARGET_VERSION,
    "target_build": TARGET_BUILD,
    "product_id": PRODUCT_ID,
    "authenticated": False,
    "actions": [],
    "errors": [],
    "final": {},
}


def save() -> None:
    REPORT_PATH.parent.mkdir(parents=True, exist_ok=True)
    REPORT_PATH.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def token(key_id: str) -> str:
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
        self.s.headers.update({
            "Authorization": f"Bearer {bearer}",
            "Accept": "application/json",
            "Content-Type": "application/json",
        })

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


def authenticate() -> ASC:
    if not PRIVATE_KEY or not KEY_IDS:
        raise RuntimeError("App Store Connect credentials are not configured")
    last = None
    for key_id in KEY_IDS:
        try:
            c = ASC(token(key_id))
            apps = c.all("/v1/apps", params={"filter[bundleId]": BUNDLE_ID, "limit": 10})
            if apps:
                report["authenticated"] = True
                report["key_id_used"] = key_id
                report["app_id"] = apps[0]["id"]
                save()
                return c
        except Exception as exc:
            last = exc
    raise RuntimeError(f"Unable to authenticate: {type(last).__name__ if last else 'unknown'}")


def app_version(c: ASC, app_id: str) -> dict[str, Any]:
    versions = c.all(
        f"/v1/apps/{app_id}/appStoreVersions",
        params={"filter[platform]": "IOS", "filter[versionString]": TARGET_VERSION, "limit": 50},
    )
    if not versions:
        raise RuntimeError(f"App Store version {TARGET_VERSION} not found")
    versions.sort(key=lambda x: ((x.get("attributes") or {}).get("createdDate") or "", x.get("id") or ""), reverse=True)
    return versions[0]


def build45(c: ASC, app_id: str) -> dict[str, Any]:
    builds = c.all(
        "/v1/builds",
        params={
            "filter[app]": app_id,
            "filter[version]": TARGET_BUILD,
            "fields[builds]": "version,uploadedDate,processingState,expired",
            "limit": 50,
        },
    )
    valid = [b for b in builds if (b.get("attributes") or {}).get("processingState") == "VALID" and not (b.get("attributes") or {}).get("expired")]
    if not valid:
        raise RuntimeError("Build 45 is not VALID in App Store Connect")
    valid.sort(key=lambda x: (x.get("attributes") or {}).get("uploadedDate") or "", reverse=True)
    return valid[0]


def active_reviews(c: ASC, app_id: str) -> list[dict[str, Any]]:
    reviews = c.all(
        f"/v1/apps/{app_id}/reviewSubmissions",
        params={"filter[platform]": "IOS", "limit": 200},
    )
    return [r for r in reviews if (r.get("attributes") or {}).get("state") in ACTIVE_REVIEW_STATES]


def cancel_review(c: ASC, review: dict[str, Any]) -> None:
    rid = review["id"]
    state = (review.get("attributes") or {}).get("state")
    if state == "CANCELING":
        return
    payload = {
        "data": {
            "type": "reviewSubmissions",
            "id": rid,
            "attributes": {"canceled": True},
        }
    }
    c.request("PATCH", f"/v1/reviewSubmissions/{rid}", payload=payload)
    report["actions"].append(f"Canceled review submission {rid} that was {state}")
    save()


def wait_review_canceled(c: ASC, review_id: str, timeout=240) -> None:
    deadline = time.time() + timeout
    while time.time() < deadline:
        body = c.request("GET", f"/v1/reviewSubmissions/{review_id}")
        state = (body.get("data", {}).get("attributes") or {}).get("state")
        if state not in ACTIVE_REVIEW_STATES:
            report["actions"].append(f"Prior review submission reached {state}")
            save()
            return
        time.sleep(5)
    raise RuntimeError("Timed out waiting for the previous Apple review submission to cancel")


def wait_version_editable(c: ASC, version_id: str, timeout=240) -> None:
    deadline = time.time() + timeout
    while time.time() < deadline:
        body = c.request("GET", f"/v1/appStoreVersions/{version_id}")
        state = (body.get("data", {}).get("attributes") or {}).get("appVersionState")
        if state not in LOCKED_VERSION_STATES:
            report["actions"].append(f"Version {TARGET_VERSION} became editable in state {state}")
            save()
            return
        time.sleep(5)
    raise RuntimeError("Timed out waiting for App Store version 1.0 to become editable")


def attach_build(c: ASC, version_id: str, build_id: str) -> None:
    payload = {"data": {"type": "builds", "id": build_id}}
    c.request(
        "PATCH",
        f"/v1/appStoreVersions/{version_id}/relationships/build",
        payload=payload,
        allow=(204,),
    )
    report["actions"].append(f"Attached build {TARGET_BUILD} to App Store version {TARGET_VERSION}")
    save()


def subscription_version(c: ASC, app_id: str) -> dict[str, Any]:
    groups = c.all(f"/v1/apps/{app_id}/subscriptionGroups", params={"limit": 200})
    for g in groups:
        gid = g["id"]
        links = c.all(f"/v1/subscriptionGroups/{gid}/relationships/subscriptions", params={"limit": 200})
        for link in links:
            sub = c.request("GET", f"/v1/subscriptions/{link['id']}").get("data") or {}
            if (sub.get("attributes") or {}).get("productId") != PRODUCT_ID:
                continue
            versions = c.all(f"/v1/subscriptions/{sub['id']}/versions", params={"limit": 200})
            if not versions:
                raise RuntimeError("$199 subscription exists but has no reviewable subscription version")
            priority = {
                "PREPARE_FOR_SUBMISSION": 6,
                "READY_FOR_REVIEW": 5,
                "DEVELOPER_ACTION_NEEDED": 4,
                "WAITING_FOR_REVIEW": 3,
                "IN_REVIEW": 2,
                "REJECTED": 1,
            }
            versions.sort(key=lambda v: (priority.get((v.get("attributes") or {}).get("state"), 0), v.get("id") or ""), reverse=True)
            report["subscription_id"] = sub["id"]
            report["subscription_version_id"] = versions[0]["id"]
            save()
            return versions[0]
    raise RuntimeError(f"Subscription {PRODUCT_ID} not found")


def create_review(c: ASC, app_id: str) -> dict[str, Any]:
    payload = {
        "data": {
            "type": "reviewSubmissions",
            "attributes": {"platform": "IOS"},
            "relationships": {"app": {"data": {"type": "apps", "id": app_id}}},
        }
    }
    review = c.request("POST", "/v1/reviewSubmissions", payload=payload)["data"]
    report["actions"].append(f"Created new review submission {review['id']}")
    save()
    return review


def add_review_item(c: ASC, review_id: str, relationship_name: str, resource_type: str, resource_id: str) -> None:
    payload = {
        "data": {
            "type": "reviewSubmissionItems",
            "relationships": {
                "reviewSubmission": {"data": {"type": "reviewSubmissions", "id": review_id}},
                relationship_name: {"data": {"type": resource_type, "id": resource_id}},
            },
        }
    }
    c.request("POST", "/v1/reviewSubmissionItems", payload=payload)
    report["actions"].append(f"Added {relationship_name} to new review submission")
    save()


def submit_review(c: ASC, review_id: str) -> None:
    payload = {
        "data": {
            "type": "reviewSubmissions",
            "id": review_id,
            "attributes": {"submitted": True},
        }
    }
    c.request("PATCH", f"/v1/reviewSubmissions/{review_id}", payload=payload)
    report["actions"].append("Submitted app version 1.0 + build 45 + $199 subscription to Apple review")
    save()


def verify(c: ASC, version_id: str, review_id: str, build_id: str, subscription_version_id: str) -> None:
    version = c.request("GET", f"/v1/appStoreVersions/{version_id}").get("data") or {}
    attached = c.request(
        "GET",
        f"/v1/appStoreVersions/{version_id}/build",
        params={"fields[builds]": "version,uploadedDate,processingState,expired"},
    ).get("data") or {}
    review = c.request("GET", f"/v1/reviewSubmissions/{review_id}").get("data") or {}
    items = c.request(
        "GET",
        f"/v1/reviewSubmissions/{review_id}/items",
        params={"include": "appStoreVersion,subscriptionVersion", "limit": 200},
    )
    relationships = []
    for item in items.get("data", []):
        rel = item.get("relationships") or {}
        if ((rel.get("appStoreVersion") or {}).get("data") or {}).get("id") == version_id:
            relationships.append("appStoreVersion")
        if ((rel.get("subscriptionVersion") or {}).get("data") or {}).get("id") == subscription_version_id:
            relationships.append("subscriptionVersion")

    final = {
        "app_version_state": (version.get("attributes") or {}).get("appVersionState"),
        "review_state": (review.get("attributes") or {}).get("state"),
        "attached_build_id": attached.get("id"),
        "attached_build_number": (attached.get("attributes") or {}).get("version"),
        "attached_build_processing_state": (attached.get("attributes") or {}).get("processingState"),
        "app_version_item_linked": "appStoreVersion" in relationships,
        "subscription_version_item_linked": "subscriptionVersion" in relationships,
    }
    report["final"] = final
    save()

    if attached.get("id") != build_id or final["attached_build_number"] != TARGET_BUILD:
        raise RuntimeError("Final verification failed: build 45 is not attached")
    if not final["app_version_item_linked"] or not final["subscription_version_item_linked"]:
        raise RuntimeError("Final verification failed: app version or subscription is missing from review")
    if final["review_state"] not in {"WAITING_FOR_REVIEW", "IN_REVIEW"}:
        raise RuntimeError(f"Final verification failed: review state is {final['review_state']}")


def main() -> None:
    save()
    try:
        c = authenticate()
        app_id = str(report["app_id"])
        version = app_version(c, app_id)
        version_id = version["id"]
        target_build = build45(c, app_id)
        build_id = target_build["id"]
        report["app_store_version_id"] = version_id
        report["target_build_id"] = build_id
        save()

        current_build = c.request("GET", f"/v1/appStoreVersions/{version_id}/build").get("data") or {}
        report["previous_build"] = {
            "id": current_build.get("id"),
            "version": (current_build.get("attributes") or {}).get("version"),
        }
        save()

        reviews = active_reviews(c, app_id)
        for review in reviews:
            cancel_review(c, review)
        for review in reviews:
            wait_review_canceled(c, review["id"])

        wait_version_editable(c, version_id)
        attach_build(c, version_id, build_id)

        sub_version = subscription_version(c, app_id)
        sub_version_id = sub_version["id"]

        # Guard against an unexpectedly remaining live submission.
        leftovers = active_reviews(c, app_id)
        if leftovers:
            raise RuntimeError("An active review submission still exists after cancellation")

        new_review = create_review(c, app_id)
        new_review_id = new_review["id"]
        report["new_review_submission_id"] = new_review_id
        save()

        add_review_item(c, new_review_id, "appStoreVersion", "appStoreVersions", version_id)
        add_review_item(c, new_review_id, "subscriptionVersion", "subscriptionVersions", sub_version_id)
        submit_review(c, new_review_id)
        time.sleep(3)
        verify(c, version_id, new_review_id, build_id, sub_version_id)
        print("SUCCESS: Apple review now targets build 45 with the $199 subscription.")
    except Exception as exc:
        report["errors"].append(f"{type(exc).__name__}: {str(exc)[:1600]}")
        save()
        print(report["errors"][-1], file=sys.stderr)
        raise


if __name__ == "__main__":
    main()
