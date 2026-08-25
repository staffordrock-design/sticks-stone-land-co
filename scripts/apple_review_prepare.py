#!/usr/bin/env python3
"""Prepare S&S Rock Holdings build 20 for App Review, with hard safety gates.

Mutations this script may make:
- set build 20 export-compliance answer to usesNonExemptEncryption=false;
- associate build 20 with App Store version 2.130297.1;
- update App Store Review notes from docs/app-store-review-notes.md;
- resolve rejected items in the existing UNRESOLVED_ISSUES submission after
  the corrected build/metadata are in place;
- add the app version / four subscription versions to an editable submission;
- submit ONLY when the exact expected physical-device video is already attached
  to App Store Review and its upload is complete.

It never cancels or removes a submission or review item.
A sanitized report is written to reports/apple_review_prepare.json.
"""
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
VERSION_STRING = "1.0"
BUILD_NUMBER = "20"
EXPECTED_ATTACHMENT = os.getenv(
    "ASC_EXPECTED_REVIEW_ATTACHMENT",
    "ScreenRecording_08-23-2026 16-33-50_1.mp4",
)
ISSUER_ID = os.getenv("ASC_ISSUER_ID", "7097918c-2758-4720-b0fa-938914c24b36")
KEY_IDS = [x.strip() for x in os.getenv("ASC_KEY_IDS", "").split(",") if x.strip()]
PRIVATE_KEY = os.getenv("ASC_PRIVATE_KEY", "")
NOTES_PATH = Path(os.getenv("ASC_REVIEW_NOTES_PATH", "docs/app-store-review-notes.md"))
REPORT_PATH = Path(os.getenv("ASC_REVIEW_PREP_REPORT_PATH", "reports/apple_review_prepare.json"))
ALLOW_FINAL_SUBMIT = os.getenv("ASC_ALLOW_FINAL_SUBMIT", "1") == "1"

PRODUCT_IDS = {
    "com.ssrockholdings.marketplace.monthly",
    "com.ssrockholdings.marketplace.annual",
    "com.ssrockholdings.professional.monthly",
    "com.ssrockholdings.professional.annual",
}
ACTIVE_REVIEW_STATES = {
    "READY_FOR_REVIEW",
    "WAITING_FOR_REVIEW",
    "IN_REVIEW",
    "UNRESOLVED_ISSUES",
    "CANCELING",
    "COMPLETING",
}

report: dict[str, Any] = {
    "generated_at": dt.datetime.now(dt.timezone.utc).isoformat(),
    "bundle_id": BUNDLE_ID,
    "version": VERSION_STRING,
    "build": BUILD_NUMBER,
    "authenticated": False,
    "key_id_used": None,
    "app_id": None,
    "app_store_version": None,
    "build_record": None,
    "review_detail": None,
    "review_submission": None,
    "subscriptions": {},
    "attachment_gate": {
        "expected_filename": EXPECTED_ATTACHMENT,
        "found": False,
        "upload_complete": False,
    },
    "actions": [],
    "warnings": [],
    "errors": [],
    "final_status": None,
}


def save() -> None:
    REPORT_PATH.parent.mkdir(parents=True, exist_ok=True)
    REPORT_PATH.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def fatal(message: str) -> None:
    report["errors"].append(message)
    report["final_status"] = "BLOCKED"
    save()
    print(f"ERROR: {message}", file=sys.stderr)
    raise SystemExit(1)


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

    def request(self, method: str, path_or_url: str, *, params=None, payload=None, allow=(200, 201, 204)) -> dict[str, Any]:
        url = path_or_url if path_or_url.startswith("http") else API + path_or_url
        for attempt in range(5):
            r = self.s.request(method, url, params=params, json=payload, timeout=60)
            if r.status_code in allow:
                return r.json() if r.content else {}
            if r.status_code == 429 or r.status_code >= 500:
                time.sleep(min(2 ** attempt, 16))
                continue
            detail = r.text[:1800]
            raise RuntimeError(f"{method} {url} -> {r.status_code}: {detail}")
        raise RuntimeError(f"{method} {url} failed after retries")

    def all(self, path: str, *, params=None) -> list[dict[str, Any]]:
        out: list[dict[str, Any]] = []
        url: str | None = path
        first = True
        while url:
            body = self.request("GET", url, params=params if first else None, allow=(200,))
            first = False
            out.extend(body.get("data", []))
            url = (body.get("links") or {}).get("next")
        return out


