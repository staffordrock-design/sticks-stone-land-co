import React from "react";
import {
  User,
  FileBadge,
  Landmark,
  Ruler,
  Building2,
  MapPin,
  Mail,
  Database,
  Loader2,
  ScrollText,
} from "lucide-react";

const money = (v) =>
  v == null ? "" : `$${Number(v).toLocaleString()}`;

export default function ParcelRecords({ data, loading }) {
  if (loading) {
    return (
      <div className="flex items-center gap-2 rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Fetching official parcel records from Regrid…
      </div>
    );
  }

  if (!data || data.fallback) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-muted/30 p-6 text-sm text-muted-foreground">
        Official parcel records unavailable — showing the recorded boundary
        survey. Add a Regrid API key in dashboard settings to pull live owner,
        deed, and tax-map data.
      </div>
    );
  }

  const rows = [
    { icon: User, label: "Owner of Record", value: data.owner },
    { icon: FileBadge, label: "Parcel ID / APN", value: data.parcel_id },
    { icon: ScrollText, label: "Legal Description", value: data.legal_description },
    { icon: Landmark, label: "Assessed Value", value: money(data.assessed_value) },
    { icon: Landmark, label: "Last Sale Price", value: money(data.sale_price) },
    { icon: Ruler, label: "Tax-Map Acreage", value: data.acreage != null ? `${Number(data.acreage).toFixed(2)} ac` : "" },
    { icon: Building2, label: "Zoning", value: data.zoning },
    { icon: Building2, label: "Land Use", value: data.land_use },
    { icon: MapPin, label: "Situs Address", value: data.situs_address },
    { icon: Mail, label: "Mailing Address", value: data.mailing_address },
  ].filter((r) => r.value);

  return (
    <div className="rounded-2xl border border-border bg-card">
      <div className="flex items-center gap-2 border-b border-border px-5 py-3">
        <Database className="h-4 w-4 text-amber-700" />
        <h3 className="font-heading text-sm font-semibold text-foreground">
          Register of Deeds &amp; Tax Map
        </h3>
        <span className="ml-auto rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-amber-900">
          {data.source}
        </span>
      </div>
      <div className="divide-y divide-border">
        {rows.length === 0 ? (
          <p className="px-5 py-4 text-sm text-muted-foreground">
            No parcel attributes returned for this point.
          </p>
        ) : (
          rows.map((r) => (
            <div key={r.label} className="flex items-start gap-3 px-5 py-3">
              <r.icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
                  {r.label}
                </p>
                <p className="break-words text-sm font-medium text-foreground">
                  {r.value}
                </p>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}