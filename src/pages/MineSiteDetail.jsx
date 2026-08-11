import React, { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import ParcelMap from "@/components/ParcelMap";
import { ArrowLeft, ExternalLink, FileSearch, Gauge, Landmark, Leaf, MapPinned, ShieldCheck } from "lucide-react";

function sameValue(a, b) {
  if (a == null || b == null || a === "" || b === "") return false;
  return String(a).trim().toLowerCase() === String(b).trim().toLowerCase();
}

function money(value) {
  if (value == null || value === "") return "—";
  return Number(value).toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

function Card({ title, icon: Icon, children }) {
  return (
    <section className="rounded-2xl border border-border bg-card p-6">
      <div className="mb-4 flex items-center gap-2">
        <Icon className="h-5 w-5 text-amber-700" />
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
  const [site, setSite] = useState(null);
  const [parcels, setParcels] = useState([]);
  const [permits, setPermits] = useState([]);
  const [environmental, setEnvironmental] = useState([]);
  const [inspections, setInspections] = useState([]);
  const [violations, setViolations] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const [mine, parcelData, permitData, envData, inspectionData, violationData, profileData] = await Promise.all([
          base44.entities.MiningSite.get(id),
          base44.entities.ParcelRecord.list("-updated_date", 500),
          base44.entities.TDECPermit.list("-updated_date", 500),
          base44.entities.EnvironmentalRecord.list("-updated_date", 500),
          base44.entities.MSHAInspection.list("-updated_date", 500),
          base44.entities.MSHAViolation.list("-updated_date", 500),
          base44.entities.QuarryPotentialProfile.list("-updated_date", 500),
        ]);
        setSite(mine);
        setParcels(parcelData || []);
        setPermits(permitData || []);
        setEnvironmental(envData || []);
        setInspections(inspectionData || []);
        setViolations(violationData || []);
        setProfiles(profileData || []);
      } catch (e) {
        setError(e?.message || "Unable to load site intelligence.");
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

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

  if (loading) return <div className="min-h-screen bg-background p-10 text-center text-muted-foreground">Loading site intelligence…</div>;
  if (error || !site) return <div className="min-h-screen bg-background p-10 text-center text-destructive">{error || "Site not found."}</div>;

  const mapLat = site.latitude ?? parcel?.latitude;
  const mapLng = site.longitude ?? parcel?.longitude;

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-background/90 backdrop-blur">
        <div className="mx-auto max-w-7xl px-6 py-4">
          <Link to="/" className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" /> Back to Tennessee map
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-10">
        <div className="mb-8 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">Quarry Intelligence Profile</p>
            <h1 className="mt-2 font-heading text-3xl font-bold tracking-tight text-foreground sm:text-4xl">{site.mine_name}</h1>
            <p className="mt-2 text-muted-foreground">{[site.city, site.county, site.state].filter(Boolean).join(" · ")}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <span className="rounded-full bg-stone-900 px-3 py-1.5 text-xs font-semibold text-white">{site.source}</span>
            {site.mine_status && <span className="rounded-full border border-border bg-card px-3 py-1.5 text-xs font-semibold text-foreground">{site.mine_status}</span>}
            <span className="rounded-full border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-900">Screening intelligence</span>
          </div>
        </div>

        <div className="mb-8 grid gap-6 lg:grid-cols-[1.4fr_0.6fr]">
          <ParcelMap lat={mapLat} lng={mapLng} height={440} />
          <Card title="Mine Record" icon={MapPinned}>
            <Row label="MSHA ID" value={site.msha_mine_id} />
            <Row label="Commodity" value={site.commodity} />
            <Row label="Mine type" value={site.mine_type} />
            <Row label="Operator" value={site.operator_name} />
            <Row label="Controller" value={site.controller_name} />
            <Row label="Acreage" value={site.acreage != null ? Number(site.acreage).toLocaleString() : null} />
            <Row label="Parcel" value={site.parcel_id} />
            <Row label="TDEC permit" value={site.tdec_permit_number} />
            {site.source_url && (
              <a href={site.source_url} target="_blank" rel="noreferrer" className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-amber-800 hover:underline">
                Open source record <ExternalLink className="h-3.5 w-3.5" />
              </a>
            )}
          </Card>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card title="Parcel & Tax Intelligence" icon={Landmark}>
            {parcel ? (
              <>
                <Row label="Parcel" value={parcel.parcel_id} />
                <Row label="Owner" value={parcel.owner_name} />
                <Row label="Acreage" value={parcel.acreage != null ? Number(parcel.acreage).toLocaleString() : null} />
                <Row label="Assessed" value={money(parcel.assessed_value)} />
                <Row label="Land value" value={money(parcel.land_value)} />
                <Row label="Deed" value={parcel.deed_book_page} />
                <Row label="Source" value={parcel.source_name} />
                {parcel.source_url && <a href={parcel.source_url} target="_blank" rel="noreferrer" className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-amber-800 hover:underline">Open tax/GIS source <ExternalLink className="h-3.5 w-3.5" /></a>}
              </>
            ) : (
              <p className="text-sm leading-relaxed text-muted-foreground">No verified parcel record is connected yet. This site remains visible, but owner, acreage, tax value and parcel boundary are not being guessed.</p>
            )}
          </Card>

          <Card title="Quarry Potential" icon={Gauge}>
            {profile ? (
              <>
                <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-4">
                  <div className="text-xs uppercase tracking-wider text-amber-800">Screening score</div>
                  <div className="mt-1 text-3xl font-bold text-amber-950">{profile.screening_score ?? "Not scored"}</div>
                  <div className="mt-1 text-sm text-amber-900">Confidence: {profile.confidence || "Low"}</div>
                </div>
                <Row label="Geology" value={profile.geology_score} />
                <Row label="Access" value={profile.access_score} />
                <Row label="Regulatory" value={profile.regulatory_score} />
                <Row label="Market" value={profile.market_score} />
                <Row label="Parcel" value={profile.parcel_score} />
                <p className="mt-4 text-sm leading-relaxed text-muted-foreground">{profile.basis_summary}</p>
                <p className="mt-3 text-xs leading-relaxed text-muted-foreground"><strong>Limitations:</strong> {profile.limitations}</p>
              </>
            ) : (
              <p className="text-sm leading-relaxed text-muted-foreground">Potential profile not generated yet. The app will only show a score after enough source-backed geology, parcel, access, regulatory and market inputs are connected.</p>
            )}
          </Card>

          <Card title="TDEC / Permit Intelligence" icon={ShieldCheck}>
            {relatedPermits.length ? relatedPermits.map((p) => (
              <div key={p.id} className="mb-4 rounded-xl border border-border p-4 last:mb-0">
                <div className="font-semibold text-foreground">{p.permit_number} · {p.permit_type}</div>
                <div className="mt-1 text-sm text-muted-foreground">{p.status || "Status not loaded"}</div>
                {p.operator_name && <div className="mt-2 text-sm text-foreground">Operator: {p.operator_name}</div>}
                {p.source_url && <a href={p.source_url} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-amber-800 hover:underline">Open TDEC source <ExternalLink className="h-3.5 w-3.5" /></a>}
              </div>
            )) : <p className="text-sm text-muted-foreground">No connected TDEC permit record yet.</p>}
          </Card>

          <Card title="Environmental / Compliance" icon={Leaf}>
            {relatedEnvironmental.length || relatedInspections.length || relatedViolations.length ? (
              <div className="space-y-3 text-sm text-foreground">
                <div>Environmental records: <strong>{relatedEnvironmental.length}</strong></div>
                <div>MSHA inspections: <strong>{relatedInspections.length}</strong></div>
                <div>MSHA violations: <strong>{relatedViolations.length}</strong></div>
                {relatedEnvironmental.slice(0, 4).map((r) => <div key={r.id} className="rounded-lg border border-border p-3">{r.program} · {r.status || r.record_type || "Record"}</div>)}
              </div>
            ) : <p className="text-sm text-muted-foreground">No connected environmental, inspection or violation records are loaded for this site yet.</p>}
          </Card>
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