def authenticate() -> ASC:
    if not PRIVATE_KEY:
        fatal("GitHub secret ASC_PRIVATE_KEY is missing")
    if not KEY_IDS:
        fatal("No App Store Connect key IDs are configured")
    for kid in KEY_IDS:
        try:
            c = ASC(token(kid))
            apps = c.all("/v1/apps", params={"filter[bundleId]": BUNDLE_ID, "limit": 10})
            if apps:
                report["authenticated"] = True
                report["key_id_used"] = kid
                report["app_id"] = apps[0]["id"]
                save()
                return c
        except Exception as exc:
            report["warnings"].append(f"App Store key {kid} could not be used: {type(exc).__name__}")
    fatal("No configured App Store Connect key could access the target app")
    raise AssertionError


def find_version(c: ASC, app_id: str) -> dict[str, Any]:
    rows = c.all(
        f"/v1/apps/{app_id}/appStoreVersions",
        params={
            "filter[platform]": "IOS",
            "filter[versionString]": VERSION_STRING,
            "fields[appStoreVersions]": "platform,versionString,appStoreState,appVersionState,createdDate,build,appStoreReviewDetail",
            "limit": 50,
        },
    )
    if not rows:
        fatal(f"App Store version {VERSION_STRING} was not found")
    # Prefer the newest matching row if Apple ever returns more than one.
    rows.sort(key=lambda x: ((x.get("attributes") or {}).get("createdDate") or "", x.get("id") or ""), reverse=True)
    v = rows[0]
    attrs = v.get("attributes") or {}
    report["app_store_version"] = {
        "id": v["id"],
        "version_string": attrs.get("versionString"),
        "app_store_state": attrs.get("appStoreState"),
        "app_version_state": attrs.get("appVersionState"),
    }
    save()
    return v


def find_build_20(c: ASC, app_id: str) -> dict[str, Any]:
    body = c.request(
        "GET",
        "/v1/builds",
        params={
            "filter[app]": app_id,
            "filter[version]": BUILD_NUMBER,
            "include": "preReleaseVersion",
            "fields[builds]": "version,processingState,expired,usesNonExemptEncryption,uploadedDate,preReleaseVersion",
            "fields[preReleaseVersions]": "version,platform",
            "limit": 50,
        },
        allow=(200,),
    )
    included = {x.get("id"): x for x in body.get("included", []) if x.get("type") == "preReleaseVersions"}
    candidates = []
    for b in body.get("data", []):
        rel = ((b.get("relationships") or {}).get("preReleaseVersion") or {}).get("data") or {}
        pv = included.get(rel.get("id"), {})
        pv_version = (pv.get("attributes") or {}).get("version")
        if pv_version == VERSION_STRING:
            candidates.append(b)
    if not candidates:
        fatal(f"Build {VERSION_STRING} ({BUILD_NUMBER}) was not found")
    candidates.sort(key=lambda x: ((x.get("attributes") or {}).get("uploadedDate") or "", x.get("id") or ""), reverse=True)
    b = candidates[0]
    a = b.get("attributes") or {}
    report["build_record"] = {
        "id": b["id"],
        "version": a.get("version"),
        "processing_state": a.get("processingState"),
        "expired": a.get("expired"),
        "uses_non_exempt_encryption": a.get("usesNonExemptEncryption"),
        "uploaded_date": a.get("uploadedDate"),
    }
    if a.get("processingState") != "VALID":
        fatal(f"Build {BUILD_NUMBER} is not VALID (state={a.get('processingState')})")
    if a.get("expired") is True:
        fatal(f"Build {BUILD_NUMBER} is expired")
    save()
    return b


def set_export_compliance(c: ASC, build_id: str) -> None:
    payload = {
        "data": {
            "type": "builds",
            "id": build_id,
            "attributes": {"usesNonExemptEncryption": False},
        }
    }
    try:
        c.request("PATCH", f"/v1/builds/{build_id}", payload=payload, allow=(200,))
        report["actions"].append("Confirmed build 20 usesNonExemptEncryption=false")
    except RuntimeError as exc:
        # If Apple has already locked this answered attribute, the Info.plist in
        # the binary also contains ITSAppUsesNonExemptEncryption=false. Record a
        # warning rather than silently changing target selection.
        report["warnings"].append(f"Could not re-patch build export compliance: {str(exc)[:500]}")
    save()


