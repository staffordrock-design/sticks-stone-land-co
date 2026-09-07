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
ACTIVE_REVIEW_STATES = {"READY_FOR_REVIEW", "WAITING_FOR_REVIEW", "IN_REVIEW", "UNRESOLVED_ISSUES", "CANCELING", "COMPLETING"}

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


def create_review(c: ASC, app_id: str, version_id: str) -> str:
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
    c.request(
        "POST",
        "/v1/reviewSubmissionItems",
        payload={
            "data": {
                "type": "reviewSubmissionItems",
                "relationships": {
                    "reviewSubmission": {"data": {"type": "reviewSubmissions", "id": review_id}},
                    "appStoreVersion": {"data": {"type": "appStoreVersions", "id": version_id}},
                },
            }
        },
    )
    c.request(
        "PATCH",
        f"/v1/reviewSubmissions/{review_id}",
        payload={"data": {"type": "reviewSubmissions", "id": review_id, "attributes": {"submitted": True}}},
    )
    report["actions"].append(f"Submitted version {TARGET_VERSION} build {TARGET_BUILD} for App Review with manual release")
    save()
    return review_id


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

        reviews = active_reviews(c, app_id)
        if reviews:
            states = [(r.get("id"), (r.get("attributes") or {}).get("state")) for r in reviews]
            raise RuntimeError(f"An active iOS review already exists; refusing to replace it automatically: {states}")

        review_id = create_review(c, app_id, version_id)
        time.sleep(3)
        review = c.request("GET", f"/v1/reviewSubmissions/{review_id}").get("data") or {}
        review_state = (review.get("attributes") or {}).get("state")
        attached = c.request("GET", f"/v1/appStoreVersions/{version_id}/build", params={"fields[builds]": "version,processingState,expired"}).get("data") or {}
        report["final"] = {
            "review_id": review_id,
            "review_state": review_state,
            "attached_build": (attached.get("attributes") or {}).get("version"),
            "attached_build_state": (attached.get("attributes") or {}).get("processingState"),
            "release_type": (version.get("attributes") or {}).get("releaseType"),
        }
        save()
        if report["final"]["attached_build"] != TARGET_BUILD or report["final"]["attached_build_state"] != "VALID":
            raise RuntimeError("Final verification failed: expected VALID target build is not attached")
        if review_state not in {"WAITING_FOR_REVIEW", "IN_REVIEW"}:
            raise RuntimeError(f"Final verification failed: review state is {review_state}")
        print(f"SUCCESS: version {TARGET_VERSION} build {TARGET_BUILD} submitted for App Review.")
    except Exception as exc:
        report["errors"].append(f"{type(exc).__name__}: {str(exc)[:1800]}")
        save()
        print(report["errors"][-1], file=sys.stderr)
        raise


if __name__ == "__main__":
    main()
