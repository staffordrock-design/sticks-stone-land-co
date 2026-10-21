import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Loader2, Save, Upload } from "lucide-react";

const DOCUMENT_TYPES = ["deed", "mineral_deed", "oil_gas_lease", "deed_of_trust", "plat", "other"];

const TEXT_FIELDS = [
  ["state", "State"],
  ["county", "County"],
  ["book", "Book"],
  ["page", "Page"],
  ["instrument_number", "Instrument number"],
  ["grantors", "Grantor(s)"],
  ["grantees", "Grantee(s)"],
  ["parcel_ids", "Parcel IDs (comma-separated)"],
  ["prior_book", "Prior deed book"],
  ["prior_page", "Prior deed page"],
];
const NUMBER_FIELDS = [
  ["acreage", "Acreage"],
  ["consideration", "Consideration (USD)"],
];
const BOOL_FIELDS = [
  ["mineral_severance", "Mineral severance"],
  ["minerals_reserved", "Minerals reserved"],
  ["oil_gas_language", "Oil & gas language"],
];
const LONG_FIELDS = [
  ["legal_description", "Legal description"],
  ["prior_deed_reference", "Prior-deed reference (\"same property conveyed by\")"],
  ["mineral_clause_text", "Exact mineral clause text"],
  ["notes", "Notes"],
];

const EMPTY_FORM = {
  state: "TN", county: "", document_type: "deed", book: "", page: "", instrument_number: "",
  recording_date: "", grantors: "", grantees: "", parcel_ids: "", acreage: "", consideration: "",
  legal_description: "", prior_deed_reference: "", prior_book: "", prior_page: "",
  mineral_severance: false, minerals_reserved: false, oil_gas_language: false,
  mineral_clause_text: "", document_file_url: "", verification_status: "derived", notes: "",
};

const FIELD_CLASS = "mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring";
const LABEL_CLASS = "text-xs font-semibold uppercase tracking-wider text-muted-foreground";

function toForm(data) {
  const next = { ...EMPTY_FORM, ...(data || {}) };
  NUMBER_FIELDS.forEach(([key]) => { next[key] = next[key] === null || next[key] === undefined ? "" : String(next[key]); });
  BOOL_FIELDS.forEach(([key]) => { next[key] = Boolean(next[key]); });
  next.document_type = DOCUMENT_TYPES.includes(next.document_type) ? next.document_type : "deed";
  next.recording_date = next.recording_date ? String(next.recording_date).slice(0, 10) : "";
  return next;
}

