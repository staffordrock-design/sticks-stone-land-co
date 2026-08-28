import { createClientFromRequest } from "npm:@base44/sdk";

function cleanName(value: unknown) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function companyKey(value: unknown) {
  return cleanName(value)
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\b(incorporated|inc|llc|l p|lp|ltd|corp|corporation|company|co)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function activeStatus(value: unknown) {
  const v = String(value ?? "").toLowerCase();
  return v.includes("active") || v.includes("new mine") || v.includes("intermittent") || v.includes("temporarily idled");
}

function quarryRelevant(site: any) {
  return !String(site?.commodity || "").toLowerCase().includes("coal");
}

async function allRows(entity: any, sort = "-updated_date") {
  const rows: any[] = [];
  for (let offset = 0; ; offset += 500) {
    const page = await entity.list(sort, 500, offset);
    rows.push(...(page || []));
    if (!page || page.length < 500) break;
  }
  return rows;
}

export default async function(req: Request) {
  const base44 = createClientFromRequest(req);
  try {
    const user = await base44.auth.me().catch(() => null);
    if (user && user.role !== "admin") return Response.json({ error: "Admin access required" }, { status: 403 });

    const now = new Date().toISOString();
    const sites = (await allRows(base44.asServiceRole.entities.MiningSite, "mine_name")).filter(quarryRelevant);
    const companyMap = new Map<string, any>();
    const links: any[] = [];

    const add = (rawName: unknown, relationshipType: "Operator" | "Controller" | "Landowner" | "Permittee", site: any) => {
      const name = cleanName(rawName);
      const key = companyKey(name);
      if (!name || !key) return;

      if (!companyMap.has(key)) {
        companyMap.set(key, {
          company_key: key,
          company_name: name,
          aliases: new Set<string>(),
          roles: new Set<string>(),
          site_ids: new Set<string>(),
          active_site_ids: new Set<string>(),
          states: new Set<string>(),
          counties: new Set<string>(),
          commodities: new Set<string>(),
          permitted_acres: 0,
          parcel_acres: 0,
        });
      }
      const company = companyMap.get(key);
      company.aliases.add(name);
      company.roles.add(relationshipType);
      if (!company.site_ids.has(site.id)) {
        company.site_ids.add(site.id);
        if (activeStatus(site.mine_status)) company.active_site_ids.add(site.id);
        if (site.state) company.states.add(site.state);
        if (site.county) company.counties.add(site.county);
        if (site.commodity) company.commodities.add(site.commodity);
        company.permitted_acres += Number(site.permitted_acres || 0);
        company.parcel_acres += Number(site.acreage || 0);
      }

      links.push({
        company_key: key,
        company_name: name,
        relationship_type: relationshipType,
        mining_site_id: site.id,
        msha_mine_id: site.msha_mine_id || undefined,
        mine_name: site.mine_name || "Quarry / Mine",
        mine_status: site.mine_status || undefined,
        active_signal: activeStatus(site.mine_status),
        commodity: site.commodity || undefined,
        state: site.state || undefined,
        county: site.county || undefined,
        operator_name: site.operator_name || undefined,
        controller_name: site.controller_name || undefined,
        landowner_name: site.parcel_owner || undefined,
        permittee_name: site.permittee_name || undefined,
        permitted_acres: site.permitted_acres ?? undefined,
        parcel_acres: site.acreage ?? undefined,
        last_built_at: now,
      });
    };

    for (const site of sites) {
      add(site.operator_name, "Operator", site);
      add(site.controller_name, "Controller", site);
      add(site.parcel_owner, "Landowner", site);
      add(site.permittee_name, "Permittee", site);
    }

    const companies = Array.from(companyMap.values()).map((company) => ({
      company_key: company.company_key,
      company_name: company.company_name,
      aliases: Array.from(company.aliases),
      roles: Array.from(company.roles),
      site_count: company.site_ids.size,
      active_site_count: company.active_site_ids.size,
      states: Array.from(company.states),
      counties: Array.from(company.counties),
      commodities: Array.from(company.commodities),
      permitted_acres: Number(company.permitted_acres || 0),
      parcel_acres: Number(company.parcel_acres || 0),
      last_built_at: now,
    }));

    const existingCompanies = await allRows(base44.asServiceRole.entities.QuarryNetworkCompany, "company_key");
    const companyByKey = new Map(existingCompanies.map((row: any) => [row.company_key, row]));
    const companiesToCreate: any[] = [];
    const companiesToUpdate: any[] = [];
    for (const company of companies) {
      const existing = companyByKey.get(company.company_key);
      if (existing) companiesToUpdate.push({ id: existing.id, ...company });
      else companiesToCreate.push(company);
    }
    for (let i = 0; i < companiesToCreate.length; i += 500) await base44.asServiceRole.entities.QuarryNetworkCompany.bulkCreate(companiesToCreate.slice(i, i + 500));
    for (let i = 0; i < companiesToUpdate.length; i += 500) await base44.asServiceRole.entities.QuarryNetworkCompany.bulkUpdate(companiesToUpdate.slice(i, i + 500));

    const existingLinks = await allRows(base44.asServiceRole.entities.QuarryNetworkLink, "company_key");
    const linkKey = (row: any) => `${row.company_key}|${row.relationship_type}|${row.mining_site_id}`;
    const existingLinkMap = new Map(existingLinks.map((row: any) => [linkKey(row), row]));
    const linksToCreate: any[] = [];
    const linksToUpdate: any[] = [];
    for (const link of links) {
      const existing = existingLinkMap.get(linkKey(link));
      if (existing) linksToUpdate.push({ id: existing.id, ...link });
      else linksToCreate.push(link);
    }
    for (let i = 0; i < linksToCreate.length; i += 500) await base44.asServiceRole.entities.QuarryNetworkLink.bulkCreate(linksToCreate.slice(i, i + 500));
    for (let i = 0; i < linksToUpdate.length; i += 500) await base44.asServiceRole.entities.QuarryNetworkLink.bulkUpdate(linksToUpdate.slice(i, i + 500));

    return Response.json({
      success: true,
      quarry_records_scanned: sites.length,
      companies_indexed: companies.length,
      links_indexed: links.length,
      companies_created: companiesToCreate.length,
      companies_updated: companiesToUpdate.length,
      links_created: linksToCreate.length,
      links_updated: linksToUpdate.length,
      built_at: now,
    });
  } catch (error: any) {
    console.error("build-quarry-network-index error", error);
    return Response.json({ success: false, error: error?.message || String(error) }, { status: 500 });
  }
}
