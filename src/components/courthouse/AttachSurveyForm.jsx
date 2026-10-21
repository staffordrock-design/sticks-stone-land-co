import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Loader2, PlusCircle } from "lucide-react";

const FIELD_CLASS = "mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring";
const LABEL_CLASS = "text-xs font-semibold uppercase tracking-wider text-muted-foreground";

function emptyForm(parcelId) {
  return { county: "", state: "TN", parcel_id: parcelId || "", surveyor_name: "", survey_date: "", notes: "" };
}

export default function AttachSurveyForm({ defaultParcelId, onAttached }) {
  const [file, setFile] = useState(null);
  const [form, setForm] = useState(() => emptyForm(defaultParcelId));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    setForm((current) => ({ ...current, parcel_id: current.parcel_id || defaultParcelId || "" }));
  }, [defaultParcelId]);

  const update = (field) => (event) => setForm((current) => ({ ...current, [field]: event.target.value }));

  const attach = async (event) => {
    event.preventDefault();
    if (!file) { setMessage("Choose the survey document to attach."); return; }
    setBusy(true); setMessage("");
    try {
      const { file_uri } = await base44.integrations.Core.UploadPrivateFile({ file });
      const response = await base44.functions.invoke("courthouse-records", {
        operation: "create_survey",
        survey: { ...form, document_file_url: file_uri },
      });
      const payload = response?.data ?? response;
      if (!payload?.record) throw new Error(payload?.error || "Could not attach the survey.");
      setFile(null);
      setForm(emptyForm(defaultParcelId));
      setMessage("Survey attached.");
      onAttached?.(payload.record);
    } catch (error) {
      setMessage(error?.message || "Could not attach the survey.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={attach} className="mt-5 grid gap-3 rounded-xl border border-border bg-muted/20 p-4 sm:grid-cols-2">
      <p className="text-sm font-bold text-foreground sm:col-span-2">Attach survey</p>
      <label className="block sm:col-span-2">
        <span className={LABEL_CLASS}>Survey document</span>
        <input type="file" accept=".pdf,.png,.jpg,.jpeg,.html,.htm" onChange={(event) => setFile(event.target.files?.[0] || null)} className={FIELD_CLASS} />
      </label>
      <label className="block"><span className={LABEL_CLASS}>County</span><input type="text" value={form.county} onChange={update("county")} className={FIELD_CLASS} /></label>
      <label className="block"><span className={LABEL_CLASS}>State</span><input type="text" value={form.state} onChange={update("state")} className={FIELD_CLASS} /></label>
      <label className="block"><span className={LABEL_CLASS}>Parcel ID</span><input type="text" value={form.parcel_id} onChange={update("parcel_id")} className={FIELD_CLASS} /></label>
      <label className="block"><span className={LABEL_CLASS}>Surveyor name</span><input type="text" value={form.surveyor_name} onChange={update("surveyor_name")} className={FIELD_CLASS} /></label>
      <label className="block"><span className={LABEL_CLASS}>Survey date</span><input type="date" value={form.survey_date} onChange={update("survey_date")} className={FIELD_CLASS} /></label>
      <label className="block sm:col-span-2"><span className={LABEL_CLASS}>Notes</span><textarea rows={2} value={form.notes} onChange={update("notes")} className={FIELD_CLASS} /></label>
      {message && <p role="status" className="text-sm text-muted-foreground sm:col-span-2">{message}</p>}
      <div className="sm:col-span-2">
        <button type="submit" disabled={busy} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border bg-card px-4 py-2.5 text-sm font-bold text-foreground disabled:opacity-50">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlusCircle className="h-4 w-4" />}
          {busy ? "Attaching…" : "Attach survey"}
        </button>
      </div>
    </form>
  );
}