function text(value, fallback = "Not available from connected source") {
  if (value === null || value === undefined || value === "") return fallback;
  return String(value);
}

function money(value) {
  if (value === null || value === undefined || value === "" || Number.isNaN(Number(value))) return "Not available";
  return Number(value).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

function date(value) {
  if (!value) return "Not recorded";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

export async function generateQuarryReportPdf({ site, parcel, geology, profile, permits = [], production = [], environmental = [], inspections = [], violations = [], valuation, sourceSnapshotDate = new Date().toISOString(), reportType = "Standard", freshness = {}, nearbySites = [] }) {
  const { default: jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const width = doc.internal.pageSize.getWidth();
  const height = doc.internal.pageSize.getHeight();
  const margin = 48;
  const maxWidth = width - margin * 2;
  let y = 54;

  const ensure = (needed = 48) => {
    if (y + needed > height - 48) {
      doc.addPage();
      y = 54;
    }
  };

  const line = (value, options = {}) => {
    const { size = 10, bold = false, gap = 5, indent = 0 } = options;
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.setFontSize(size);
    const parts = doc.splitTextToSize(text(value, "—"), maxWidth - indent);
    ensure(parts.length * (size + 3) + gap);
    doc.text(parts, margin + indent, y);
    y += parts.length * (size + 3) + gap;
  };

  const heading = (value) => {
    ensure(44);
    y += 9;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.text(value, margin, y);
    y += 20;
  };

  const row = (label, value) => {
    ensure(28);
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.text(`${label}:`, margin, y);
    doc.setFont("helvetica", "normal");
    const parts = doc.splitTextToSize(text(value), maxWidth - 145);
    doc.text(parts, margin + 140, y);
    y += Math.max(16, parts.length * 12 + 3);
  };

  const primaryPermit = permits.find((p) => Number(p?.permitted_acres) > 0) || permits[0] || null;
  const landOwner = parcel?.owner_name || site?.parcel_owner || primaryPermit?.landowner_name;
  const permitOperator = primaryPermit?.operator_name && !/pending|unknown|verify|requires verification/i.test(primaryPermit.operator_name) ? primaryPermit.operator_name : null;
  const operator = permitOperator || site?.operator_name;
  const permittee = primaryPermit?.permittee_name || site?.permittee_name;
  const permittedAcreage = primaryPermit?.permitted_acres ?? site?.permitted_acres;
  const permitAcreageBasis = primaryPermit?.acreage_basis || site?.permitted_acres_basis;
  const parcelAcreage = parcel?.acreage ?? site?.acreage;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("S&S ROCK HOLDINGS LLC", margin, y);
  y += 18;
  doc.setFontSize(22);
  doc.text(`${reportType} Quarry Intelligence Report`, margin, y);
  y += 27;
  line(site?.mine_name || "Mine / Quarry Site", { size: 15, bold: true, gap: 3 });
  line([site?.city, site?.county, site?.state].filter(Boolean).join(" · ") || "Location not recorded", { size: 10 });
  line(`Report generated: ${date(sourceSnapshotDate)} · S&S source-backed screening intelligence`, { size: 9 });

  heading("Executive Screening Summary");
  row("Mine status", site?.mine_status);
  row("Record classification", site?.is_verified_listing ? "Verified listing" : "Public-source mine record");
  row("Commodity", site?.commodity);
  row("MSHA ID", site?.msha_mine_id);
  row("TDEC permit", site?.tdec_permit_number);
  row("Land owner", landOwner);
  row("Operator", operator);
  row("Permittee", permittee);
  row("Permitted acres", Number(permittedAcreage) > 0 ? Number(permittedAcreage).toLocaleString() : "Not loaded from controlling permit");
  row("Permit acreage basis", permitAcreageBasis);
  row("Parcel", parcel?.parcel_id || site?.parcel_id);
  row("Parcel acreage", parcelAcreage);
  row("Data confidence", profile?.confidence || geology?.confidence || "Varies by source layer");
  if (valuation?.available && valuation?.confidence !== "Low") row("Indicative land-value screening range", `${money(valuation.low)} – ${money(valuation.high)} (${valuation.confidence || "screening"} confidence)`);
  else row("Value estimate", "Withheld until source-backed inputs support more than low confidence");

  heading("Mine / Operating Record");
  row("Mine name", site?.mine_name);
  row("Mine type", site?.mine_type);
  row("Operator", operator);
  row("Permittee", permittee);
  row("Controller", site?.controller_name);
  row("Address", [site?.address, site?.city, site?.state, site?.zip].filter(Boolean).join(", "));
  row("Source", site?.source);
  row("Source updated", date(site?.last_source_update));
  row("Source URL", site?.source_url);

  heading("Parcel & Tax Intelligence");
  row("Parcel ID", parcel?.parcel_id || site?.parcel_id);
  row("Owner", landOwner);
  row("Property address", parcel?.property_address);
  row("Mailing address", parcel?.mailing_address);
  row("Parcel acreage", parcelAcreage);
  row("Permitted acreage", Number(permittedAcreage) > 0 ? Number(permittedAcreage).toLocaleString() : "Not loaded from controlling permit");
  row("Assessed value", money(parcel?.assessed_value));
  row("Land value", money(parcel?.land_value));
  row("Improvement value", money(parcel?.improvement_value));
  row("Deed book/page", parcel?.deed_book_page);
  row("Source", parcel?.source_name);
  row("Source updated", date(parcel?.last_source_update));
  row("Source URL", parcel?.source_url);

  heading("Geology / Rock Intelligence");
  row("Primary rock", geology?.primary_rock);
  row("Secondary rock", geology?.secondary_rock);
  row("Formation", geology?.formation_name);
  row("Geologic unit", geology?.geologic_unit);
  row("Geologic age", geology?.geologic_age);
  row("Lithology", geology?.lithology);
  row("Commodity interpretation", geology?.commodity_interpretation);
  row("Confidence", geology?.confidence);
  row("Source agency", geology?.source_agency);
  row("Source updated", date(geology?.last_source_update));
  row("Source URL", geology?.source_url);

  heading("Derived Screening Analysis");
  row("Screening score", profile?.screening_score);
  row("Screening band", profile?.screening_band);
  row("Geology score", profile?.geology_score);
  row("Access score", profile?.access_score);
  row("Regulatory score", profile?.regulatory_score);
  row("Market score", profile?.market_score);
  row("Parcel score", profile?.parcel_score);
  row("Basis", profile?.basis_summary);
  row("Limitations", profile?.limitations);
  row("Last scored", date(profile?.last_scored));

  heading("Permit / Regulatory Intelligence");
  if (!permits.length) line("No connected TDEC permit records were available for this site at generation time.");
  permits.forEach((p, i) => {
    line(`${i + 1}. ${text(p.permit_number, "Permit")}${p.permit_type ? ` · ${p.permit_type}` : ""}`, { bold: true });
    line(`Status: ${text(p.status)} · Permittee: ${text(p.permittee_name)} · Operator: ${text(p.operator_name || operator)} · Effective: ${date(p.effective_date)} · Expires: ${date(p.expiration_date)}`);
    line(`Land owner: ${text(p.landowner_name || landOwner)} · Permitted acres: ${Number(p.permitted_acres ?? site?.permitted_acres) > 0 ? Number(p.permitted_acres ?? site?.permitted_acres).toLocaleString() : "not loaded"} · Basis: ${text(p.acreage_basis || site?.permitted_acres_basis)}`);
    if (p.source_url) line(`Source: ${p.source_url}`, { size: 8 });
  });

  heading("Production / Activity History");
  if (!production.length) line("No connected production/employment records were available for this site at generation time.");
  production.slice(0, 20).forEach((p) => {
    line(`${text(p.year, "Year unknown")}${p.period ? ` ${p.period}` : ""} · Production: ${p.production_amount == null ? "not reported" : Number(p.production_amount).toLocaleString()} ${text(p.production_unit, "")}`.trim(), { bold: true });
    line(`Employee hours: ${p.employee_hours == null ? "—" : Number(p.employee_hours).toLocaleString()} · Average employees: ${text(p.average_employees, "—")} · Source: ${text(p.source_agency)}`);
    if (p.notes) line(p.notes, { size: 8 });
  });

  heading("Environmental / Compliance Screening");
  row("Environmental records", environmental.length);
  row("MSHA inspections", inspections.length);
  row("MSHA violations", violations.length);
  environmental.slice(0, 10).forEach((r, i) => line(`${i + 1}. ${text(r.agency)} · ${text(r.program)} · ${text(r.record_type || r.status)} · ${date(r.issue_date || r.effective_date)}${r.penalty_amount ? ` · Penalty ${money(r.penalty_amount)}` : ""}`));
  violations.slice(0, 10).forEach((r, i) => line(`MSHA violation ${i + 1}: ${text(r.violation_number)} · ${date(r.issue_date)} · Standard ${text(r.standard)}${r.assessment_amount ? ` · Assessment ${money(r.assessment_amount)}` : ""}`));

  heading("Source Freshness");
  ["MSHA", "TDEC", "Geology", "Parcel", "Tax", "Environmental"].forEach((key) => {
    const rowData = freshness?.[key];
    row(key, rowData ? `${rowData.status || "Unknown"} · last sync ${date(rowData.last_sync_at)}` : "Unknown / not yet evaluated");
  });

  if (reportType === "Enhanced") {
    heading("Enhanced Property Context");
    row("Coordinates", site?.latitude != null && site?.longitude != null ? `${site.latitude}, ${site.longitude}` : null);
    row("Parcel acreage", parcelAcreage);
    row("Permitted acreage", Number(permittedAcreage) > 0 ? Number(permittedAcreage).toLocaleString() : "Not loaded from controlling permit");
    row("Ownership source", parcel?.source_name);
    row("Current owner field", landOwner);
    row("Current operator field", operator);
    line("This section summarizes connected desktop property context. It does not replace a survey, title examination, access agreement review, or field inspection.", { size: 9 });

    heading("Nearby / County Market Context");
    if (!nearbySites.length) line("No additional mapped mine or quarry records were connected for the same county at generation time.");
    nearbySites.slice(0, 15).forEach((n, i) => line(`${i + 1}. ${text(n.mine_name)} · ${text(n.mine_status)} · ${text(n.commodity)} · ${text(n.operator_name)}`));

    heading("Access / Logistics Screening");
    line("The site is mapped for desktop review, but road suitability, legal access, haul-route restrictions, bridge limits, rail access, utilities, traffic impacts, and transportation economics are not inferred when no connected source exists. These items require project-specific verification.");
  }

  heading("Source & Reliability Notes");
  line("This report separates official-source facts from S&S-derived screening analysis. Missing fields are intentionally left unavailable rather than guessed. MSHA Mine ID is treated as the unique key for mine identity; Tennessee mining permits should be confirmed against the controlling TDEC/DMGR record. Public records can lag real-world changes, so parcel, ownership, permitting, environmental, operating, and market conditions should be independently verified before a transaction or investment decision.");
  if (site?.source_url) line(`Mine source: ${site.source_url}`, { size: 8 });
  if (parcel?.source_url) line(`Parcel/tax source: ${parcel.source_url}`, { size: 8 });
  if (geology?.source_url) line(`Geology source: ${geology.source_url}`, { size: 8 });
  permits.filter((p) => p.source_url).slice(0, 10).forEach((p) => line(`Permit source: ${p.source_url}`, { size: 8 }));

  heading("Important Disclaimer");
  line("S&S Quarry Intelligence Reports are business-intelligence screening products. They are not certified reserve estimates, geological or engineering opinions, surveys, title opinions, appraisals, environmental assessments, legal advice, permit determinations, laboratory results, or guarantees of economically recoverable material. Buyers, owners, lenders, and operators should use appropriate licensed professionals and official records for transaction-grade due diligence.", { size: 9 });

  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i += 1) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.text(`S&S Rock Holdings LLC · ${reportType} Quarry Intelligence Report · Page ${i} of ${pages}`, margin, height - 24);
  }

  const safeName = String(site?.mine_name || "quarry").replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase();
  const filename = `SS-${reportType}-Quarry-Intelligence-${safeName || "report"}-${new Date().toISOString().slice(0, 10)}.pdf`;
  doc.save(filename);
  return filename;
}