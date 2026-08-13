import { createClientFromRequest } from "npm:@base44/sdk";
import { deriveCommodityInterpretation, rockQualityTier } from "../../shared/rockTypes.js";

const GEOLOGY_QUERY = "https://services4.arcgis.com/QdHwhlbx61LR3TWb/arcgis/rest/services/TN_Geology/FeatureServer/0/query";
const GEOLOGY_LAYER = "TN_Geology / tngeol_poly_dd";
const GEOLOGY_SOURCE = "USGS Tennessee geologic map via ArcGIS";

function validCoord(lat: unknown, lon: unknown) {
  const a = Number(lat);
  const o = Number(lon);
  return Number.isFinite(a) && Number.isFinite(o) && a >= -90 && a <= 90 && o >= -180 && o <= 180;
}

function titleRock(value: unknown) {
  const s = String(value || "").trim();
  if (!s) return null;
  return s.replace(/\b\w/g, (m) => m.toUpperCase());
}

async function identifyGeology(lat: number, lon: number) {
  const params = new URLSearchParams({
    f: "json",
    geometry: `${lon},${lat}`,
    geometryType: "esriGeometryPoint",
    inSR: "4326",
    spatialRel: "esriSpatialRelIntersects",
    outFields: "ORIG_LABEL,SGMC_LABEL,UNIT_LINK,SOURCE,UNIT_AGE,ROCKTYPE1,ROCKTYPE2",
    returnGeometry: "false",
  });
  const url = `${GEOLOGY_QUERY}?${params.toString()}`;
  const resp = await fetch(url, { headers: { "User-Agent": "SticksAndStoneLandCo/1.0" } });
  if (!resp.ok) throw new Error(`Geology query failed: ${resp.status}`);
  const data = await resp.json();
  if (data?.error) throw new Error(data.error?.message || "ArcGIS geology query error");
  const attrs = data?.features?.[0]?.attributes;
  return { attrs: attrs || null, url };
}

export default async function(req: Request) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== "admin") {
      return Response.json({ error: "Admin access required" }, { status: 403 });
    }

    const sites = await base44.asServiceRole.entities.MiningSite.list("-updated_date", 500);
    let queried = 0;
    let matched = 0;
    let created = 0;
    let updated = 0;
    let noMatch = 0;
    let noCoordinates = 0;
    const sample: any[] = [];

    for (const site of sites || []) {
      if (String(site.state || "").toUpperCase() !== "TN") continue;
      if (!validCoord(site.latitude, site.longitude)) {
        noCoordinates++;
        continue;
      }
      queried++;

      try {
        const { attrs, url } = await identifyGeology(Number(site.latitude), Number(site.longitude));
        if (!attrs) {
          noMatch++;
          continue;
        }
        matched++;

        const primaryRock = titleRock(attrs.ROCKTYPE1);
        const secondaryRock = titleRock(attrs.ROCKTYPE2);
        const unitLabel = attrs.SGMC_LABEL || attrs.ORIG_LABEL || null;
        const commodityInterpretation = deriveCommodityInterpretation({
          primary: primaryRock,
          secondary: secondaryRock,
          siteCommodity: site.commodity || null,
        });
        const qualityTier = rockQualityTier(primaryRock, secondaryRock);
        // Confidence scales with how specific the mapped lithology is:
        // High = a classified quarry-relevant rock type; Medium = a unit label
        // but no classifiable rock type; Low = only an age/label fragment.
        const confidence = qualityTier ? "High" : unitLabel ? "Medium" : "Low";
        const sourceKey = `TN-GEOLOGY-${site.id}`;

        const record = {
          mining_site_id: site.id,
          msha_mine_id: site.msha_mine_id || null,
          parcel_id: site.parcel_id || null,
          mine_name: site.mine_name || `Mine ${site.msha_mine_id || site.id}`,
          state: "TN",
          county: site.county || null,
          primary_rock: primaryRock,
          secondary_rock: secondaryRock,
          geologic_unit: unitLabel,
          formation_name: null,
          geologic_age: attrs.UNIT_AGE || null,
          lithology: [primaryRock, secondaryRock].filter(Boolean).join(" / ") || null,
          commodity_interpretation: commodityInterpretation,
          confidence: qualityTier ? "High" : confidence,
          source_agency: GEOLOGY_SOURCE,
          source_url: url,
          source_map_layer: GEOLOGY_LAYER,
          last_source_update: new Date().toISOString(),
          notes: `Spatial point-in-polygon match at ${Number(site.latitude).toFixed(6)}, ${Number(site.longitude).toFixed(6)}. Original label: ${attrs.ORIG_LABEL || "—"}; SGMC label: ${attrs.SGMC_LABEL || "—"}; unit reference: ${attrs.UNIT_LINK || "—"}; source code: ${attrs.SOURCE || "—"}. Derived quarry-use screening category: ${commodityInterpretation || "Unclassified"}; lithology screening tier: ${qualityTier || "Unknown"}. This is mapped surface/bedrock geology context, not drilling, reserve estimation, aggregate-quality certification, lab testing, or proof of economic recoverability.`,
        };

        const existing = await base44.asServiceRole.entities.GeologyRecord.filter(
          { mining_site_id: site.id }, "-updated_date", 20, 0
        );
        const preferred = (existing || []).find((r: any) => r.source_agency === GEOLOGY_SOURCE) || existing?.[0];
        if (preferred) {
          await base44.asServiceRole.entities.GeologyRecord.update(preferred.id, record);
          updated++;
        } else {
          await base44.asServiceRole.entities.GeologyRecord.create(record);
          created++;
        }

        if (sample.length < 12) {
          sample.push({
            mine: site.mine_name,
            msha: site.msha_mine_id || null,
            county: site.county || null,
            primaryRock,
            secondaryRock,
            category: commodityInterpretation,
            qualityTier,
            age: attrs.UNIT_AGE || null,
            unit: unitLabel,
          });
        }
      } catch (e) {
        console.error("Geology lookup failed for", site.id, e);
      }
    }

    return Response.json({
      success: true,
      queried,
      matched,
      created,
      updated,
      noMatch,
      noCoordinates,
      sample,
      source: GEOLOGY_QUERY,
      note: "Mapped rock type is assigned by a geographic point-in-polygon match against the Tennessee geology layer. Quarry-use classifications are screening labels only, not aggregate-quality ratings, reserve estimates, or laboratory identifications.",
    });
  } catch (error: any) {
    console.error("sync-tn-geology error", error);
    return Response.json({ error: error?.message || String(error) }, { status: 500 });
  }
}