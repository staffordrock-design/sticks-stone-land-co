import React, { useEffect, useMemo, useState, lazy, Suspense } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
const ParcelMap = lazy(() => import("@/components/ParcelMap"));
import { ArrowLeft, BarChart3, Camera, DollarSign, Download, ExternalLink, FileSearch, Gauge, Gem, Landmark, Leaf, MapPinned, ShieldCheck, LockKeyhole, CheckCircle2, AlertTriangle, FileKey2, Mountain, TrendingUp } from "lucide-react";
import { calculateIndicativeQuarryValue, formatCompactMoney } from "@/utils/quarryValuation";
import { calculateOpportunityScore } from "@/utils/opportunityScore";
import { generateQuarryReportPdf } from "@/utils/generateQuarryReportPdf";
import { classifyRock, rockQualityTier } from "../../base44/shared/rockTypes.js";
import { useAuth } from "@/lib/AuthContext";
import { isReviewDemoMode } from "@/lib/reviewDemo";
import { currentAppleSubscriptionAccess, isNativeIOS } from "@/lib/appleSubscriptions";
import productionEstimatesQ1 from "@/data/productionEstimatesQ1_2026.json";
import { isPlausibleSoutheastCoordinate } from "@/utils/coordinates";
import QuarryActionBar from "@/components/QuarryActionBar";
import MarketValuationChart from "@/components/MarketValuationChart";

function worldImageryTile(lat, lng, state, zoom = 15) {
  if (!isPlausibleSoutheastCoordinate(lat, lng, state)) return null;
  const z = Math.max(1, Math.min(19, zoom));
  const n = 2 ** z;
  const x = Math.floor(((Number(lng) + 180) / 360) * n);
  const latRad = (Number(lat) * Math.PI) / 180;
  const y = Math.floor((1 - Math.asinh(Math.tan(latRad)) / Math.PI) / 2 * n);
  return `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`; // Esri cached imagery tile endpoint
}

function sameValue(a, b) {
  if (a == null || b == null || a === "" || b === "") return false;
  return String(a).trim().toLowerCase() === String(b).trim().toLowerCase();
}

function recordStatusLabel(site) {
  if (site?.is_verified_listing && site?.listing_id) return "Verified Listing";
  const s = String(site?.mine_status || "").toLowerCase();
  if (s.includes("intermittent") || s.includes("temporarily idled") || s.includes("nonproducing") || s.includes("non-producing") || s.includes("inactive")) return "Inactive / Idled Mine Record";
  if (s.includes("historical") || s.includes("abandon")) return "Historical Mine Record";
  if (s.includes("new mine")) return "New Mine Record";
  if (s.includes("active")) return "Active Mine Record";
  return "Public Mine Record";
}

