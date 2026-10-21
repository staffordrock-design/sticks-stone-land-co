import React from "react";
import { Loader2, Search } from "lucide-react";

const FIELD_CLASS = "mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring";
const LABEL_CLASS = "text-xs font-semibold uppercase tracking-wider text-muted-foreground";

const FIELDS = [
  ["county", "County", "e.g. Polk"],
  ["parcel_id", "Parcel ID", "e.g. 123-045.67"],
  ["name", "Grantor or grantee", "Party name"],
  ["book", "Book", "e.g. 123"],
  ["page", "Page", "e.g. 456"],
];

export default function DeedSearchForm({ filters, onChange, onSearch, onReset, loading }) {
  return (
    <form onSubmit={(event) => { event.preventDefault(); onSearch(); }} className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
      {FIELDS.map(([key, label, placeholder]) => (
        <label key={key} className="block">
          <span className={LABEL_CLASS}>{label}</span>
          <input
            type="text"
            value={filters[key] ?? ""}
            placeholder={placeholder}
            aria-label={label}
            onChange={(event) => onChange({ ...filters, [key]: event.target.value })}
            className={FIELD_CLASS}
          />
        </label>
      ))}
      <div className="flex flex-wrap items-center gap-3 sm:col-span-2 lg:col-span-5">
        <button type="submit" disabled={loading} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-bold text-white disabled:opacity-50">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          {loading ? "Searching…" : "Search deeds"}
        </button>
        <button type="button" onClick={onReset} className="min-h-11 rounded-xl border border-border px-5 py-2.5 text-sm font-semibold">Reset</button>
      </div>
    </form>
  );
}