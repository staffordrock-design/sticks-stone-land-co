#!/usr/bin/env python3
"""Update S&S Rock Holdings App Store search metadata for the next iOS version.

Runs in GitHub Actions with App Store Connect API credentials already configured
for this repository. The script never writes credentials to disk or reports.
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
BUNDLE_ID = "com.base6a78376a454093ba2f431acd.app"
TARGET_VERSION = os.getenv("ASC_TARGET_VERSION", "2.130297.3")
APP_NAME = "S&S Rock Holdings"
SUBTITLE = "Quarry Data & Marketplace"
KEYWORDS = "quarry,mine,aggregate,mineral,land,geology,MSHA,TDEC,buyer,seller,property,permit,reserves"
ISSUER_ID = os.getenv("ASC_ISSUER_ID", "7097918c-2758-4720-b0fa-938914c24b36")
KEY_IDS = [x.strip() for x in os.getenv("ASC_KEY_IDS", "").split(",") if x.strip()]
PRIVATE_KEY = os.getenv("ASC_PRIVATE_KEY", "")
REPORT_PATH = Path(os.getenv("ASC_METADATA_REPORT_PATH", "reports/apple_store_metadata_sync.json"))

if len(APP_NAME) > 30:
    raise SystemExit("App name exceeds Apple's 30-character limit")
if len(SUBTITLE) > 30:
    raise SystemExit("Subtitle exceeds Apple's 30-character limit")
if len(KEYWORDS.encode("utf-8")) > 100:
    raise SystemExit("Keywords exceed Apple's 100-byte limit")

report: dict[str, Any] = {
    "generated_at": dt.datetime.now(dt.timezone.utc).isoformat(),
    "bundle_id": BUNDLE_ID,
    "target_version": TARGET_VERSION,
    "name": APP_NAME,
    "subtitle": SUBTITLE,
    "keywords": KEYWORDS,
    "authenticated": False,
    "key_id_used": None,
    "app_id": None,
    "version_id": None,
    "version_created": False,
    "app_info_localizations_updated": [],
    "app_info_update_errors": [],
    "version_localization_updated": False,
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
    def __init__(self, token: str):
        self.session = requests.Session()
        self.session.headers.update({
            "Authorization": f"Bearer {token}",
            "Accept": "application/json",
            "Content-Type": "application/json",
        })

    def request(self, method: str, path_or_url: str, *, params=None, payload=None, allow=(200, 201, 204)) -> dict[str, Any]:
        url = path_or_url if path_or_url.startswith("http") else API + path_or_url
        for attempt in range(5):
            response = self.session.request(method, url, params=params, json=payload, timeout=60)
            if response.status_code in allow:
                return response.json() if response.content else {}
            if response.status_code == 429 or response.status_code >= 500:
                time.sleep(min(2 ** attempt, 16))
                continue
            raise RuntimeError(f"{method} {url} -> {response.status_code}: {response.text[:1800]}")
        raise RuntimeError(f"{method} {url} failed after retries")

    def all(self, path: str, *, params=None) -> list[dict[str, Any]]:
        items: list[dict[str, Any]] = []
        url: str | None = path
        first = True
        while url:
            body = self.request("GET", url, params=params if first else None, allow=(200,))
            first = False
            items.extend(body.get("data", []))
            url = (body.get("links") or {}).get("next")
        return items


def authenticate() -> tuple[ASC, dict[str, Any], str]:
    if not PRIVATE_KEY:
        raise RuntimeError("ASC_PRIVATE_KEY is missing")
    if not KEY_IDS:
        raise RuntimeError("No App Store Connect key IDs configured")
    last_error = None
    for key_id in KEY_IDS:
        try:
            client = ASC(make_token(key_id))
            apps = client.all("/v1/apps", params={"filter[bundleId]": BUNDLE_ID, "limit": 10})
            if apps:
                return client, apps[0], key_id
            last_error = f"Key {key_id} authenticated but target app was not visible"
        except Exception as exc:
            last_error = f"Key {key_id} failed: {type(exc).__name__}"
    raise RuntimeError(last_error or "Unable to authenticate to App Store Connect")


def ensure_target_version(client: ASC, app_id: str) -> dict[str, Any]:
    versions = client.all(
        f"/v1/apps/{app_id}/appStoreVersions",
        params={
            "filter[platform]": "IOS",
            "fields[appStoreVersions]": "platform,versionString,appStoreState,appVersionState,createdDate",
            "limit": 200,
        },
    )
    target = next((v for v in versions if (v.get("attributes") or {}).get("versionString") == TARGET_VERSION), None)
    if target:
        return target

    payload = {
        "data": {
            "type": "appStoreVersions",
            "attributes": {
                "platform": "IOS",
                "versionString": TARGET_VERSION,
                "releaseType": "MANUAL",
            },
            "relationships": {"app": {"data": {"type": "apps", "id": app_id}}},
        }
    }
    created = client.request("POST", "/v1/appStoreVersions", payload=payload)["data"]
    report["version_created"] = True
    print(f"Created editable App Store version {TARGET_VERSION}.")
    return created


def update_app_info(client: ASC, app_id: str) -> None:
    app_infos = client.all(
        f"/v1/apps/{app_id}/appInfos",
        params={"fields[appInfos]": "appStoreState,state", "limit": 50},
    )
    updated = []
    failures = []
    for info in app_infos:
        info_id = info["id"]
        state = info.get("attributes") or {}
        localizations = client.all(f"/v1/appInfos/{info_id}/appInfoLocalizations", params={"limit": 50})
        for loc in localizations:
            attrs = loc.get("attributes") or {}
            if attrs.get("locale") != "en-US":
                continue
            payload = {
                "data": {
                    "type": "appInfoLocalizations",
                    "id": loc["id"],
                    "attributes": {"name": APP_NAME, "subtitle": SUBTITLE},
                }
            }
            try:
                client.request("PATCH", f"/v1/appInfoLocalizations/{loc['id']}", payload=payload)
                updated.append(loc["id"])
            except Exception as exc:
                failures.append({
                    "app_info_id": info_id,
                    "localization_id": loc["id"],
                    "app_store_state": state.get("appStoreState"),
                    "state": state.get("state"),
                    "error": f"{type(exc).__name__}: {str(exc)[:900]}",
                })
    report["app_info_localizations_updated"] = updated
    report["app_info_update_errors"] = failures
    if updated:
        print(f"Updated App Store name/subtitle on {len(updated)} en-US localization(s).")
    else:
        print("Apple is not allowing the App Store name/subtitle to change in the current state; recorded for retry after the new build upload.")


def get_version_localizations(client: ASC, version_id: str) -> list[dict[str, Any]]:
    return client.all(f"/v1/appStoreVersions/{version_id}/appStoreVersionLocalizations", params={"limit": 50})


def find_source_localization(client: ASC, app_id: str, target_version_id: str) -> dict[str, Any] | None:
    versions = client.all(
        f"/v1/apps/{app_id}/appStoreVersions",
        params={
            "filter[platform]": "IOS",
            "fields[appStoreVersions]": "versionString,createdDate",
            "limit": 200,
        },
    )
    versions = [v for v in versions if v.get("id") != target_version_id]
    versions.sort(key=lambda v: (v.get("attributes") or {}).get("createdDate") or "", reverse=True)
    for version in versions:
        locs = get_version_localizations(client, version["id"])
        for loc in locs:
            if (loc.get("attributes") or {}).get("locale") == "en-US":
                return loc
    return None


def update_version_keywords(client: ASC, app_id: str, version_id: str) -> None:
    localizations = get_version_localizations(client, version_id)
    target_loc = next((x for x in localizations if (x.get("attributes") or {}).get("locale") == "en-US"), None)
    if target_loc:
        payload = {
            "data": {
                "type": "appStoreVersionLocalizations",
                "id": target_loc["id"],
                "attributes": {"keywords": KEYWORDS},
            }
        }
        client.request("PATCH", f"/v1/appStoreVersionLocalizations/{target_loc['id']}", payload=payload)
        report["version_localization_updated"] = True
        print("Updated App Store search keywords on existing en-US version localization.")
        return

    source = find_source_localization(client, app_id, version_id)
    if not source:
        raise RuntimeError("No prior en-US version localization was available to clone")
    src = source.get("attributes") or {}
    clone_attrs = {"locale": "en-US", "keywords": KEYWORDS}
    for key in ("description", "marketingUrl", "promotionalText", "supportUrl", "whatsNew"):
        value = src.get(key)
        if value not in (None, ""):
            clone_attrs[key] = value
    payload = {
        "data": {
            "type": "appStoreVersionLocalizations",
            "attributes": clone_attrs,
            "relationships": {"appStoreVersion": {"data": {"type": "appStoreVersions", "id": version_id}}},
        }
    }
    client.request("POST", "/v1/appStoreVersionLocalizations", payload=payload)
    report["version_localization_updated"] = True
    print("Created en-US localization for the new version and applied search keywords.")


def main() -> None:
    save()
    try:
        client, app, key_id = authenticate()
        report["authenticated"] = True
        report["key_id_used"] = key_id
        report["app_id"] = app["id"]
        save()

        version = ensure_target_version(client, app["id"])
        report["version_id"] = version["id"]
        save()

        update_version_keywords(client, app["id"], version["id"])
        save()
        update_app_info(client, app["id"])
        save()
        print("S&S App Store search metadata sync completed.")
    except Exception as exc:
        message = f"{type(exc).__name__}: {str(exc)[:1800]}"
        report["errors"].append(message)
        save()
        print(f"ERROR: {message}", file=sys.stderr)
        raise


if __name__ == "__main__":
    main()