def attach_build(c: ASC, version_id: str, build_id: str) -> None:
    payload = {"data": {"type": "builds", "id": build_id}}
    c.request(
        "PATCH",
        f"/v1/appStoreVersions/{version_id}/relationships/build",
        payload=payload,
        allow=(200, 204),
    )
    report["actions"].append(f"Associated App Store version {VERSION_STRING} with build {BUILD_NUMBER}")
    save()


def review_detail(c: ASC, version_id: str) -> dict[str, Any]:
    body = c.request(
        "GET",
        f"/v1/appStoreVersions/{version_id}/appStoreReviewDetail",
        params={
            "fields[appStoreReviewDetails]": "contactFirstName,contactLastName,contactPhone,contactEmail,demoAccountName,demoAccountPassword,demoAccountRequired,notes,appStoreReviewAttachments",
        },
        allow=(200,),
    )
    d = body.get("data")
    if not d:
        fatal("App Store Review detail record is missing; refusing to create one without preserving existing contact/demo fields")
    return d


def update_review_notes(c: ASC, detail: dict[str, Any]) -> None:
    notes = NOTES_PATH.read_text(encoding="utf-8").strip()
    if len(notes) > 4000:
        fatal(f"Review notes are {len(notes)} characters; Apple limit is 4000")
    did = detail["id"]
    payload = {
        "data": {
            "type": "appStoreReviewDetails",
            "id": did,
            "attributes": {"notes": notes},
        }
    }
    c.request("PATCH", f"/v1/appStoreReviewDetails/{did}", payload=payload, allow=(200,))
    report["review_detail"] = {
        "id": did,
        "notes_characters": len(notes),
        "demo_account_required": (detail.get("attributes") or {}).get("demoAccountRequired"),
    }
    report["actions"].append("Updated App Store Review notes with build 20 physical-device verification")
    save()


def audit_attachment(c: ASC, detail_id: str) -> None:
    rows = c.all(
        f"/v1/appStoreReviewDetails/{detail_id}/appStoreReviewAttachments",
        params={
            "fields[appStoreReviewAttachments]": "fileName,fileSize,sourceFileChecksum,assetDeliveryState",
            "limit": 200,
        },
    )
    sanitized = []
    found = None
    for x in rows:
        a = x.get("attributes") or {}
        delivery = a.get("assetDeliveryState") or {}
        item = {
            "id": x.get("id"),
            "file_name": a.get("fileName"),
            "file_size": a.get("fileSize"),
            "delivery_state": delivery.get("state") if isinstance(delivery, dict) else delivery,
        }
        sanitized.append(item)
        if a.get("fileName") == EXPECTED_ATTACHMENT:
            found = item
    report["review_detail"]["attachments"] = sanitized
    if found:
        report["attachment_gate"]["found"] = True
        state = str(found.get("delivery_state") or "").upper()
        report["attachment_gate"]["upload_complete"] = state in {"COMPLETE", "COMPLETED", "SUCCEEDED"}
    save()


def subscription_map(c: ASC, app_id: str) -> dict[str, dict[str, Any]]:
    result: dict[str, dict[str, Any]] = {}
    groups = c.all(f"/v1/apps/{app_id}/subscriptionGroups", params={"limit": 200})
    for g in groups:
        gid = g["id"]
        links = c.all(f"/v1/subscriptionGroups/{gid}/relationships/subscriptions", params={"limit": 200})
        for link in links:
            sub = c.request("GET", f"/v1/subscriptions/{link['id']}", allow=(200,))["data"]
            pid = (sub.get("attributes") or {}).get("productId")
            if pid in PRODUCT_IDS:
                sub = dict(sub)
                sub["_group_id"] = gid
                result[pid] = sub
    missing = sorted(PRODUCT_IDS - set(result))
    if missing:
        fatal("Required Apple subscriptions missing: " + ", ".join(missing))
    return result


def choose_subscription_version(c: ASC, sid: str) -> dict[str, Any]:
    versions = c.all(f"/v1/subscriptions/{sid}/versions", params={"limit": 200})
    if not versions:
        fatal(f"Subscription {sid} has no review version")
    preferred_states = ["READY_FOR_REVIEW", "PREPARE_FOR_SUBMISSION", "REJECTED", "WAITING_FOR_REVIEW", "IN_REVIEW", "APPROVED"]
    for state in preferred_states:
        matches = [v for v in versions if (v.get("attributes") or {}).get("state") == state]
        if matches:
            return matches[-1]
    return versions[-1]


