import React, { useMemo } from "react";
import { AlertTriangle } from "lucide-react";

const DOC_LABELS = {
  deed: "Deed",
  mineral_deed: "Mineral deed",
  oil_gas_lease: "Oil & gas lease",
  deed_of_trust: "Deed of trust",
  plat: "Plat",
  other: "Other",
};

function linkKey(book, page) {
  const b = String(book ?? "").trim().toLowerCase();
  const p = String(page ?? "").trim().toLowerCase();
  return b && p ? `${b}|${p}` : null;
}

function timeValue(date) {
  const parsed = date ? Date.parse(date) : NaN;
  return Number.isFinite(parsed) ? parsed : Number.POSITIVE_INFINITY;
}

// A deed needs a gap flag when it references a prior deed but no record in the
// library carries that book/page.
function buildTimeline(deeds) {
  const present = new Set();
  deeds.forEach((deed) => {
    const key = linkKey(deed.book, deed.page);
    if (key) present.add(key);
  });
  return deeds
    .map((deed) => {
      const priorKey = linkKey(deed.prior_book, deed.prior_page);
      const priorMatch = priorKey ? present.has(priorKey) : false;
      const hasPrior = Boolean(String(deed.prior_deed_reference || "").trim() || priorKey);
      return { ...deed, gap: hasPrior && !priorMatch };
    })
    .sort((a, b) => timeValue(a.recording_date) - timeValue(b.recording_date));
}

function Flag({ children }) {
  return <span className="inline-flex items-center rounded-full bg-sky-100 px-2.5 py-0.5 text-xs font-semibold text-sky-900">{children}</span>;
}

export default function DeedChainTimeline({ deeds = [] }) {
  const timeline = useMemo(() => buildTimeline(deeds), [deeds]);

  if (!timeline.length) {
    return <p className="mt-4 rounded-xl border border-dashed border-border p-6 text-sm text-muted-foreground">No deeds in the library share this parcel yet.</p>;
  }

  return (
    <ol className="mt-5 space-y-3">
      {timeline.map((deed) => (
        <li key={deed.id} className="rounded-xl border border-border bg-background p-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-bold text-foreground">{deed.recording_date || "Recording date unknown"}</span>
            <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-semibold text-foreground">{DOC_LABELS[deed.document_type] || deed.document_type || "Document"}</span>
            <span className="text-xs text-muted-foreground">Book {deed.book || "—"} / Page {deed.page || "—"}</span>
          </div>
          <p className="mt-2 text-sm font-semibold text-foreground">{deed.grantors || "Unknown grantor"} → {deed.grantees || "Unknown grantee"}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {deed.mineral_severance && <Flag>Mineral severance</Flag>}
            {deed.minerals_reserved && <Flag>Minerals reserved</Flag>}
            {deed.oil_gas_language && <Flag>Oil &amp; gas language</Flag>}
            {deed.gap && (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-bold text-amber-950">
                <AlertTriangle className="h-3 w-3" />gap — prior deed not in library
              </span>
            )}
          </div>
          {deed.prior_deed_reference && <p className="mt-2 text-xs leading-5 text-muted-foreground">Prior deed: {deed.prior_deed_reference}</p>}
        </li>
      ))}
    </ol>
  );
}