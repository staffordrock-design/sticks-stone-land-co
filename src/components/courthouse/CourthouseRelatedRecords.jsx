import React from "react";
import { FileText, MapPinned } from "lucide-react";
import AttachSurveyForm from "@/components/courthouse/AttachSurveyForm";

function Row({ primary, secondary, meta }) {
  return (
    <li className="rounded-xl border border-border bg-background px-4 py-3">
      <p className="text-sm font-semibold text-foreground">{primary || "—"}</p>
      {secondary && <p className="mt-1 text-sm text-muted-foreground">{secondary}</p>}
      {meta && <p className="mt-1 text-xs text-muted-foreground">{meta}</p>}
    </li>
  );
}

function join(values) {
  const parts = values.filter(Boolean);
  return parts.length ? parts.join(" · ") : null;
}

export default function CourthouseRelatedRecords({ plats = [], surveys = [], defaultParcelId, onAttached }) {
  return (
    <section className="rounded-2xl border border-border bg-card p-6">
      <h2 className="font-heading text-xl font-bold">Plats &amp; surveys for these parcels</h2>
      <div className="mt-4 grid gap-6 lg:grid-cols-2">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-bold"><MapPinned className="h-4 w-4 text-sky-700" /> Plats ({plats.length})</h3>
          {plats.length ? (
            <ul className="mt-3 space-y-2">
              {plats.map((plat) => (
                <Row
                  key={plat.id}
                  primary={plat.name || "Unnamed plat"}
                  secondary={[plat.county ? `${plat.county} County` : null, plat.state].filter(Boolean).join(", ") || null}
                  meta={join([
                    plat.plat_book ? `Plat book ${plat.plat_book}` : null,
                    plat.plat_page ? `page ${plat.plat_page}` : null,
                    plat.recording_date ? `recorded ${plat.recording_date}` : null,
                    plat.parcel_ids ? `parcels ${plat.parcel_ids}` : null,
                  ])}
                />
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-muted-foreground">No plat records on file for these parcels.</p>
          )}
        </div>
        <div>
          <h3 className="flex items-center gap-2 text-sm font-bold"><FileText className="h-4 w-4 text-sky-700" /> Surveys ({surveys.length})</h3>
          {surveys.length ? (
            <ul className="mt-3 space-y-2">
              {surveys.map((survey) => (
                <Row
                  key={survey.id}
                  primary={survey.surveyor_name || "Survey"}
                  secondary={survey.survey_date ? `Surveyed ${survey.survey_date}` : null}
                  meta={join([survey.parcel_id ? `Parcel ${survey.parcel_id}` : null, survey.county, survey.state])}
                />
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-muted-foreground">No survey records on file for these parcels.</p>
          )}
        </div>
      </div>
      <AttachSurveyForm defaultParcelId={defaultParcelId} onAttached={onAttached} />
    </section>
  );
}