def get_review_submissions(c: ASC, app_id: str) -> list[dict[str, Any]]:
    rows = c.all(
        f"/v1/apps/{app_id}/reviewSubmissions",
        params={
            "filter[platform]": "IOS",
            "fields[reviewSubmissions]": "platform,submittedDate,state,appStoreVersionForReview",
            "limit": 200,
        },
    )
    rows.sort(key=lambda x: ((x.get("attributes") or {}).get("submittedDate") or "", x.get("id") or ""), reverse=True)
    return rows


def create_review_submission(c: ASC, app_id: str) -> dict[str, Any]:
    payload = {
        "data": {
            "type": "reviewSubmissions",
            "attributes": {"platform": "IOS"},
            "relationships": {"app": {"data": {"type": "apps", "id": app_id}}},
        }
    }
    row = c.request("POST", "/v1/reviewSubmissions", payload=payload, allow=(201,))["data"]
    report["actions"].append("Created a new iOS review submission envelope")
    save()
    return row


def review_items(c: ASC, review_id: str) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    body = c.request(
        "GET",
        f"/v1/reviewSubmissions/{review_id}/items",
        params={
            "include": "appStoreVersion,subscriptionVersion,subscriptionGroupVersion",
            "fields[reviewSubmissionItems]": "state,appStoreVersion,subscriptionVersion,subscriptionGroupVersion",
            "fields[appStoreVersions]": "versionString,appStoreState,appVersionState",
            "fields[subscriptionVersions]": "version,state,subscription",
            "limit": 200,
        },
        allow=(200,),
    )
    return body.get("data", []), body.get("included", [])


def item_relation_id(item: dict[str, Any], key: str) -> str | None:
    rel = ((item.get("relationships") or {}).get(key) or {}).get("data") or {}
    return rel.get("id")


def resolve_rejected_items(c: ASC, review_id: str) -> None:
    items, _ = review_items(c, review_id)
    for item in items:
        state = (item.get("attributes") or {}).get("state")
        if state != "REJECTED":
            continue
        payload = {
            "data": {
                "type": "reviewSubmissionItems",
                "id": item["id"],
                "attributes": {"resolved": True},
            }
        }
        c.request("PATCH", f"/v1/reviewSubmissionItems/{item['id']}", payload=payload, allow=(200,))
        relation = "appStoreVersion" if item_relation_id(item, "appStoreVersion") else "subscriptionVersion" if item_relation_id(item, "subscriptionVersion") else "other"
        report["actions"].append(f"Marked corrected rejected review item ready again ({relation})")
    save()


def refresh_review(c: ASC, review_id: str) -> dict[str, Any]:
    return c.request(
        "GET",
        f"/v1/reviewSubmissions/{review_id}",
        params={"fields[reviewSubmissions]": "platform,submittedDate,state"},
        allow=(200,),
    )["data"]


def add_item(c: ASC, review_id: str, relation: str, resource_type: str, resource_id: str) -> None:
    payload = {
        "data": {
            "type": "reviewSubmissionItems",
            "relationships": {
                "reviewSubmission": {"data": {"type": "reviewSubmissions", "id": review_id}},
                relation: {"data": {"type": resource_type, "id": resource_id}},
            },
        }
    }
    c.request("POST", "/v1/reviewSubmissionItems", payload=payload, allow=(201,))


def ensure_review_items(c: ASC, review_id: str, review_state: str, version_id: str, sub_versions: dict[str, str]) -> None:
    items, _ = review_items(c, review_id)
    app_ids = {item_relation_id(i, "appStoreVersion") for i in items}
    sub_ids = {item_relation_id(i, "subscriptionVersion") for i in items}

    missing_app = version_id not in app_ids
    missing_subs = {pid: vid for pid, vid in sub_versions.items() if vid not in sub_ids}
    if (missing_app or missing_subs) and review_state != "READY_FOR_REVIEW":
        report["warnings"].append(
            f"Review submission is {review_state}; Apple does not allow adding new items until it becomes READY_FOR_REVIEW"
        )
        save()
        return

    if missing_app:
        add_item(c, review_id, "appStoreVersion", "appStoreVersions", version_id)
        report["actions"].append("Added App Store version 2.130297.1 to review submission")
    for pid, vid in missing_subs.items():
        add_item(c, review_id, "subscriptionVersion", "subscriptionVersions", vid)
        report["actions"].append(f"Added {pid} subscription version to review submission")
    save()


