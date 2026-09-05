#!/usr/bin/env python3
"""Discover which App Store Connect app records contain the S&S products/review submission."""
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
ISSUER_ID = os.getenv("ASC_ISSUER_ID", "7097918c-2758-4720-b0fa-938914c24b36")
KEY_IDS = [x.strip() for x in os.getenv("ASC_KEY_IDS", "").split(",") if x.strip()]
PRIVATE_KEY = os.getenv("ASC_PRIVATE_KEY", "")
REPORT_PATH = Path(os.getenv("ASC_DISCOVERY_REPORT_PATH", "reports/apple_account_discovery.json"))
TARGET_PRODUCTS = {
    "com.ssrockholdings.marketplace.monthly",
    "com.ssrockholdings.marketplace.annual",
    "com.ssrockholdings.professional.monthly",
    "com.ssrockholdings.professional.annual",
}
ACTIVE_STATES = {"READY_FOR_REVIEW", "WAITING_FOR_REVIEW", "IN_REVIEW", "UNRESOLVED_ISSUES", "CANCELING", "COMPLETING"}
SS_ROCK_BUNDLE_ID = "com.base6a78376a454093ba2f431acd.app"

report: dict[str, Any] = {
    "generated_at": dt.datetime.now(dt.timezone.utc).isoformat(),
    "authenticated": False,
    "key_id_used": None,
    "apps": [],
    "target_product_locations": {},
    "active_review_apps": [],
    "errors": [],
}


def save() -> None:
    REPORT_PATH.parent.mkdir(parents=True, exist_ok=True)
    REPORT_PATH.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def token(key_id: str) -> str:
    now = int(time.time())
    return jwt.encode({"iss": ISSUER_ID, "iat": now, "exp": now + 900, "aud": "appstoreconnect-v1"}, PRIVATE_KEY, algorithm="ES256", headers={"kid": key_id, "typ": "JWT"})


class ASC:
    def __init__(self, t: str):
        self.s = requests.Session()
        self.s.headers.update({"Authorization": f"Bearer {t}", "Accept": "application/json", "Content-Type": "application/json"})

    def request(self, method: str, path_or_url: str, *, params=None) -> dict[str, Any]:
        url = path_or_url if path_or_url.startswith("http") else API + path_or_url
        for attempt in range(5):
            r = self.s.request(method, url, params=params, timeout=60)
            if r.status_code == 200:
                return r.json()
            if r.status_code == 429 or r.status_code >= 500:
                time.sleep(min(2 ** attempt, 16))
                continue
            raise RuntimeError(f"{method} {url} -> {r.status_code}: {r.text[:1000]}")
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
        raise RuntimeError("ASC_PRIVATE_KEY missing")
    for kid in KEY_IDS:
        try:
            c = ASC(token(kid))
            c.all("/v1/apps", params={"limit": 1})
            report["authenticated"] = True
            report["key_id_used"] = kid
            save()
            return c
        except Exception:
            continue
    raise RuntimeError("No configured App Store Connect key authenticated")


