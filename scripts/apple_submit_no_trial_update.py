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
TARGET_BUILD = os.getenv("ASC_TARGET_BUILD", "")
ISSUER_ID = os.getenv("ASC_ISSUER_ID", "7097918c-2758-4720-b0fa-938914c24b36")
KEY_IDS = [x.strip() for x in os.getenv("ASC_KEY_IDS", "").split(",") if x.strip()]
PRIVATE_KEY = os.getenv("ASC_PRIVATE_KEY", "")
REPORT_PATH = Path(os.getenv("ASC_SUBMIT_REPORT_PATH", "reports/apple_submit_no_trial_update.json"))
PRODUCT_ID = "com.ssrockholdings.mobile.quarryintelligence.monthly199"
ACTIVE_REVIEW_STATES = {"READY_FOR_REVIEW", "WAITING_FOR_REVIEW", "IN_REVIEW", "UNRESOLVED_ISSUES", "CANCELING", "COMPLETING"}
REVIEWABLE_VERSION_STATES = {"PREPARE_FOR_SUBMISSION", "READY_FOR_REVIEW", "DEVELOPER_REJECTED", "DEVELOPER_ACTION_NEEDED", "WAITING_FOR_REVIEW", "IN_REVIEW", "REJECTED"}

report: dict[str, Any] = {
    "generated_at": dt.datetime.now(dt.timezone.utc).isoformat(),
    "bundle_id": BUNDLE_ID,
    "target_version": TARGET_VERSION,
    "target_build": TARGET_BUILD,
    "authenticated": False,
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


def find_build(c: ASC, app_id: str, timeout: int = 900) -> dict[str, Any]:
    if not TARGET_BUILD.isdigit():
        raise RuntimeError(f"Invalid target build number: {TARGET_BUILD!r}")
    deadline = time.time() + timeout
    last_states = []
    while time.time() < deadline:
        rows = c.all(
            "/v1/builds",
            params={
                "filter[app]": app_id,
                "filter[version]": TARGET_BUILD,
                "fields[builds]": "version,uploadedDate,processingState,expired",
                "limit": 50,
            },
        )
        valid = [r for r in rows if (r.get("attributes") or {}).get("processingState") == "VALID" and not (r.get("attributes") or {}).get("expired")]
        if valid:
            valid.sort(key=lambda r: (r.get("attributes") or {}).get("uploadedDate") or "", reverse=True)
            return valid[0]
        last_states = [(str((r.get("attributes") or {}).get("processingState") or ""), bool((r.get("attributes") or {}).get("expired"))) for r in rows]
        report["actions"].append(f"Waiting for build {TARGET_BUILD}: {last_states or 'not visible yet'}")
        save()
        time.sleep(10)
    raise RuntimeError(f"Build {TARGET_BUILD} did not become VALID. Last states: {last_states}")


def attach_build(c: ASC, version_id: str, build_id: str) -> None:
    c.request(
        "PATCH",
        f"/v1/appStoreVersions/{version_id}/relationships/build",
        payload={"data": {"type": "builds", "id": build_id}},
        allow=(204,),
    )
    report["actions"].append(f"Attached build {TARGET_BUILD} to version {TARGET_VERSION}")
    save()


def active_reviews(c: ASC, app_id: str) -> list[dict[str, Any]]:
    rows = c.all(f"/v1/apps/{app_id}/reviewSubmissions", params={"filter[platform]": "IOS", "limit": 200})
    return [r for r in rows if (r.get("attributes") or {}).get("state") in ACTIVE_REVIEW_STATES]


def audit_review_items(c: ASC, review_id: str) -> list[dict[str, Any]]:
    body = c.request(
        "GET",
        f"/v1/reviewSubmissions/{review_id}/items",
        params={"include": "appStoreVersion,subscriptionVersion,subscriptionGroupVersion", "limit": 200},
    )
    out = []
    for item in body.get("data", []):
        rels = item.get("relationships") or {}
        row = {"item_id": item.get("id"), "item_state": (item.get("attributes") or {}).get("state")}
        for rel_name in ("appStoreVersion", "subscriptionVersion", "subscriptionGroupVersion"):
            rid = (((rels.get(rel_name) or {}).get("data") or {}).get("id"))
            if rid:
                row.update({"resource_type": rel_name, "resource_id": rid})
                break
        out.append(row)
    return out


def find_subscription_version_and_group(c: ASC, app_id: str) -> tuple[dict[str, Any], str]:
    groups = c.all(f"/v1/apps/{app_id}/subscriptionGroups", params={"limit": 200})
    for group in groups:
        gid = str(group["id"])
        links = c.all(f"/v1/subscriptionGroups/{gid}/relationships/subscriptions", params={"limit": 200})
        for link in links:
            sub = c.request("GET", f"/v1/subscriptions/{link['id']}").get("data") or {}
            if (sub.get("attributes") or {}).get("productId") != PRODUCT_ID:
                continue
            versions = c.all(f"/v1/subscriptions/{sub['id']}/versions", params={"limit": 200})
            candidates = [v for v in versions if (v.get("attributes") or {}).get("state") in REVIEWABLE_VERSION_STATES]
            if not candidates:
                raise RuntimeError("The $199 subscription has no reviewable subscription version")
            priority = {"READY_FOR_REVIEW": 8, "PREPARE_FOR_SUBMISSION": 7, "DEVELOPER_REJECTED": 6, "DEVELOPER_ACTION_NEEDED": 5, "REJECTED": 4, "WAITING_FOR_REVIEW": 3, "IN_REVIEW": 2}
            candidates.sort(key=lambda v: (priority.get((v.get("attributes") or {}).get("state"), 0), v.get("id") or ""), reverse=True)
            chosen = candidates[0]
            report["subscription_id"] = sub["id"]
            report["subscription_version_id"] = chosen["id"]
            report["subscription_version_state"] = (chosen.get("attributes") or {}).get("state")
            report["subscription_group_id"] = gid
            save()
            return chosen, gid
    raise RuntimeError(f"Subscription {PRODUCT_ID} was not found under S&S Rock Holdings")


def find_group_version(c: ASC, group_id: str) -> dict[str, Any]:
    body = c.request(
        "GET",
        f"/v1/subscriptionGroups/{group_id}",
        params={"include": "versions", "fields[subscriptionGroupVersions]": "version,state,subscriptionGroup", "limit[versions]": 50},
    )
    versions = [x for x in body.get("included", []) if x.get("type") == "subscriptionGroupVersions"]
    candidates = [v for v in versions if (v.get("attributes") or {}).get("state") in REVIEWABLE_VERSION_STATES]
    if not candidates:
        states = [(v.get("id"), (v.get("attributes") or {}).get("state")) for v in versions]
        raise RuntimeError(f"No reviewable subscription group version exists. States: {states}")
    priority = {"READY_FOR_REVIEW": 8, "PREPARE_FOR_SUBMISSION": 7, "DEVELOPER_REJECTED": 6, "DEVELOPER_ACTION_NEEDED": 5, "REJECTED": 4, "WAITING_FOR_REVIEW": 3, "IN_REVIEW": 2}
    candidates.sort(key=lambda v: (priority.get((v.get("attributes") or {}).get("state"), 0), v.get("id") or ""), reverse=True)
    chosen = candidates[0]
    report["subscription_group_version_id"] = chosen["id"]
    report["subscription_group_version_state"] = (chosen.get("attributes") or {}).get("state")
    save()
    return chosen


def add_item(c: ASC, review_id: str, rel: str, resource_type: str, resource_id: str) -> None:
    existing = {(x.get("resource_type"), x.get("resource_id")) for x in audit_review_items(c, review_id)}
    if (rel, resource_id) in existing:
        return
    c.request(
        "POST",
        "/v1/reviewSubmissionItems",
        payload={
            "data": {
                "type": "reviewSubmissionItems",
                "relationships": {
                    "reviewSubmission": {"data": {"type": "reviewSubmissions", "id": review_id}},
                    rel: {"data": {"type": resource_type, "id": resource_id}},
                },
            }
        },
    )
    report["actions"].append(f"Added {rel} {resource_id} to review {review_id}")
    save()


def create_review(c: ASC, app_id: str) -> str:
    review = c.request(
        "POST",
        "/v1/reviewSubmissions",
        payload={
            "data": {
                "type": "reviewSubmissions",
                "attributes": {"platform": "IOS"},
                "relationships": {"app": {"data": {"type": "apps", "id": app_id}}},
            }
        },
    )["data"]
    review_id = str(review["id"])
    report["actions"].append(f"Created review {review_id}")
    save()
    return review_id


def submit_review(c: ASC, review_id: str) -> None:
    c.request(
        "PATCH",
        f"/v1/reviewSubmissions/{review_id}",
        payload={"data": {"type": "reviewSubmissions", "id": review_id, "attributes": {"submitted": True}}},
    )
    report["actions"].append(f"Submitted version {TARGET_VERSION} build {TARGET_BUILD} + $199 subscription for App Review")
    save()


def main() -> None:
    save()
    try:
        c, app_id = authenticate()
        version = find_version(c, app_id)
        version_id = str(version["id"])
        state = (version.get("attributes") or {}).get("appVersionState") or (version.get("attributes") or {}).get("appStoreState")
        report["version_id"] = version_id
        report["version_state_before"] = state
        if state not in {"PREPARE_FOR_SUBMISSION", "READY_FOR_REVIEW", "DEVELOPER_REJECTED", "REJECTED"}:
            raise RuntimeError(f"Version {TARGET_VERSION} is not editable for a new submission; state={state}")

        build = find_build(c, app_id)
        build_id = str(build["id"])
        report["build_id"] = build_id
        attach_build(c, version_id, build_id)

        sub_version, group_id = find_subscription_version_and_group(c, app_id)
        group_version = find_group_version(c, group_id)
        sub_version_id = str(sub_version["id"])
        group_version_id = str(group_version["id"])

        reviews = active_reviews(c, app_id)
        review_id = ""
        # A failed prior attempt can leave an unsubmitted READY_FOR_REVIEW shell.
        # Reuse it when possible instead of creating duplicate review submissions.
        for row in reviews:
            rid = str(row.get("id") or "")
            items = audit_review_items(c, rid) if rid else []
            if any(x.get("resource_type") == "appStoreVersion" and x.get("resource_id") == version_id for x in items):
                review_id = rid
                report["actions"].append(f"Reusing existing review {rid} for version {TARGET_VERSION}")
                save()
                break

        if not review_id:
            if reviews:
                states = [(r.get("id"), (r.get("attributes") or {}).get("state")) for r in reviews]
                raise RuntimeError(f"An unrelated active iOS review exists; refusing to disturb it: {states}")
            review_id = create_review(c, app_id)

        review_before = c.request("GET", f"/v1/reviewSubmissions/{review_id}").get("data") or {}
        review_state_before = (review_before.get("attributes") or {}).get("state")
        if review_state_before == "READY_FOR_REVIEW":
            add_item(c, review_id, "appStoreVersion", "appStoreVersions", version_id)
            add_item(c, review_id, "subscriptionVersion", "subscriptionVersions", sub_version_id)
            add_item(c, review_id, "subscriptionGroupVersion", "subscriptionGroupVersions", group_version_id)
            submit_review(c, review_id)
        elif review_state_before not in {"WAITING_FOR_REVIEW", "IN_REVIEW"}:
            raise RuntimeError(f"Review {review_id} is not submit-ready; state={review_state_before}")

        time.sleep(3)
        review = c.request("GET", f"/v1/reviewSubmissions/{review_id}").get("data") or {}
        review_state = (review.get("attributes") or {}).get("state")
        attached = c.request("GET", f"/v1/appStoreVersions/{version_id}/build", params={"fields[builds]": "version,processingState,expired"}).get("data") or {}
        items = audit_review_items(c, review_id)
        resource_pairs = {(x.get("resource_type"), x.get("resource_id")) for x in items}
        report["final"] = {
            "review_id": review_id,
            "review_state": review_state,
            "attached_build": (attached.get("attributes") or {}).get("version"),
            "attached_build_state": (attached.get("attributes") or {}).get("processingState"),
            "app_version_linked": ("appStoreVersion", version_id) in resource_pairs,
            "subscription_version_linked": ("subscriptionVersion", sub_version_id) in resource_pairs,
            "subscription_group_version_linked": ("subscriptionGroupVersion", group_version_id) in resource_pairs,
            "review_items": items,
        }
        save()
        if report["final"]["attached_build"] != TARGET_BUILD or report["final"]["attached_build_state"] != "VALID":
            raise RuntimeError("Final verification failed: expected VALID target build is not attached")
        if not all([report["final"]["app_version_linked"], report["final"]["subscription_version_linked"], report["final"]["subscription_group_version_linked"]]):
            raise RuntimeError("Final verification failed: app/subscription/group review linkage is incomplete")
        if review_state not in {"WAITING_FOR_REVIEW", "IN_REVIEW"}:
            raise RuntimeError(f"Final verification failed: review state is {review_state}")
        print(f"SUCCESS: version {TARGET_VERSION} build {TARGET_BUILD} submitted for App Review with the $199 subscription.")
    except Exception as exc:
        report["errors"].append(f"{type(exc).__name__}: {str(exc)[:1800]}")
        save()
        print(report["errors"][-1], file=sys.stderr)
        raise


if __name__ == "__main__":
    main()