def submission_summary(c: ASC, review_id: str) -> dict[str, Any]:
    review = refresh_review(c, review_id)
    items, _ = review_items(c, review_id)
    states = []
    for i in items:
        relation = "appStoreVersion" if item_relation_id(i, "appStoreVersion") else "subscriptionVersion" if item_relation_id(i, "subscriptionVersion") else "other"
        states.append({"id": i.get("id"), "state": (i.get("attributes") or {}).get("state"), "type": relation})
    return {
        "id": review_id,
        "state": (review.get("attributes") or {}).get("state"),
        "submitted_date": (review.get("attributes") or {}).get("submittedDate"),
        "items": states,
    }


def submit_review(c: ASC, review_id: str) -> None:
    payload = {
        "data": {
            "type": "reviewSubmissions",
            "id": review_id,
            "attributes": {"submitted": True},
        }
    }
    body = c.request("PATCH", f"/v1/reviewSubmissions/{review_id}", payload=payload, allow=(200,))
    state = ((body.get("data") or {}).get("attributes") or {}).get("state")
    report["actions"].append("Submitted corrected build 20 to App Review")
    report["final_status"] = state or "SUBMITTED"
    save()


def main() -> None:
    save()
    c = authenticate()
    app_id = str(report["app_id"])
    version = find_version(c, app_id)
    build = find_build_20(c, app_id)
    set_export_compliance(c, build["id"])
    attach_build(c, version["id"], build["id"])

    detail = review_detail(c, version["id"])
    update_review_notes(c, detail)
    audit_attachment(c, detail["id"])

    subs = subscription_map(c, app_id)
    sub_versions: dict[str, str] = {}
    for pid, sub in sorted(subs.items()):
        sv = choose_subscription_version(c, sub["id"])
        sub_versions[pid] = sv["id"]
        report["subscriptions"][pid] = {
            "subscription_id": sub["id"],
            "subscription_state": (sub.get("attributes") or {}).get("state"),
            "subscription_version_id": sv["id"],
            "subscription_version_state": (sv.get("attributes") or {}).get("state"),
        }
    save()

    submissions = get_review_submissions(c, app_id)
    active = next((r for r in submissions if (r.get("attributes") or {}).get("state") in ACTIVE_REVIEW_STATES), None)
    if active is None:
        active = create_review_submission(c, app_id)

    review_id = active["id"]
    state = (active.get("attributes") or {}).get("state")
    if state == "UNRESOLVED_ISSUES":
        resolve_rejected_items(c, review_id)
        # Apple may transition the envelope back to READY_FOR_REVIEW after the
        # rejected items are marked resolved.
        time.sleep(2)
        active = refresh_review(c, review_id)
        state = (active.get("attributes") or {}).get("state")

    ensure_review_items(c, review_id, state, version["id"], sub_versions)
    report["review_submission"] = submission_summary(c, review_id)
    state = report["review_submission"]["state"]

    if state in {"WAITING_FOR_REVIEW", "IN_REVIEW"}:
        report["final_status"] = state
        save()
        return
    if state not in {"READY_FOR_REVIEW", "UNRESOLVED_ISSUES"}:
        report["final_status"] = f"NOT_SUBMITTABLE_{state}"
        report["warnings"].append(f"Review envelope is in state {state}; no final submit attempted")
        save()
        return

    attachment_ok = report["attachment_gate"]["found"] and report["attachment_gate"]["upload_complete"]
    if not attachment_ok:
        report["final_status"] = "READY_BUT_NEEDS_PHYSICAL_DEVICE_VIDEO_ATTACHMENT"
        report["warnings"].append(
            f"Final App Review submit intentionally blocked until attachment '{EXPECTED_ATTACHMENT}' is present and fully uploaded."
        )
        save()
        return

    if not ALLOW_FINAL_SUBMIT:
        report["final_status"] = "READY_TO_SUBMIT_FINAL_GATE_DISABLED"
        save()
        return

    submit_review(c, review_id)


if __name__ == "__main__":
    try:
        main()
    except SystemExit:
        raise
    except Exception as exc:
        report["errors"].append(f"Fatal: {type(exc).__name__}: {str(exc)[:1200]}")
        report["final_status"] = "BLOCKED"
        save()
        raise