def main() -> None:
    save()
    try:
        c = authenticate()
        apps = c.all("/v1/apps", params={"fields[apps]": "name,bundleId,sku,primaryLocale", "limit": 200})
        for app in apps:
            aid = app["id"]
            attrs = app.get("attributes") or {}
            entry: dict[str, Any] = {
                "id": aid,
                "name": attrs.get("name"),
                "bundle_id": attrs.get("bundleId"),
                "sku": attrs.get("sku"),
                "subscription_groups": [],
                "active_reviews": [],
                "ios_versions": [],
            }

            try:
                versions = c.all(
                    f"/v1/apps/{aid}/appStoreVersions",
                    params={"filter[platform]": "IOS", "fields[appStoreVersions]": "platform,versionString,appStoreState,appVersionState,createdDate", "limit": 200},
                )
                for v in versions:
                    va = v.get("attributes") or {}
                    ventry = {
                        "id": v.get("id"),
                        "version_string": va.get("versionString"),
                        "app_store_state": va.get("appStoreState"),
                        "app_version_state": va.get("appVersionState"),
                        "created_date": va.get("createdDate"),
                        "attached_build": None,
                    }
                    try:
                        build = c.request(
                            "GET",
                            f"/v1/appStoreVersions/{v.get('id')}/build",
                            params={"fields[builds]": "version,uploadedDate,processingState,expired"},
                        ).get("data") or {}
                        if build:
                            ba = build.get("attributes") or {}
                            ventry["attached_build"] = {
                                "id": build.get("id"),
                                "version": ba.get("version"),
                                "uploaded_date": ba.get("uploadedDate"),
                                "processing_state": ba.get("processingState"),
                                "expired": ba.get("expired"),
                            }
                    except Exception as build_exc:
                        ventry["attached_build_error"] = f"{type(build_exc).__name__}: {str(build_exc)[:300]}"
                    entry["ios_versions"].append(ventry)
            except Exception as exc:
                entry["ios_versions_error"] = f"{type(exc).__name__}: {str(exc)[:300]}"

            if attrs.get("bundleId") == SS_ROCK_BUNDLE_ID:
                try:
                    builds = c.all(
                        "/v1/builds",
                        params={
                            "filter[app]": aid,
                            "fields[builds]": "version,uploadedDate,processingState,expired",
                            "limit": 200,
                        },
                    )
                    recent_builds = []
                    for build in builds:
                        ba = build.get("attributes") or {}
                        recent_builds.append({
                            "id": build.get("id"),
                            "version": ba.get("version"),
                            "uploaded_date": ba.get("uploadedDate"),
                            "processing_state": ba.get("processingState"),
                            "expired": ba.get("expired"),
                        })
                    recent_builds.sort(key=lambda row: row.get("uploaded_date") or "", reverse=True)
                    entry["recent_builds"] = recent_builds[:12]
                except Exception as builds_exc:
                    entry["recent_builds_error"] = f"{type(builds_exc).__name__}: {str(builds_exc)[:300]}"

            try:
                reviews = c.all(
                    f"/v1/apps/{aid}/reviewSubmissions",
                    params={"fields[reviewSubmissions]": "platform,submittedDate,state", "limit": 200},
                )
                for rv in reviews:
                    ra = rv.get("attributes") or {}
                    state = ra.get("state")
                    if state in ACTIVE_STATES:
                        rentry = {"id": rv.get("id"), "state": state, "submitted_date": ra.get("submittedDate"), "platform": ra.get("platform")}
                        entry["active_reviews"].append(rentry)
                        report["active_review_apps"].append({"app_id": aid, "name": attrs.get("name"), "bundle_id": attrs.get("bundleId"), **rentry})
            except Exception as exc:
                entry["review_error"] = f"{type(exc).__name__}: {str(exc)[:300]}"

            try:
                groups = c.all(f"/v1/apps/{aid}/subscriptionGroups", params={"fields[subscriptionGroups]": "referenceName", "limit": 200})
                for g in groups:
                    gid = g["id"]
                    ga = g.get("attributes") or {}
                    gentry = {"id": gid, "reference_name": ga.get("referenceName"), "subscriptions": []}
                    try:
                        links = c.all(f"/v1/subscriptionGroups/{gid}/relationships/subscriptions", params={"limit": 200})
                        for link in links:
                            sid = link["id"]
                            sub = c.request("GET", f"/v1/subscriptions/{sid}")["data"]
                            sa = sub.get("attributes") or {}
                            sentry = {
                                "id": sid,
                                "product_id": sa.get("productId"),
                                "name": sa.get("name"),
                                "state": sa.get("state"),
                                "period": sa.get("subscriptionPeriod"),
                            }
                            gentry["subscriptions"].append(sentry)
                            pid = sentry["product_id"]
                            if pid in TARGET_PRODUCTS:
                                report["target_product_locations"][pid] = {
                                    "app_id": aid,
                                    "app_name": attrs.get("name"),
                                    "bundle_id": attrs.get("bundleId"),
                                    "group_id": gid,
                                    "group_reference_name": ga.get("referenceName"),
                                    "subscription_id": sid,
                                    "subscription_name": sentry["name"],
                                    "subscription_state": sentry["state"],
                                }
                    except Exception as exc:
                        gentry["error"] = f"{type(exc).__name__}: {str(exc)[:300]}"
                    entry["subscription_groups"].append(gentry)
            except Exception as exc:
                entry["subscription_groups_error"] = f"{type(exc).__name__}: {str(exc)[:300]}"

            report["apps"].append(entry)
            save()
    except Exception as exc:
        report["errors"].append(f"Fatal: {type(exc).__name__}: {str(exc)[:1000]}")
        save()
        raise


if __name__ == "__main__":
    main()
