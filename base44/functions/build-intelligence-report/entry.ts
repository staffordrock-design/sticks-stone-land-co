import { createClientFromRequest } from "npm:@base44/sdk";

function uniqueById(rows: any[]) {
  const seen = new Set<string>();
  return (rows || []).filter((row: any) => {
    const key = String(row?.id || JSON.stringify(row));
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function collect(entity: any, filters: any[], sort = "-updated_date", limit = 100) {
  const batches: any[] = [];
  for (const filter of filters) {
    const clean = Object.fromEntries(Object.entries(filter).filter(([, v]) => v !== null && v !== undefined && v !== ""));
    if (!Object.keys(clean).length) continue;
    try {
      const rows = await entity.filter(clean, sort, limit, 0);
      if (rows?.length) batches.push(...rows);
    } catch (_) {
      // One unavailable linkage should not prevent the rest of the report from being assembled.
    }
  }
  return uniqueById(batches);
}

async function fetchLiveTnParcel(site: any) {
  const lat = Number(site?.latitude);
  const lng = Number(site?.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || String(site?.state || "TN").toUpperCase() !== "TN") return null;
  try {
    const parcelParams = new URLSearchParams({
      f: "geojson", where: "1=1", geometry: `${lng},${lat}`, geometryType: "esriGeometryPoint",
      inSR: "4326", spatialRel: "esriSpatialRelIntersects", outFields: "GISLINK,GISLINK2,CALC_ACRE",
      returnGeometry: "false", resultRecordCount: "1"
    });
    const pr = await fetch(`https://maps.cot.tn.gov/server3/rest/services/IMPACT/Parcels/FeatureServer/0/query?${parcelParams}`);
    if (!pr.ok) return null;
    const pf = (await pr.json())?.features?.[0];
    if (!pf) return null;
    const parcelId = String(pf?.properties?.GISLINK || pf?.properties?.GISLINK2 || "").trim();
    if (!parcelId) return null;
    const escaped = parcelId.replace(/'/g, "''");
    const ap = new URLSearchParams({
      f: "json", where: `GISLINK='${escaped}'`,
      outFields: "GISLINK,PARCELID,OWNER,OWNER2,OWNJAN1,ADDRESS,MAILADDR,MAILCITY,STATE,ZIP,CALC_ACRE,LANDVAL,IMPVAL,APPRAISAL,DEEDBKPG,TAXYR,UPDATED,LASTUPD,COUNTY",
      returnGeometry: "false", resultRecordCount: "1"
    });
    const ar = await fetch(`https://maps.cot.tn.gov/server3/rest/services/IMPACT/Parcel_Layer_Labels/FeatureServer/1/query?${ap}`);
    const a = ar.ok ? (await ar.json())?.features?.[0]?.attributes : null;
    return {
      parcel_id: parcelId,
      owner_name: String(a?.OWNER || a?.OWNJAN1 || "").trim(),
      property_address: String(a?.ADDRESS || "").trim(),
      mailing_address: [a?.MAILADDR, a?.MAILCITY, a?.STATE, a?.ZIP].map((v: any) => String(v || "").trim()).filter(Boolean).join(", "),
      acreage: Number(a?.CALC_ACRE) || Number(pf?.properties?.CALC_ACRE) || null,
      assessed_value: Number(a?.APPRAISAL) || null,
      land_value: Number(a?.LANDVAL) || null,
      improvement_value: Number(a?.IMPVAL) || null,
      deed_book_page: String(a?.DEEDBKPG || "").trim(),
      source_name: a ? "TN Comptroller IMPACT Property Assessment GIS" : "TN Comptroller IMPACT Parcel GIS",
      source_url: "https://maps.cot.tn.gov/server3/rest/services/IMPACT/Parcel_Layer_Labels/FeatureServer/1",
      last_source_update: String(a?.UPDATED || a?.LASTUPD || "").trim(),
    };
  } catch (_) {
    return null;
  }
}

function sourceRow(reportOrderId: string, type: string, name: string, url: string | undefined, summary: string, confidence: string = "Medium") {
  return {
    report_order_id: reportOrderId,
    source_type: type,
    source_name: name,
    source_url: url || "",
    retrieved_at: new Date().toISOString(),
    summary,
    confidence,
  };
}

export default async function(req: Request) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user?.id) return Response.json({ error: "Sign in required" }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const miningSiteId = String(body?.mining_site_id || "").trim();
    const reportType = ["Standard", "Enhanced", "Custom"].includes(body?.report_type) ? body.report_type : "Standard";
    if (!miningSiteId) return Response.json({ error: "mining_site_id is required" }, { status: 400 });

    // Professional subscription or admin access is required for report generation.
    let allowed = user.role === "admin";
    if (!allowed) {
      const entitlements = await base44.entities.SubscriptionEntitlement.filter({ user_id: user.id }, "-updated_date", 10, 0);
      allowed = (entitlements || []).some((e: any) =>
        ["active", "trial", "grace_period"].includes(e.status) &&
        ["professional_monthly", "professional_annual"].includes(e.plan_code) &&
        (!e.expires_at || new Date(e.expires_at).getTime() > Date.now())
      );
    }
    if (!allowed) return Response.json({ error: "Professional access required" }, { status: 403 });

    const site: any = await base44.asServiceRole.entities.MiningSite.get(miningSiteId);
    if (!site) return Response.json({ error: "Mining site not found" }, { status: 404 });

    const msha = site.msha_mine_id;
    const parcelId = site.parcel_id;
    const permitNo = site.tdec_permit_number;

    const [parcels, permits, geologyRows, profileRows, production, inspections, violations, environmental, freshnessRows, countySites] = await Promise.all([
      collect(base44.asServiceRole.entities.ParcelRecord, [
        { parcel_id: parcelId }, { msha_mine_id: msha }, { tdec_permit_number: permitNo }
      ], "-updated_date", 20),
      collect(base44.asServiceRole.entities.TDECPermit, [
        { permit_number: permitNo }, { msha_mine_id: msha }
      ], "-updated_date", 50),
      collect(base44.asServiceRole.entities.GeologyRecord, [
        { mining_site_id: site.id }, { msha_mine_id: msha }, { parcel_id: parcelId }
      ], "-updated_date", 20),
      collect(base44.asServiceRole.entities.QuarryPotentialProfile, [
        { mining_site_id: site.id }, { msha_mine_id: msha }
      ], "-updated_date", 20),
      collect(base44.asServiceRole.entities.ProductionRecord, [
        { mining_site_id: site.id }, { msha_mine_id: msha }
      ], "-year", 100),
      collect(base44.asServiceRole.entities.MSHAInspection, [{ msha_mine_id: msha }], "-start_date", 100),
      collect(base44.asServiceRole.entities.MSHAViolation, [{ msha_mine_id: msha }], "-issue_date", 100),
      collect(base44.asServiceRole.entities.EnvironmentalRecord, [
        { msha_mine_id: msha }, { npdes_permit_number: site.npdes_permit_number }
      ], "-updated_date", 100),
      base44.asServiceRole.entities.DataFreshnessStatus.list("source", 20),
      reportType === "Enhanced" && site.county ? base44.asServiceRole.entities.MiningSite.filter({ state: site.state || "TN", county: site.county }, "-updated_date", 100, 0) : Promise.resolve([]),
    ]);

    let parcel = parcels[0] || null;
    if (!parcel || !parcel.owner_name) {
      const liveParcel = await fetchLiveTnParcel(site);
      if (liveParcel) parcel = { ...(parcel || {}), ...liveParcel };
    }
    const geology = geologyRows[0] || null;
    const profile = profileRows[0] || null;
    const freshness = Object.fromEntries((freshnessRows || []).map((r: any) => [r.source, r]));
    const nearbySites = reportType === "Enhanced" ? (countySites || []).filter((r: any) => r.id !== site.id).slice(0, 20) : [];
    const freshnessSummary = ["MSHA", "TDEC", "Geology", "Parcel", "Tax", "Environmental"].map((key) => `${key}:${freshness[key]?.status || "Unknown"}`).join(" · ");
    const now = new Date().toISOString();

    const order: any = await base44.asServiceRole.entities.IntelligenceReportOrder.create({
      user_id: user.id,
      customer_email: user.email || "",
      mining_site_id: site.id,
      listing_id: site.listing_id || "",
      site_name: site.mine_name || "",
      report_type: reportType,
      status: "Ready",
      amount: 0,
      requested_at: now,
      source_snapshot_date: now,
      notes: `Generated in-app from exact site-linked source records. Included with Professional access; no separate report charge recorded. Source freshness: ${freshnessSummary}`,
    });

    await base44.asServiceRole.entities.ReportGenerationJob.create({
      report_order_id: order.id,
      status: "Ready",
      started_at: now,
      completed_at: now,
    });

    const sourceSnapshots = [
      sourceRow(order.id, "MSHA", "MSHA mine record", site.source_url, `Mine ${site.msha_mine_id || "ID unavailable"}; status ${site.mine_status || "not recorded"}.`, "High"),
      parcel && sourceRow(order.id, "Parcel", parcel.source_name || "Parcel / tax source", parcel.source_url, `Parcel ${parcel.parcel_id}; acreage ${parcel.acreage ?? "not recorded"}.`, parcel.parcel_id ? "High" : "Medium"),
      geology && sourceRow(order.id, "Geology", geology.source_agency || "Mapped geology source", geology.source_url, `${geology.primary_rock || geology.lithology || "Mapped geology"}; confidence ${geology.confidence || "not recorded"}.`, geology.confidence || "Medium"),
      ...permits.map((p: any) => sourceRow(order.id, "TDEC", `TDEC ${p.permit_number || "permit"}`, p.source_url, `${p.permit_type || "Permit"}; status ${p.status || "not recorded"}.`, "High")),
      ...environmental.slice(0, 20).map((r: any) => sourceRow(order.id, "Environmental", `${r.agency || "Environmental"} ${r.program || "record"}`, r.source_url, `${r.record_type || r.status || "Environmental record"}.`, "Medium")),
    ].filter(Boolean);

    for (const row of sourceSnapshots) {
      try { await base44.asServiceRole.entities.ReportSourceSnapshot.create(row); } catch (_) {}
    }

    const sections = [
      ["executive", "Executive Screening Summary", `Mine status: ${site.mine_status || "not recorded"}. Commodity: ${site.commodity || "not recorded"}. Connected source layers: ${[site, parcel, geology, permits.length, production.length, inspections.length || violations.length || environmental.length].filter(Boolean).length}/7.`],
      ["mine", "Mine / MSHA Identity", `MSHA ID ${site.msha_mine_id || "not recorded"}; operator ${site.operator_name || "not recorded"}; controller ${site.controller_name || "not recorded"}.`],
      ["parcel", "Parcel / Tax", parcel ? `Parcel ${parcel.parcel_id}; owner ${parcel.owner_name || "not recorded"}; acreage ${parcel.acreage ?? "not recorded"}.` : "No connected parcel record at generation time."],
      ["geology", "Geology / Rock", geology ? `${geology.primary_rock || geology.lithology || "Mapped geology"}; formation ${geology.formation_name || "not recorded"}; confidence ${geology.confidence || "not recorded"}.` : "No connected mapped geology record at generation time."],
      ["permits", "Permits / Regulatory", `${permits.length} connected permit record(s).`],
      ["activity", "Production / Activity", `${production.length} connected production/employment record(s).`],
      ["compliance", "Environmental / Compliance", `${inspections.length} MSHA inspection(s), ${violations.length} MSHA violation(s), ${environmental.length} environmental record(s).`],
      ["freshness", "Source Freshness", freshnessSummary],
      ...(reportType === "Enhanced" ? [
        ["property_context", "Enhanced Property Context", `Coordinates ${site.latitude ?? "not recorded"}, ${site.longitude ?? "not recorded"}; mapped acreage ${parcel?.acreage ?? site.acreage ?? "not recorded"}; ownership source ${parcel?.source_name || "not connected"}.`],
        ["market_context", "Nearby / County Market Context", `${nearbySites.length} other mapped mine or quarry record(s) in ${site.county || "the same county"} included for screening context.`],
        ["access_logistics", "Access / Logistics Screening", `Site location is mapped for desktop review. Road, rail, haul-route, utility, and traffic suitability require project-specific verification and are not inferred when no connected source exists.`],
      ] : []),
    ];

    for (const [code, title, content] of sections) {
      try {
        await base44.asServiceRole.entities.ReportSectionResult.create({
          report_order_id: order.id,
          section_code: code,
          section_title: title,
          content,
          confidence: content.includes("No connected") ? "Low" : "Medium",
          status: "Generated",
          source_count: sourceSnapshots.length,
        });
      } catch (_) {}
    }

    await base44.asServiceRole.entities.ReportDelivery.create({
      report_order_id: order.id,
      user_id: user.id,
      customer_email: user.email || "",
      delivered_at: now,
      delivery_method: "In App",
      access_url: `/mines/${site.id}`,
      download_count: 1,
    });

    if (user.email) {
      try {
        await base44.asServiceRole.integrations.Core.SendEmail({
          to: user.email,
          subject: `Your S&S ${reportType} Quarry Intelligence Report is ready`,
          body: `Your ${reportType} S&S Quarry Intelligence Report for ${site.mine_name || "this site"} is ready. Sign in to S&S Rock Holdings and open the mine record to download the PDF. Report ID: ${order.id}.`,
          from_name: "S&S Rock Holdings"
        });
        await base44.asServiceRole.entities.ReportDelivery.create({
          report_order_id: order.id,
          user_id: user.id,
          customer_email: user.email,
          delivered_at: now,
          delivery_method: "Email",
          access_url: `/mines/${site.id}`,
          download_count: 0,
        });
      } catch (emailError) {
        console.error("Report email notification failed", emailError);
      }
    }

    await base44.asServiceRole.entities.ReportReview.create({
      report_order_id: order.id,
      review_status: "Ready",
      reviewer_user_id: user.role === "admin" ? user.id : "",
      reviewed_at: now,
      notes: reportType === "Enhanced" ? "Automated enhanced screening package generated from connected source data; professional verification remains required for transaction-grade conclusions." : "Automated standard screening package generated from connected source data.",
    });

    await base44.asServiceRole.entities.ReportAccessGrant.create({
      report_order_id: order.id,
      user_id: user.id,
      access_level: "Download",
      granted_at: now,
    });

    return Response.json({
      success: true,
      report_order_id: order.id,
      source_snapshot_date: now,
      payload: {
        site,
        parcel,
        geology,
        profile,
        permits,
        production,
        environmental,
        inspections,
        violations,
        freshness,
        nearby_sites: nearbySites,
        report_type: reportType,
      },
    });
  } catch (error: any) {
    console.error("build-intelligence-report error", error);
    return Response.json({ error: error?.message || String(error) }, { status: 500 });
  }
}