export default function DeedUploadPanel({ onSaved }) {
  const [file, setFile] = useState(null);
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const update = (field) => (event) => {
    const target = event.target;
    const value = target.type === "checkbox" ? target.checked : target.value;
    setForm((current) => ({ ...current, [field]: value }));
  };

  const extract = async () => {
    if (!file) { setMessage("Choose a deed file to upload first."); return; }
    setBusy(true); setMessage("");
    try {
      const { file_uri } = await base44.integrations.Core.UploadPrivateFile({ file });
      const { signed_url } = await base44.integrations.Core.CreateFileSignedUrl({ file_uri, expires_in: 900 });
      const response = await base44.functions.invoke("extract-deed", { file_url: signed_url });
      const data = response?.data ?? response;
      if (data?.error) throw new Error(data.error);
      setForm(toForm({ ...data, document_file_url: file_uri }));
      setMessage("Review every extracted field, correct anything, then save. Saved deeds are always marked derived.");
    } catch (error) {
      setMessage(error?.message || "Could not read that deed document.");
    } finally {
      setBusy(false);
    }
  };

  const save = async (event) => {
    event.preventDefault();
    setSaving(true); setMessage("");
    try {
      const response = await base44.functions.invoke("courthouse-records", { operation: "create_deed", deed: form });
      const payload = response?.data ?? response;
      const record = payload?.record;
      if (!record) throw new Error(payload?.error || "Could not save the deed.");
      setForm(null); setFile(null);
      setMessage("Deed saved as derived (not verified).");
      onSaved?.(record);
    } catch (error) {
      setMessage(error?.message || "Could not save the deed.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="rounded-2xl border border-border bg-card p-6">
      <h2 className="flex items-center gap-2 font-heading text-xl font-bold"><Upload className="h-5 w-5 text-sky-700" /> Upload deed</h2>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">Upload a deed document (stored privately). S&amp;S reads it with its file-extraction integration and pre-fills every field for you to review, edit and save.</p>

      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
        <label className="flex-1">
          <span className={LABEL_CLASS}>Deed document</span>
          <input
            type="file"
            accept=".pdf,.png,.jpg,.jpeg,.html,.htm"
            onChange={(event) => { setFile(event.target.files?.[0] || null); setForm(null); }}
            className={FIELD_CLASS}
          />
        </label>
        <button type="button" onClick={extract} disabled={busy || !file} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-sky-700 px-5 py-2.5 text-sm font-bold text-white disabled:opacity-50">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          {busy ? "Reading document…" : "Upload & extract"}
        </button>
      </div>

      {message && <p role="status" className="mt-4 rounded-xl border border-border bg-muted/30 p-4 text-sm">{message}</p>}

      {form && (
        <form onSubmit={save} className="mt-6 grid gap-4 border-t border-border pt-6 sm:grid-cols-2">
          <label className="block">
            <span className={LABEL_CLASS}>Document type</span>
            <select value={form.document_type} onChange={update("document_type")} className={FIELD_CLASS}>
              {DOCUMENT_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
            </select>
          </label>
          <label className="block">
            <span className={LABEL_CLASS}>Recording date</span>
            <input type="date" value={form.recording_date} onChange={update("recording_date")} className={FIELD_CLASS} />
          </label>
          {TEXT_FIELDS.map(([key, label]) => (
            <label key={key} className="block">
              <span className={LABEL_CLASS}>{label}</span>
              <input type="text" value={form[key] ?? ""} onChange={update(key)} className={FIELD_CLASS} />
            </label>
          ))}
          {NUMBER_FIELDS.map(([key, label]) => (
            <label key={key} className="block">
              <span className={LABEL_CLASS}>{label}</span>
              <input type="number" step="any" value={form[key] ?? ""} onChange={update(key)} className={FIELD_CLASS} />
            </label>
          ))}
          <div className="grid gap-3 sm:col-span-2 sm:grid-cols-3">
            {BOOL_FIELDS.map(([key, label]) => (
              <label key={key} className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium">
                <input type="checkbox" checked={Boolean(form[key])} onChange={update(key)} className="h-4 w-4" />{label}
              </label>
            ))}
          </div>
          {LONG_FIELDS.map(([key, label]) => (
            <label key={key} className="block sm:col-span-2">
              <span className={LABEL_CLASS}>{label}</span>
              <textarea rows={3} value={form[key] ?? ""} onChange={update(key)} className={FIELD_CLASS} />
            </label>
          ))}
          <label className="block sm:col-span-2">
            <span className={LABEL_CLASS}>Document file reference</span>
            <input type="text" value={form.document_file_url ?? ""} onChange={update("document_file_url")} className={FIELD_CLASS} />
          </label>
          <div className="rounded-xl border border-border bg-muted/30 p-4 text-sm sm:col-span-2">
            <span className={LABEL_CLASS}>Verification status</span>
            <p className="mt-1 font-semibold text-foreground">derived</p>
            <p className="mt-1 text-xs text-muted-foreground">Extracted records are always saved as <strong>derived</strong> — never verified. Title must be verified separately.</p>
          </div>
          <div className="flex flex-wrap gap-3 sm:col-span-2">
            <button type="submit" disabled={saving} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-bold text-white disabled:opacity-50">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {saving ? "Saving…" : "Save deed"}
            </button>
            <button type="button" onClick={() => { setForm(null); setFile(null); setMessage(""); }} className="inline-flex min-h-11 items-center rounded-xl border border-border px-5 py-2.5 text-sm font-semibold">Cancel</button>
          </div>
        </form>
      )}
    </section>
  );
}