function money(value) {
  if (value == null || value === "") return "—";
  return Number(value).toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

function displayDate(value) {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

function compactNumber(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(n);
}

function productionCommodityGroup(site) {
  const text = `${site?.commodity || ""} ${site?.mine_name || ""}`.toLowerCase();
  if (text.includes("dimension stone") || text.includes("dimension sandstone") || text.includes("dimension limestone") || text.includes("fieldstone")) return null;
  if (/construction sand.{0,8}gravel|sand\s*(and|&)\s*gravel/.test(text)) return "Construction Sand and Gravel";
  if (/crushed|broken|aggregate|limestone|dolomite|granite|traprock|quartzite|chert|shale|marble/.test(text)) return "Crushed Stone";
  return null;
}

function Card({ title, icon: Icon, children }) {
  return (
    <section className="rounded-2xl border border-border bg-card p-6">
      <div className="mb-4 flex items-center gap-2">
        <Icon className="h-5 w-5 text-sky-700" />
        <h2 className="font-heading text-lg font-bold text-foreground">{title}</h2>
      </div>
      {children}
    </section>
  );
}

function Row({ label, value }) {
  return (
    <div className="grid grid-cols-[130px_1fr] gap-3 border-b border-border/60 py-2.5 last:border-0">
      <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="text-sm text-foreground">{value || "—"}</div>
    </div>
  );
}

export default function MineSiteDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [site, setSite] = useState(null);
  const [parcels, setParcels] = useState([]);
  const [permits, setPermits] = useState([]);
  const [environmental, setEnvironmental] = useState([]);
  const [inspections, setInspections] = useState([]);
  const [violations, setViolations] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [production, setProduction] = useState([]);
  const [geology, setGeology] = useState([]);
  const [contracts, setContracts] = useState([]);
  const [usgsOccurrences, setUsgsOccurrences] = useState([]);
  const [usgsMarketProduction, setUsgsMarketProduction] = useState([]);
  const [liveParcel, setLiveParcel] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reportGenerating, setReportGenerating] = useState(false);
  const [reportMessage, setReportMessage] = useState("");
  const [showAllRecords, setShowAllRecords] = useState(false);
  const [hasProfessional, setHasProfessional] = useState(user?.role === "admin" || isReviewDemoMode());

  useEffect(() => {
    let cancelled = false;
    if (user?.role === "admin" || isReviewDemoMode()) {
      setHasProfessional(true);
      return () => { cancelled = true; };
    }
    (async () => {
      try {
        let appleProfessional = false;
        if (isNativeIOS()) {
          try {
            const access = await currentAppleSubscriptionAccess();
            appleProfessional = Boolean(access?.professional);
          } catch (error) {
            console.error("Apple professional entitlement check failed", error);
          }
        }

        if (!user?.id) {
          if (!cancelled) setHasProfessional(appleProfessional);
          return;
        }

        const rows = await base44.entities.SubscriptionEntitlement.filter({ user_id: user.id }, "-updated_date", 20);
        const activeProfessional = (rows || []).some((e) =>
          ["active", "trial", "grace_period"].includes(e.status) &&
          (/^professional(_|$)/.test(String(e.plan_code || "")) || /^deal_investor(_|$)/.test(String(e.plan_code || ""))) &&
          (!e.expires_at || new Date(e.expires_at).getTime() > Date.now())
        );
        if (!cancelled) setHasProfessional(appleProfessional || activeProfessional);
      } catch {
        if (!cancelled) setHasProfessional(false);
      }
    })();
    return () => { cancelled = true; };
  }, [user?.id, user?.role]);

  useEffect(() => {
    (async () => {
      try {
        const mine = await base44.entities.MiningSite.get(id);
        setSite(mine);

        const siteId = mine.id;
        const mshaId = mine.msha_mine_id;
        const parcelId = mine.parcel_id;
        const tdecPermit = mine.tdec_permit_number;
        const npdesPermit = mine.npdes_permit_number;

        // Targeted queries by link fields instead of bulk-loading 500 of every entity.
        // This finds connected data regardless of total record count.
        const linkOr = (extra = []) => {
          const conditions = [{ mining_site_id: siteId }];
          if (mshaId) conditions.push({ msha_mine_id: mshaId });
          conditions.push(...extra.filter(Boolean));
          return { $or: conditions };
        };

        const [parcelData, permitData, envData, inspectionData, violationData, profileData, productionData, geologyData, contractData, usgsData, usgsMarketData] = await Promise.all([
          base44.entities.ParcelRecord.filter(linkOr([parcelId ? { parcel_id: parcelId } : null, tdecPermit ? { tdec_permit_number: tdecPermit } : null]), "-updated_date", 50),
          base44.entities.TDECPermit.filter(linkOr([tdecPermit ? { permit_number: tdecPermit } : null]), "-updated_date", 50),
          base44.entities.EnvironmentalRecord.filter(linkOr([npdesPermit ? { npdes_permit_number: npdesPermit } : null]), "-updated_date", 50),
          base44.entities.MSHAInspection.filter(mshaId ? { msha_mine_id: mshaId } : { mining_site_id: siteId }, "-updated_date", showAllRecords ? 500 : 100),
          base44.entities.MSHAViolation.filter(mshaId ? { msha_mine_id: mshaId } : { mining_site_id: siteId }, "-updated_date", showAllRecords ? 500 : 100),
          base44.entities.QuarryPotentialProfile.filter(linkOr(), "-updated_date", 10),
          base44.entities.ProductionRecord.filter(linkOr(), "-year", showAllRecords ? 500 : 100),
          base44.entities.GeologyRecord.filter(linkOr([parcelId ? { parcel_id: parcelId } : null]), "-updated_date", 50),
          base44.entities.ContractIntelligence.filter(linkOr([parcelId ? { parcel_id: parcelId } : null]), "-updated_date", 50),
          base44.entities.USGSMineralOccurrence.filter(linkOr(), "-updated_date", 20),
          base44.entities.USGSMarketProduction.filter({ state: String(mine.state || "").toUpperCase() }, "-year", 20),
        ]);

        setParcels(parcelData || []);
        setPermits(permitData || []);
        setEnvironmental(envData || []);
        setInspections(inspectionData || []);
        setViolations(violationData || []);
        setProfiles(profileData || []);
        setProduction(productionData || []);
        setGeology(geologyData || []);
        setContracts(contractData || []);
        setUsgsOccurrences(usgsData || []);
        setUsgsMarketProduction(usgsMarketData || []);
      } catch (e) {
        setError(e?.message || "Unable to load site intelligence.");
      } finally {
        setLoading(false);
      }
    })();
  }, [id, showAllRecords]);

  const parcel = useMemo(() => {
    if (!site) return null;
    return parcels.find((p) =>
      sameValue(p.parcel_id, site.parcel_id) ||
      sameValue(p.msha_mine_id, site.msha_mine_id) ||
      sameValue(p.tdec_permit_number, site.tdec_permit_number)
    ) || null;
  }, [site, parcels]);

  const relatedPermits = useMemo(() => {
    if (!site) return [];
    return permits.filter((p) =>
      sameValue(p.permit_number, site.tdec_permit_number) ||
      sameValue(p.msha_mine_id, site.msha_mine_id) ||
      (sameValue(p.county, site.county) && sameValue(p.facility_name, site.mine_name))
    );
  }, [site, permits]);

  const relatedEnvironmental = useMemo(() => {
    if (!site) return [];
    return environmental.filter((r) =>
      sameValue(r.msha_mine_id, site.msha_mine_id) ||
      sameValue(r.npdes_permit_number, site.npdes_permit_number) ||
      (sameValue(r.county, site.county) && sameValue(r.facility_name, site.mine_name))
    );
  }, [site, environmental]);

  const relatedInspections = useMemo(
    () => site?.msha_mine_id ? inspections.filter((r) => sameValue(r.msha_mine_id, site.msha_mine_id)) : [],
    [site, inspections]
  );

  const relatedViolations = useMemo(
    () => site?.msha_mine_id ? violations.filter((r) => sameValue(r.msha_mine_id, site.msha_mine_id)) : [],
    [site, violations]
  );

  const profile = useMemo(() => {
    if (!site) return null;
    return profiles.find((p) => sameValue(p.mining_site_id, site.id) || sameValue(p.msha_mine_id, site.msha_mine_id)) || null;
  }, [site, profiles]);

  const relatedProduction = useMemo(() => {
    if (!site) return [];
    return production.filter((r) =>
      sameValue(r.mining_site_id, site.id) ||
      sameValue(r.msha_mine_id, site.msha_mine_id)
    );
  }, [site, production]);

  const fallbackEstimate = useMemo(() => {
    if (!site) return null;
    return productionEstimatesQ1.find((r) =>
      sameValue(r.mining_site_id, site.id) || sameValue(r.msha_mine_id, site.msha_mine_id)
    ) || null;
  }, [site]);

  const meaningfulProduction = useMemo(() => {
    const rows = relatedProduction.filter((r) =>
      r.record_type || r.production_amount != null || r.employee_hours != null || r.average_employees != null
    );
    const hasStoredEstimate = rows.some((r) => r.record_type === "S&S Estimate" || r.is_estimate);
    return !hasStoredEstimate && fallbackEstimate ? [...rows, fallbackEstimate] : rows;
  }, [relatedProduction, fallbackEstimate]);

  const latestEstimate = useMemo(() => {
    return meaningfulProduction
      .filter((r) => r.record_type === "S&S Estimate" || r.is_estimate)
      .sort((a, b) => Number(b.year || 0) - Number(a.year || 0) || Number(String(b.period || "").replace(/\D/g, "") || 0) - Number(String(a.period || "").replace(/\D/g, "") || 0))[0] || null;
  }, [meaningfulProduction]);

  const latestActivity = useMemo(() => {
    return meaningfulProduction
      .filter((r) => r.record_type === "MSHA Activity")
      .sort((a, b) => Number(b.year || 0) - Number(a.year || 0) || Number(String(b.period || "").replace(/\D/g, "") || 0) - Number(String(a.period || "").replace(/\D/g, "") || 0))[0] || null;
  }, [meaningfulProduction]);

  const siteProductionGroup = productionCommodityGroup(site);
  const relevantMarketProduction = useMemo(() => {
    if (!siteProductionGroup) return null;
    return [...usgsMarketProduction]
      .filter((r) => r.commodity_group === siteProductionGroup)
      .sort((a, b) => Number(b.year || 0) - Number(a.year || 0) || Number(String(b.period || "").replace(/\D/g, "") || 0) - Number(String(a.period || "").replace(/\D/g, "") || 0))[0] || null;
  }, [usgsMarketProduction, siteProductionGroup]);

  const geologyRecord = useMemo(() => {
    if (!site) return null;
    return geology.find((r) =>
      sameValue(r.mining_site_id, site.id) ||
      sameValue(r.msha_mine_id, site.msha_mine_id) ||
      sameValue(r.parcel_id, site.parcel_id)
    ) || null;
  }, [site, geology]);

  const relatedContracts = useMemo(() => {
    if (!site) return [];
    return contracts.filter((r) =>
      sameValue(r.mining_site_id, site.id) ||
      sameValue(r.msha_mine_id, site.msha_mine_id) ||
      sameValue(r.parcel_id, site.parcel_id) ||
      (sameValue(r.county, site.county) && sameValue(r.mine_name, site.mine_name))
    );
  }, [site, contracts]);

  const relatedUsgsOccurrences = useMemo(() => {
    if (!site) return [];
    return usgsOccurrences.filter((r) =>
      sameValue(r.mining_site_id, site.id) ||
      sameValue(r.msha_mine_id, site.msha_mine_id)
    );
  }, [site, usgsOccurrences]);

  useEffect(() => {
    if (!site || parcel?.boundary_polygon?.length >= 3) return;
    const lat = site.latitude ?? parcel?.latitude;
    const lng = site.longitude ?? parcel?.longitude;
    if (!Number.isFinite(Number(lat)) || !Number.isFinite(Number(lng))) return;
    (async () => {
      try {
        const response = await base44.functions.invoke("fetch-parcel-data", { lat: Number(lat), lng: Number(lng), state: site.state || "TN" });
        const data = response?.data || response;
        if (data?.boundary?.length >= 3) setLiveParcel(data);
      } catch {
        // Stored parcel data remains authoritative when live lookup is unavailable.
      }
    })();
  }, [site, parcel]);

  if (loading) return <div className="min-h-screen bg-background p-10 text-center text-muted-foreground">Loading site intelligence…</div>;
  if (error || !site) return <div className="min-h-screen bg-background p-10 text-center text-destructive">{error || "Site not found."}</div>;

  const siteCoordinatesValid = isPlausibleSoutheastCoordinate(site.latitude, site.longitude, site.state);
  const parcelCoordinatesValid = isPlausibleSoutheastCoordinate(parcel?.latitude, parcel?.longitude, site.state);
  const mapLat = siteCoordinatesValid ? site.latitude : parcelCoordinatesValid ? parcel.latitude : null;
  const mapLng = siteCoordinatesValid ? site.longitude : parcelCoordinatesValid ? parcel.longitude : null;
  const primaryPermit = relatedPermits.find((p) => Number(p?.permitted_acres) > 0) || relatedPermits[0] || null;
  const landOwner = parcel?.owner_name || site.parcel_owner || primaryPermit?.landowner_name || null;
  const siteOperator = site.operator_name && !/pending|unknown|verify|requires verification/i.test(site.operator_name) ? site.operator_name : null;
  const permitOperator = primaryPermit?.operator_name && !/pending|unknown|verify|requires verification/i.test(primaryPermit.operator_name) ? primaryPermit.operator_name : null;
  const operator = siteOperator || permitOperator || null;
  const permittee = primaryPermit?.permittee_name || site.permittee_name || null;
  const permittedAcreage = primaryPermit?.permitted_acres ?? site.permitted_acres;
  const permitAcreageBasis = primaryPermit?.acreage_basis || site.permitted_acres_basis || null;
  const parcelAcreage = parcel?.acreage ?? liveParcel?.acreage ?? site.acreage;
  const valuation = calculateIndicativeQuarryValue({ site, parcel, profile, geology: geologyRecord });
  const opportunity = calculateOpportunityScore({ site, parcel, geology: geologyRecord, permits: relatedPermits, environmental: relatedEnvironmental, profile });
  const aerialPreview = worldImageryTile(mapLat, mapLng, site.state);
  const diligence = [
    { label: "Mine / operating record", ready: Boolean(site.msha_mine_id || site.mine_status), detail: site.msha_mine_id ? `MSHA ${site.msha_mine_id}` : site.mine_status },
    { label: "Parcel / tax record", ready: Boolean(parcel), detail: parcel?.parcel_id || "Parcel linkage pending" },
    { label: "GIS boundary", ready: Boolean(parcel?.boundary_polygon?.length >= 3 || liveParcel?.boundary?.length >= 3), detail: (parcel?.boundary_polygon?.length >= 3 || liveParcel?.boundary?.length >= 3) ? "Boundary available" : "Boundary pending" },
    { label: "Geology / rock intelligence", ready: Boolean(geologyRecord), detail: geologyRecord?.primary_rock || geologyRecord?.lithology || "Geology linkage pending" },
    { label: "Permit / regulatory record", ready: Boolean(relatedPermits.length), detail: relatedPermits.length ? `${relatedPermits.length} connected record${relatedPermits.length === 1 ? "" : "s"}` : "Permit linkage pending" },
    { label: "Owner / operator / permitted footprint", ready: Boolean(landOwner && operator && Number(permittedAcreage) > 0), detail: `${landOwner || "owner pending"} · ${operator || "operator pending"} · ${Number(permittedAcreage) > 0 ? `${Number(permittedAcreage).toLocaleString()} permitted ac` : "permit acreage pending"}` },
    { label: "Production intelligence", ready: Boolean(latestActivity || latestEstimate), detail: latestEstimate ? `S&S modeled range available · ${latestEstimate.confidence || "Low"} confidence` : latestActivity ? `${Number(latestActivity.employee_hours || 0).toLocaleString()} MSHA employee hours connected` : "Current MSHA activity / modeled production pending" },
    { label: "Compliance history", ready: Boolean(relatedInspections.length || relatedViolations.length || relatedEnvironmental.length), detail: `${relatedInspections.length} inspections · ${relatedViolations.length} violations · ${relatedEnvironmental.length} environmental` },
    { label: "Contract / royalty intelligence", ready: Boolean(relatedContracts.length), detail: relatedContracts.length ? `${relatedContracts.length} agreement record${relatedContracts.length === 1 ? "" : "s"}` : "Lease / royalty terms not connected" },
    { label: "USGS mineral intelligence", ready: Boolean(relatedUsgsOccurrences.length), detail: relatedUsgsOccurrences.length ? `${relatedUsgsOccurrences.length} MRDS occurrence${relatedUsgsOccurrences.length === 1 ? "" : "s"}` : "USGS MRDS linkage pending" },
  ];
  const diligenceReady = diligence.filter((item) => item.ready).length;
  const diligencePct = Math.round((diligenceReady / diligence.length) * 100);

  const downloadIntelligenceReport = async (reportType = "Standard") => {
    setReportGenerating(true);
    setReportMessage("");
    try {
      const allowed = user?.role === "admin";
      if (!allowed) {
        if (!user?.id) {
          navigate(`/login?returnTo=${encodeURIComponent(`/mines/${site.id}`)}`);
          return;
        }

        const amount = reportType === "Enhanced" ? 389 : 189;
        const existing = await base44.entities.IntelligenceReportOrder.filter({
          user_id: user.id,
          mining_site_id: site.id,
          report_type: reportType,
          status: "Pending Payment",
        }, "-created_date", 1);

        const order = existing?.[0] || await base44.entities.IntelligenceReportOrder.create({
          user_id: user.id,
          customer_email: user.email || "",
          mining_site_id: site.id,
          listing_id: site.listing_id || "",
          site_name: site.mine_name || "",
          report_type: reportType,
          status: "Pending Payment",
          amount,
          requested_at: new Date().toISOString(),
          notes: `${reportType} report requested from the mine detail page. S&S payment and fulfillment follow-up required.`,
        });

        setReportMessage(`${reportType} report request received for $${amount}. S&S will contact ${user.email || "your account email"} with payment and delivery details. Order ${order.id}.`);
        return;
      }

      const response = await base44.functions.invoke("build-intelligence-report", { mining_site_id: site.id, report_type: reportType });
      const result = response?.data || response;
      if (!result?.success || !result?.payload?.site) throw new Error(result?.error || "Report package could not be assembled.");
      const p = result.payload;
      const packagedValuation = calculateIndicativeQuarryValue({ site: p.site, parcel: p.parcel, profile: p.profile, geology: p.geology });
      await generateQuarryReportPdf({
        site: p.site,
        parcel: p.parcel,
        geology: p.geology,
        profile: p.profile,
        permits: p.permits || [],
        production: p.production || [],
        environmental: p.environmental || [],
        inspections: p.inspections || [],
        violations: p.violations || [],
        valuation: packagedValuation,
        sourceSnapshotDate: result.source_snapshot_date,
        reportType: p.report_type || reportType,
        freshness: p.freshness || {},
        nearbySites: p.nearby_sites || [],
      });
      setReportMessage(`PDF generated and logged as report ${result.report_order_id}.`);
    } catch (e) {
      setReportMessage(e?.message || "Unable to generate the PDF report.");
    } finally {
      setReportGenerating(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-background/90 backdrop-blur" style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}>
        <div className="mx-auto max-w-7xl px-6 pb-4">
          <button onClick={() => navigate(-1)} className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" /> Back to Tennessee map
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-10">
        <div className="mb-8 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">S&amp;S Quarry Intelligence Report</p>
            <h1 className="mt-2 font-heading text-3xl font-bold tracking-tight text-foreground sm:text-4xl">{site.mine_name}</h1>
            <p className="mt-2 text-muted-foreground">{[site.city, site.county, site.state].filter(Boolean).join(" · ")}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {(!isNativeIOS() || user?.role === "admin") ? <>
              <button onClick={() => downloadIntelligenceReport("Standard")} disabled={reportGenerating} className="inline-flex items-center gap-2 rounded-xl bg-sky-500 px-4 py-2 text-xs font-bold text-stone-950 transition hover:bg-sky-400 disabled:opacity-60"><Download className="h-4 w-4" />{reportGenerating ? "Working…" : "Standard report · $189"}</button>
              <button onClick={() => downloadIntelligenceReport("Enhanced")} disabled={reportGenerating} className="inline-flex items-center gap-2 rounded-xl border border-sky-400 bg-stone-950 px-4 py-2 text-xs font-bold text-sky-300 transition hover:bg-stone-900 disabled:opacity-60"><Download className="h-4 w-4" />{reportGenerating ? "Working…" : "Enhanced report · $389"}</button>
            </> : <button onClick={() => navigate("/support")} className="inline-flex items-center gap-2 rounded-xl border border-sky-300 bg-sky-50 px-4 py-2 text-xs font-bold text-sky-950"><FileSearch className="h-4 w-4" />Custom research services</button>}
            <span className="rounded-full bg-stone-900 px-3 py-1.5 text-xs font-semibold text-white">{site.source}</span>
            {site.mine_status && <span className="rounded-full border border-border bg-card px-3 py-1.5 text-xs font-semibold text-foreground">{site.mine_status}</span>}
            <span className="rounded-full border border-sky-300 bg-sky-50 px-3 py-1.5 text-xs font-semibold text-sky-900">{recordStatusLabel(site)}</span>
            {hasProfessional && geologyRecord?.primary_rock && (
              <span className="inline-flex items-center gap-1 rounded-full border border-slate-300 bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-800">
                <Gem className="h-3.5 w-3.5" />
                {geologyRecord.primary_rock}
                {geologyRecord.geologic_age ? ` · ${geologyRecord.geologic_age}` : ""}
              </span>
            )}
          </div>
        </div>

        <div className="mb-6"><QuarryActionBar site={site} /></div>

        {reportMessage && <div className="mb-6 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm font-medium text-sky-950">{reportMessage}</div>}

        {!site.is_verified_listing && (
          <div className="mb-6 rounded-2xl border border-stone-200 bg-stone-50 p-5 text-sm leading-relaxed text-stone-700">
            <strong>Public-source mine record:</strong> this page compiles source-labeled intelligence for research and screening. S&S Rock Holdings LLC is not representing that the property is for sale, available, or controlled by S&S. Ownership, title, parcel boundaries, permits, and current operating status should be confirmed from the cited controlling source before a transaction decision.
          </div>
        )}

        <div className="mb-8 grid gap-6 lg:grid-cols-[1.4fr_0.6fr]">
          <Suspense fallback={<div className="flex w-full items-center justify-center rounded-xl border border-border bg-muted/30 text-sm text-muted-foreground" style={{ height: 440 }}>Loading map…</div>}>
            <ParcelMap
              lat={mapLat}
              lng={mapLng}
              polygon={hasProfessional ? (parcel?.boundary_polygon?.length >= 3 ? parcel.boundary_polygon : liveParcel?.boundary) : undefined}
              ownerName={hasProfessional ? (landOwner || liveParcel?.owner) : undefined}
              parcelId={hasProfessional ? (parcel?.parcel_id || liveParcel?.parcel_id || site.parcel_id) : undefined}
              acreage={hasProfessional ? parcelAcreage : undefined}
              rockType={hasProfessional ? (geologyRecord?.primary_rock || geologyRecord?.lithology || site.commodity) : undefined}
              boundarySource={hasProfessional ? (parcel?.boundary_source || liveParcel?.source || parcel?.source_name) : undefined}
              height={440}
              previewMode={!hasProfessional}
            />
          </Suspense>
          <Card title="Mine Record" icon={MapPinned}>
            <Row label="MSHA ID" value={site.msha_mine_id} />
            <Row label="Commodity" value={site.commodity} />
            <Row label="Mine type" value={site.mine_type} />
            <Row label={siteOperator ? "MSHA operator" : "Operator"} value={operator} />
            {hasProfessional && permitOperator && siteOperator && permitOperator !== siteOperator && <Row label="Permit operator" value={permitOperator} />}
            {hasProfessional && <Row label="Land owner" value={landOwner} />}
            {hasProfessional && <Row label="Permittee" value={permittee} />}
            {hasProfessional && <Row label="Controller" value={site.controller_name} />}
            <Row label="Address" value={[site.address, site.city, site.state, site.zip].filter(Boolean).join(", ")} />
            {hasProfessional && <Row label="Permitted acres" value={Number(permittedAcreage) > 0 ? Number(permittedAcreage).toLocaleString() : "Not loaded from controlling permit"} />}
            {hasProfessional && <Row label="Permit acreage basis" value={permitAcreageBasis} />}
            {hasProfessional && <Row label="Parcel acres" value={Number(parcelAcreage) > 0 ? Number(parcelAcreage).toLocaleString() : null} />}
            <Row label="Category" value={site.category} />
            {hasProfessional && <Row label="Parcel" value={site.parcel_id} />}
            <Row label="TDEC permit" value={site.tdec_permit_number} />
            <Row label="NPDES permit" value={site.npdes_permit_number} />
            <Row label="Source checked" value={displayDate(site.last_source_update)} />
            {site.source_url && (
              <a href={site.source_url} target="_blank" rel="noreferrer" className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-sky-800 hover:underline">
                Open source record <ExternalLink className="h-3.5 w-3.5" />
              </a>
            )}
          </Card>
        </div>

        {hasProfessional ? (<>
        <div className="mb-6 rounded-2xl border border-stone-300 bg-stone-950 p-6 text-stone-50">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
            <div><div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-sky-300"><LockKeyhole className="h-4 w-4" /> Acquisition Diligence Snapshot</div><div className="mt-2 text-2xl font-bold">{diligenceReady}/{diligence.length} intelligence layers connected</div><p className="mt-1 max-w-2xl text-sm text-stone-300">A fast completeness check for buyers, operators and advisers before deeper title, engineering, reserve, environmental and financial diligence.</p></div>
            <div className="min-w-32 rounded-2xl border border-stone-700 bg-stone-900 px-5 py-4 text-center"><div className="text-3xl font-black text-sky-300">{diligencePct}%</div><div className="text-[11px] uppercase tracking-wider text-stone-400">data coverage</div></div>
          </div>
          <div className="mt-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{diligence.map((item) => <div key={item.label} className="flex gap-2 rounded-xl border border-stone-800 bg-stone-900/70 p-3">{item.ready ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" /> : <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-sky-300" />}<div><div className="text-xs font-bold">{item.label}</div><div className="mt-0.5 text-[11px] text-stone-400">{item.detail || "Not connected"}</div></div></div>)}</div>
        </div>

        {!showAllRecords && (relatedInspections.length >= 90 || relatedViolations.length >= 90 || relatedProduction.length >= 90) && (
          <div className="mb-6 text-center">
            <button onClick={() => setShowAllRecords(true)} className="rounded-xl border border-border bg-card px-6 py-3 text-sm font-semibold text-foreground hover:bg-muted">Show all compliance & production records</button>
          </div>
        )}
        <div className="grid gap-6 lg:grid-cols-2">
          <Card title="Parcel & Tax Intelligence" icon={Landmark}>
            {(parcel || liveParcel || site.parcel_id || site.parcel_owner) ? (
              <>
                <Row label="Parcel" value={parcel?.parcel_id || liveParcel?.parcel_display_id || liveParcel?.parcel_id || site.parcel_id} />
                <Row label="Owner" value={landOwner || liveParcel?.owner} />
                <Row label="Parcel acreage" value={Number(parcelAcreage) > 0 ? Number(parcelAcreage).toLocaleString() : null} />
                <Row label="Permitted acreage" value={Number(permittedAcreage) > 0 ? Number(permittedAcreage).toLocaleString() : "Not loaded from controlling permit"} />
                <Row label="Property address" value={parcel?.property_address || liveParcel?.situs_address || site.address} />
                <Row label="Mailing address" value={parcel?.mailing_address || liveParcel?.mailing_address} />
                <Row label="Assessed" value={money(parcel?.assessed_value ?? liveParcel?.assessed_value)} />
                <Row label="Land value" value={money(parcel?.land_value ?? liveParcel?.land_value)} />
                <Row label="Improvement value" value={money(parcel?.improvement_value ?? liveParcel?.improvement_value)} />
                <Row label="Deed" value={parcel?.deed_book_page || liveParcel?.deed_book_page} />
                <Row label="Tax year" value={parcel?.tax_year ?? liveParcel?.tax_year} />
                <Row label="Source" value={parcel?.source_name || liveParcel?.source || (site.parcel_id || site.parcel_owner ? "Mining-site record; county verification pending" : null)} />
                <Row label="Source checked" value={displayDate(parcel?.last_source_update || site.last_source_update)} />
                <Row label="Boundary" value={(parcel?.boundary_polygon?.length >= 3 || liveParcel?.boundary?.length >= 3) ? "GIS parcel outline loaded" : "Boundary geometry not loaded yet"} />
                <Row label="Boundary source" value={parcel?.boundary_source || liveParcel?.source} />
                {(parcel?.boundary_source_url || liveParcel?.boundary_source_url) && <a href={parcel?.boundary_source_url || liveParcel?.boundary_source_url} target="_blank" rel="noreferrer" className="mt-4 mr-4 inline-flex items-center gap-1.5 text-sm font-semibold text-sky-800 hover:underline">Open boundary source <ExternalLink className="h-3.5 w-3.5" /></a>}
                {(parcel?.source_url || liveParcel?.source_url || site.tax_map_url) && <a href={parcel?.source_url || liveParcel?.source_url || site.tax_map_url} target="_blank" rel="noreferrer" className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-sky-800 hover:underline">Open tax/GIS source <ExternalLink className="h-3.5 w-3.5" /></a>}
              </>
            ) : (
              <p className="text-sm leading-relaxed text-muted-foreground">No parcel match is available yet for this site.</p>
            )}
          </Card>

          <Card title="Indicative Land-Value Screening" icon={DollarSign}>
            {valuation?.available && valuation.confidence !== "Low" ? (
              <>
                <div className="rounded-xl border border-sky-200 bg-sky-50 p-4">
                  <div className="text-xs font-semibold uppercase tracking-wider text-sky-800">Source-supported screening range</div>
                  <div className="mt-1 text-3xl font-bold text-sky-950">{formatCompactMoney(valuation.low)}–{formatCompactMoney(valuation.high)}</div>
                  <div className="mt-1 text-sm text-sky-900">{valuation.confidence} confidence · {money(valuation.perAcreLow)}–{money(valuation.perAcreHigh)} per acre</div>
                </div>
                <div className="mt-4 text-sm text-foreground"><strong>Based on:</strong> {valuation.basis.join(", ")}.</div>
                <div className="mt-4 rounded-xl border border-stone-200 bg-stone-50 p-4 text-xs leading-relaxed text-stone-700"><strong>Reserve discipline:</strong> S&S does not display assumed quarry-depth tonnage as a reserve estimate. Tonnage, recovery, overburden, quality and mineable depth require site-specific geological and engineering work.</div>
                <p className="mt-3 text-xs leading-relaxed text-muted-foreground">{valuation.disclaimer}</p>
              </>
            ) : (
              <>
                <div className="rounded-xl border border-border bg-muted/20 p-4 font-semibold text-foreground">Value estimate withheld</div>
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{valuation?.reason || "S&S withholds a dollar range until enough source-backed parcel, acreage and land-value evidence is connected."}{valuation?.available && valuation?.confidence === "Low" ? " The current inputs only support low confidence, so no range is displayed." : ""}</p>
              </>
            )}
          </Card>

          <Card title="Production & Market Trend" icon={TrendingUp}>
            <MarketValuationChart
              site={site}
              production={meaningfulProduction}
             usgsMarketProduction={usgsMarketProduction}
            />
          </Card>

          <Card title="Contract & Royalty Intelligence" icon={FileKey2}>
            {relatedContracts.length ? (
              <div className="space-y-4">
                {relatedContracts.map((c) => (
                  <div key={c.id} className="rounded-xl border border-border p-4">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <div className="font-semibold text-foreground">{c.agreement_type}</div>
                        <div className="mt-1 text-xs text-muted-foreground">{c.verification_status || "Unverified"}{c.deal_signal && c.deal_signal !== "None" ? ` · ${c.deal_signal} deal signal` : ""}</div>
                      </div>
                      {c.expiration_date && <span className="rounded-full border border-border bg-muted/30 px-2.5 py-1 text-xs font-medium text-foreground">Expires {displayDate(c.expiration_date)}</span>}
                    </div>
                    <div className="mt-3">
                      <Row label="Landowner" value={c.landowner_name} />
                      <Row label="Mineral owner" value={c.mineral_owner_name} />
                      <Row label="Operator / lessee" value={c.lessee_name || c.operator_name} />
                      <Row label="Royalty / ton" value={c.royalty_rate_per_ton != null ? money(c.royalty_rate_per_ton) : null} />
                      <Row label="Min annual royalty" value={c.minimum_annual_royalty != null ? money(c.minimum_annual_royalty) : null} />
                      <Row label="Term" value={c.initial_term_years != null ? `${c.initial_term_years} years` : null} />
                      <Row label="Renewals" value={c.renewal_options} />
                      <Row label="Purchase option" value={c.purchase_option ? (c.purchase_option_terms || "Yes") : null} />
                      <Row label="Assignment" value={c.assignment_allowed == null ? null : (c.assignment_allowed ? "Allowed" : "Restricted / not allowed")} />
                      <Row label="Termination" value={c.termination_rights} />
                      <Row label="Recording ref." value={c.recording_reference} />
                    </div>
                    {c.deal_signal_reason && <div className="mt-3 rounded-lg border border-sky-200 bg-sky-50 p-3 text-sm text-sky-950"><strong>Deal signal:</strong> {c.deal_signal_reason}</div>}
                    {c.source_url && <a href={c.source_url} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-sky-800 hover:underline">Open contract source <ExternalLink className="h-3.5 w-3.5" /></a>}
                  </div>
                ))}
                <p className="text-xs leading-relaxed text-muted-foreground">Contract terms are shown only when supported by a public record or a document supplied to S&amp;S. Confidential agreements are not represented as public records.</p>
              </div>
            ) : (
              <p className="text-sm leading-relaxed text-muted-foreground">No lease, royalty, option, assignment, easement, or operating agreement has been connected to this site yet. This is a high-priority diligence layer when the landowner and operator are different.</p>
            )}
          </Card>

          <Card title="Quarry Potential" icon={Gauge}>
            <div className="mb-4 rounded-xl border border-sky-200 bg-sky-50 p-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-xs font-bold uppercase tracking-wider text-sky-800">S&amp;S Opportunity Score</div>
                  <div className="mt-1 text-3xl font-bold text-sky-950">{opportunity?.score ?? "—"}<span className="text-sm font-semibold text-sky-700">/100</span></div>
                  <div className="mt-1 text-sm font-semibold text-sky-900">{opportunity?.band || "Early"} screening signal</div>
                </div>
                <div className="text-right text-xs leading-5 text-sky-900/80">
                  <div>{opportunity?.connected?.length || 0} source layers connected</div>
                  <div>{opportunity?.violations ? `${opportunity.violations} environmental violation flags` : "No connected environmental violation flags"}</div>
                </div>
              </div>
              <p className="mt-3 text-xs leading-5 text-sky-900/75">{opportunity?.note}</p>
            </div>
            <Row label="Rock / geology" value={opportunity?.rock || "Pending"} />
            <Row label="Land owner" value={landOwner || opportunity?.owner || "Pending"} />
            <Row label="Operator" value={operator || "Pending"} />
            <Row label="Permitted acres" value={Number(permittedAcreage) > 0 ? Number(permittedAcreage).toLocaleString() : "Permit acreage pending"} />
            <Row label="Parcel acres" value={Number(parcelAcreage) > 0 ? Number(parcelAcreage).toLocaleString() : "Pending"} />
            <Row label="Permit records" value={relatedPermits.length ? `${relatedPermits.length} connected` : (site.tdec_permit_number || site.npdes_permit_number ? "Permit identifier linked" : "Pending")} />
            <Row label="Environmental" value={relatedEnvironmental.length ? `${relatedEnvironmental.length} connected` : "No connected record yet"} />
            {profile && (
              <div className="mt-4 rounded-xl border border-border bg-muted/30 p-4">
                <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Stored potential profile</div>
                <div className="mt-3 grid gap-x-6 sm:grid-cols-2">
                  <Row label="Geology" value={profile.geology_score} />
                  <Row label="Access" value={profile.access_score} />
                  <Row label="Regulatory" value={profile.regulatory_score} />
                  <Row label="Market" value={profile.market_score} />
                  <Row label="Parcel" value={profile.parcel_score} />
                  <Row label="Confidence" value={profile.confidence} />
                </div>
                {profile.basis_summary && <p className="mt-4 text-sm leading-relaxed text-muted-foreground">{profile.basis_summary}</p>}
                {profile.limitations && <p className="mt-3 text-xs leading-relaxed text-muted-foreground"><strong>Limitations:</strong> {profile.limitations}</p>}
              </div>
            )}
          </Card>

          <Card title="Production Intelligence" icon={BarChart3}>
            <div className="space-y-4">
              {relevantMarketProduction && (
                <div className="rounded-xl border border-sky-200 bg-sky-50/70 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-sky-800">USGS statewide production · {site.state}</div>
                      <div className="mt-1 text-sm font-semibold text-slate-950">{relevantMarketProduction.commodity_group} · {relevantMarketProduction.year} {relevantMarketProduction.period}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-2xl font-black text-slate-950">{compactNumber(relevantMarketProduction.quantity_metric_tons)}</div>
                      <div className="text-xs text-slate-600">metric tons · statewide</div>
                    </div>
                  </div>
                  <div className="mt-3 grid gap-2 text-xs text-slate-700 sm:grid-cols-3">
                    <div>YoY: <strong>{relevantMarketProduction.percent_change_yoy != null ? `${Number(relevantMarketProduction.percent_change_yoy) > 0 ? "+" : ""}${Number(relevantMarketProduction.percent_change_yoy).toFixed(1)}%` : "—"}</strong></div>
                    <div>Prior full year: <strong>{compactNumber(relevantMarketProduction.prior_year_annual_quantity_metric_tons)} t</strong></div>
                    <div>Prior full-year value: <strong>{relevantMarketProduction.prior_year_annual_value_usd != null ? money(relevantMarketProduction.prior_year_annual_value_usd) : "—"}</strong></div>
                  </div>
                  <p className="mt-3 text-xs leading-5 text-slate-600">USGS publishes a state estimate from its construction-aggregate survey. It does not publish this quarry's confidential company response as a mine-level tonnage figure.</p>
                  {relevantMarketProduction.source_url && <a href={relevantMarketProduction.source_url} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1.5 text-xs font-bold text-sky-800 hover:underline">Open USGS production publication <ExternalLink className="h-3 w-3" /></a>}
                </div>
              )}

              {latestEstimate && (
                <div className="rounded-xl border border-slate-700 bg-slate-950 p-5 text-white">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-sky-300">S&amp;S modeled quarry production</div>
                      <div className="mt-2 text-2xl font-black">{Number(latestEstimate.estimate_low || 0).toLocaleString()}–{Number(latestEstimate.estimate_high || 0).toLocaleString()} metric tons</div>
                      <div className="mt-1 text-xs text-slate-300">{latestEstimate.year} {latestEstimate.period} screening range · {latestEstimate.confidence || "Low"} confidence</div>
                    </div>
                    <div className="rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-right">
                      <div className="text-[10px] uppercase tracking-wider text-slate-400">Modeled midpoint</div>
                      <div className="mt-1 text-xl font-bold text-sky-300">{Number(latestEstimate.production_amount || 0).toLocaleString()} t</div>
                    </div>
                  </div>
                  <div className="mt-4 grid gap-2 text-xs text-slate-300 sm:grid-cols-3">
                    <div>MSHA hours: <strong className="text-white">{Number(latestEstimate.employee_hours || 0).toLocaleString()}</strong></div>
                    <div>Matched-hours share: <strong className="text-white">{latestEstimate.production_share_pct != null ? `${Number(latestEstimate.production_share_pct).toFixed(2)}%` : "—"}</strong></div>
                    <div>Method: <strong className="text-white">{latestEstimate.methodology || "SS-HOURS-SHARE-V1"}</strong></div>
                  </div>
                  <p className="mt-4 text-xs leading-5 text-slate-300"><strong className="text-white">Not operator-reported tonnage.</strong> S&amp;S calibrates this range to the corresponding USGS state production estimate and this mine's share of matched MSHA employee hours. Equipment productivity, stripping, downtime, product mix and automation can materially change actual tons.</p>
                </div>
              )}

              {latestActivity && (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-4">
                  <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-emerald-800">Official MSHA activity signal</div>
                  <div className="mt-2 grid gap-3 sm:grid-cols-2">
                    <div><div className="text-xs text-emerald-800">Employee hours</div><div className="text-xl font-bold text-emerald-950">{Number(latestActivity.employee_hours || 0).toLocaleString()}</div></div>
                    <div><div className="text-xs text-emerald-800">Activity period</div><div className="text-xl font-bold text-emerald-950">{latestActivity.year || "—"} {latestActivity.period || ""}</div></div>
                  </div>
                  <p className="mt-3 text-xs leading-5 text-emerald-900">MSHA requires metal/nonmetal employment reporting, but not quarry production tonnage. S&amp;S uses employee hours as the primary activity signal. MSHA average-employee fields can be reported across multiple mine subunits, so they are not used to determine the modeled tonnage range.</p>
                  {latestActivity.source_url && <a href={latestActivity.source_url} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1.5 text-xs font-bold text-emerald-900 hover:underline">Open MSHA data source <ExternalLink className="h-3 w-3" /></a>}
                </div>
              )}

              {!latestEstimate && !latestActivity && (
                <div className="rounded-xl border border-border bg-muted/20 p-4">
                  <p className="text-sm leading-relaxed text-muted-foreground">No current mine-level activity record is connected yet. S&amp;S will not show a quarry tonnage estimate until current MSHA hours are available for calibration.</p>
                </div>
              )}

              {meaningfulProduction.length > 0 && (
                <div className="border-t border-border pt-4">
                  <div className="mb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">Source record history</div>
                  <div className="space-y-2">
                    {meaningfulProduction.slice(0, 12).map((r) => (
                      <div key={r.id || r.source_record_id || `${r.year}-${r.period}-${r.record_type}`} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border px-3 py-2 text-xs">
                        <div><strong className="text-foreground">{r.year || "—"}{r.period ? ` · ${r.period}` : ""}</strong><span className="ml-2 text-muted-foreground">{r.record_type || r.source_agency}</span></div>
                        <div className="text-right text-muted-foreground">{r.is_estimate ? `${Number(r.estimate_low || 0).toLocaleString()}–${Number(r.estimate_high || 0).toLocaleString()} t` : r.employee_hours != null ? `${Number(r.employee_hours).toLocaleString()} hours` : r.production_amount != null ? `${Number(r.production_amount).toLocaleString()} ${r.production_unit || ""}` : "source note"}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </Card>

          <Card title="Geology / Rock Identification" icon={Gem}>
            {geologyRecord ? (
              <>
                <div className="mb-4 rounded-xl border border-slate-300 bg-slate-100/70 p-4">
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-700">Derived quarry classification</div>
                  <div className="mt-1 font-display text-lg font-bold text-slate-900">{classifyRock(geologyRecord.primary_rock || geologyRecord.lithology)?.category || geologyRecord.commodity_interpretation || "Unclassified"}</div>
                  <div className="mt-0.5 text-xs text-slate-600">
                    Lithology screening tier: <strong className="text-slate-800">{rockQualityTier(geologyRecord.primary_rock, geologyRecord.secondary_rock) || "Unknown"}</strong>
                    {geologyRecord.geologic_age ? ` · ${geologyRecord.geologic_age}` : ""}
                  </div>
                </div>
                <Row label="Primary rock" value={geologyRecord.primary_rock} />
                <Row label="Secondary" value={geologyRecord.secondary_rock} />
                <Row label="Formation" value={geologyRecord.formation_name || "Not separately identified in mapped source"} />
                <Row label="Geologic unit" value={geologyRecord.geologic_unit} />
                <Row label="Age" value={geologyRecord.geologic_age} />
                <Row label="Lithology" value={geologyRecord.lithology} />
                <Row label="Interpretation" value={geologyRecord.commodity_interpretation} />
                <Row label="Map-match confidence" value={geologyRecord.confidence} />
                <Row label="Source layer" value={geologyRecord.source_map_layer} />
                <Row label="Source checked" value={displayDate(geologyRecord.last_source_update)} />
                {geologyRecord.source_url && <a href={geologyRecord.source_url} target="_blank" rel="noreferrer" className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-sky-800 hover:underline">Open geology source <ExternalLink className="h-3.5 w-3.5" /></a>}
              </>
            ) : (
              <p className="text-sm leading-relaxed text-muted-foreground">No mapped geology record is connected yet. Tennessee Geological Survey bedrock/lithology data will appear here rather than guessing rock type from the mine name.</p>
            )}
          </Card>

          <Card title="USGS Mineral Intelligence" icon={Mountain}>
            {relatedUsgsOccurrences.length ? (
              <div className="space-y-4">
                {relatedUsgsOccurrences.map((occ) => (
                  <div key={occ.id} className="rounded-xl border border-border p-4">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <div className="font-semibold text-foreground">{occ.occurrence_name}</div>
                        <div className="mt-1 text-xs text-muted-foreground">USGS MRDS · {occ.mrds_id}{occ.distance_meters != null ? ` · ${Number(occ.distance_meters).toLocaleString()} m from mine` : ""}</div>
                      </div>
                      {occ.development_status && <span className="rounded-full border border-border bg-muted/30 px-2.5 py-1 text-xs font-medium text-foreground">{occ.development_status}</span>}
                    </div>
                    <div className="mt-3">
                      <Row label="Commodity" value={occ.commodity || site.commodity} />
                      <Row label="Commodity list" value={occ.commodity_list} />
                      <Row label="Mineralogy" value={occ.mineralogy} />
                      <Row label="Deposit type" value={occ.deposit_type} />
                      <Row label="Operation type" value={occ.operation_type} />
                      <Row label="Geologic model" value={occ.geologic_model} />
                      <Row label="Host rock" value={occ.host_rock} />
                      <Row label="Associated rock" value={occ.associated_rock} />
                      <Row label="Production size" value={occ.production_size} />
                      <Row label="Discovery year" value={occ.discovery_year} />
                      <Row label="County" value={occ.occurrence_county} />
                      <Row label="Source checked" value={displayDate(occ.last_source_update)} />
                    </div>
                    {occ.notes && <p className="mt-3 rounded-lg bg-muted/30 p-3 text-xs leading-5 text-muted-foreground">{occ.notes}</p>}
                    {occ.source_url && <a href={occ.source_url} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-sky-800 hover:underline">Open USGS MRDS record <ExternalLink className="h-3.5 w-3.5" /></a>}
                  </div>
                ))}
                <p className="text-xs leading-relaxed text-muted-foreground">USGS MRDS (Mineral Resources Data System) occurrences are matched by proximity to this mine's coordinates. MRDS is a global USGS database of mineral deposits — commodity, deposit type, development status and mineralogy are sourced directly from USGS records.</p>
              </div>
            ) : (
              <p className="text-sm leading-relaxed text-muted-foreground">No USGS MRDS occurrence is linked to this mine yet. USGS Mineral Resources Data System records are matched by proximity and will appear here when the sync runs.</p>
            )}
          </Card>

          {(site.site_images?.length > 0 || aerialPreview) && (
            <Card title="Property & Aerial Imagery" icon={Camera}>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {site.site_images?.map((src, index) => (
                  <div key={`${src}-${index}`} className="overflow-hidden rounded-xl border border-border bg-muted/20">
                    <img src={src} alt={`${site.mine_name} property ${index + 1}`} className="aspect-[4/3] w-full object-cover" />
                    <div className="px-2 py-1.5 text-[11px] font-medium text-muted-foreground">Property photo</div>
                  </div>
                ))}
                {aerialPreview && (
                  <div className="overflow-hidden rounded-xl border border-border bg-muted/20">
                    <img src={aerialPreview} alt={`${site.mine_name} aerial location preview`} className="aspect-[4/3] w-full object-cover" />
                    <div className="px-2 py-1.5 text-[11px] font-medium text-muted-foreground">Aerial location preview</div>
                  </div>
                )}
              </div>
              {site.photo_condition_score != null && <div className="mt-4 text-sm text-foreground"><strong>Reviewed photo/site-condition score:</strong> {Number(site.photo_condition_score).toFixed(0)}/100</div>}
              {site.photo_notes && <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{site.photo_notes}</p>}
              <p className="mt-3 text-xs leading-relaxed text-muted-foreground">Aerial imagery is a location preview from a mapped imagery service and may not show current site conditions or exact parcel boundaries. Imagery source: Esri World Imagery.</p>
            </Card>
          )}

          <Card title="TDEC / Permit Intelligence" icon={ShieldCheck}>
            {relatedPermits.length ? relatedPermits.map((p) => (
              <div key={p.id} className="mb-4 rounded-xl border border-border p-4 last:mb-0">
                <div className="font-semibold text-foreground">{p.permit_number} · {p.permit_type}</div>
                <div className="mt-1 text-sm text-muted-foreground">{p.status || "Status not loaded"}</div>
                <div className="mt-3">
                  <Row label="Permittee" value={p.permittee_name} />
                  <Row label="Land owner" value={p.landowner_name || landOwner} />
                  <Row label="Operator" value={p.operator_name || operator} />
                  <Row label="Permitted acres" value={Number(p.permitted_acres ?? site.permitted_acres) > 0 ? Number(p.permitted_acres ?? site.permitted_acres).toLocaleString() : "Not loaded"} />
                  <Row label="Acreage basis" value={p.acreage_basis || site.permitted_acres_basis} />
                </div>
                <div className="mt-3 grid gap-1 text-xs text-muted-foreground sm:grid-cols-2">
                  <div>Effective: <strong className="text-foreground">{displayDate(p.effective_date)}</strong></div>
                  <div>Expires: <strong className="text-foreground">{displayDate(p.expiration_date)}</strong></div>
                  <div>Source checked: <strong className="text-foreground">{displayDate(p.acreage_last_verified || p.last_source_update)}</strong></div>
                </div>
                {p.source_url && <a href={p.source_url} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-sky-800 hover:underline">Open TDEC source <ExternalLink className="h-3.5 w-3.5" /></a>}
              </div>
            )) : <p className="text-sm text-muted-foreground">No connected TDEC permit record yet.</p>}
          </Card>

          <Card title="Environmental / Compliance" icon={Leaf}>
            {relatedEnvironmental.length || relatedInspections.length || relatedViolations.length ? (
              <div className="space-y-3 text-sm text-foreground">
                <div>Environmental records: <strong>{relatedEnvironmental.length}</strong></div>
                <div>MSHA inspections: <strong>{relatedInspections.length}</strong></div>
                <div>MSHA violations: <strong>{relatedViolations.length}</strong></div>
                {relatedEnvironmental.slice(0, 8).map((r) => (
                  <div key={r.id} className="rounded-lg border border-border p-3">
                    <div className="font-semibold">{r.program} · {r.status || r.record_type || "Record"}</div>
                    <div className="mt-2 grid gap-1 text-xs text-muted-foreground sm:grid-cols-2">
                      <div>Issued: <strong className="text-foreground">{displayDate(r.issue_date)}</strong></div>
                      <div>Effective: <strong className="text-foreground">{displayDate(r.effective_date)}</strong></div>
                      <div>Expires: <strong className="text-foreground">{displayDate(r.expiration_date)}</strong></div>
                      <div>Source checked: <strong className="text-foreground">{displayDate(r.last_source_update)}</strong></div>
                    </div>
                    {r.agency && <div className="mt-2 text-xs text-muted-foreground">Agency: {r.agency}</div>}
                    {r.source_url && <a href={r.source_url} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-sky-800 hover:underline">Open environmental source <ExternalLink className="h-3 w-3" /></a>}
                  </div>
                ))}
              </div>
            ) : <p className="text-sm text-muted-foreground">No connected environmental, inspection or violation records are loaded for this site yet.</p>}
          </Card>
        </div>
        </>) : (
          <div className="mb-8 rounded-3xl border border-sky-200 bg-sky-50/70 p-7 text-center">
            <LockKeyhole className="mx-auto h-8 w-8 text-slate-800" />
            <h2 className="mt-3 font-heading text-2xl font-bold text-slate-950">Professional intelligence starts here</h2>
            <p className="mx-auto mt-3 max-w-2xl text-sm leading-6 text-slate-700">Your Quarry Access membership opens the mine profile and source record. Professional Intelligence adds parcel and ownership data, permitted acreage, geology, production history, compliance, contract/royalty intelligence, valuation screening and S&amp;S opportunity analysis.</p>
            <button onClick={() => navigate("/subscribe")} className="mt-5 rounded-xl bg-slate-900 px-5 py-3 text-sm font-bold text-white">Upgrade to Professional</button>
          </div>
        )}

        <div className="mt-6 rounded-2xl border border-sky-200 bg-sky-50/60 p-6">
          <div className="flex items-center gap-2 font-heading text-lg font-bold text-sky-950"><FileSearch className="h-5 w-5" /> About this S&amp;S Quarry Intelligence Report</div>
          <p className="mt-2 text-sm leading-relaxed text-sky-950/80">This report is assembled by S&amp;S Rock Holdings LLC from source-labeled public and licensed data connected to this site, including mine, parcel, permit, geology, production/activity, and compliance information when available. It is a screening and business-intelligence product—not a certified reserve estimate, engineering opinion, title opinion, appraisal, environmental assessment, or guarantee that commercially recoverable stone exists.</p>
        </div>

        {site.notes && (
          <div className="mt-6 rounded-2xl border border-border bg-muted/20 p-6">
            <div className="mb-2 flex items-center gap-2 font-semibold text-foreground"><FileSearch className="h-4 w-4" /> Research notes</div>
            <p className="text-sm leading-relaxed text-muted-foreground">{site.notes}</p>
          </div>
        )}
      </main>
    </div>
  );
}