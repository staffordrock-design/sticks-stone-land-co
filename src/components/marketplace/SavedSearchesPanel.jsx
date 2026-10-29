import React, { useState } from "react";
import { BookmarkPlus, Search, Trash2, X } from "lucide-react";

const STORAGE_KEY = "ss_saved_searches_v1";

function readSaved() {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeSaved(list) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {
    // Saved searches stay client-side only; storage may be unavailable.
  }
}

function describe(search) {
  const parts = [search.query || "All quarries", search.state];
  if (search.county && search.county !== "All counties") parts.push(search.county + " County");
  if (search.commodity && search.commodity !== "All materials") parts.push(search.commodity);
  if (search.status && search.status !== "All") parts.push(search.status);
  if (Number(search.minAcres) > 0) parts.push(search.minAcres + "+ acres");
  if (search.verifiedOnly) parts.push("courthouse linked");
  if (search.deedOnly) parts.push("deed on file");
  return parts.filter(Boolean).join(" · ");
}

export default function SavedSearchesPanel({ open, onClose, current, onApply }) {
  const [items, setItems] = useState(readSaved);

  if (!open) return null;

  const save = () => {
    const label = describe(current);
    const next = [{ ...current, id: Date.now().toString(), label, savedAt: new Date().toISOString() }, ...items].slice(0, 12);
    setItems(next);
    writeSaved(next);
  };

  const remove = (id) => {
    const next = items.filter((item) => item.id !== id);
    setItems(next);
    writeSaved(next);
  };

  return (
    <div className="absolute right-2 top-2 z-[600] w-[min(320px,calc(100vw-24px))] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
      <div className="flex items-start justify-between gap-2 border-b border-slate-100 px-4 py-3">
        <div>
          <h2 className="text-sm font-extrabold text-slate-950">Saved searches</h2>
          <p className="mt-0.5 text-[11px] text-slate-500">{describe(current)}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close saved searches"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-700"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <button
        type="button"
        onClick={save}
        className="flex w-full items-center justify-center gap-1.5 bg-blue-700 px-4 py-2.5 text-xs font-bold text-white hover:bg-blue-800"
      >
        <BookmarkPlus className="h-4 w-4" /> Save this search
      </button>

      <div className="max-h-[46dvh] overflow-y-auto">
        {items.length === 0 ? (
          <p className="px-4 py-5 text-center text-xs leading-5 text-slate-500">
            No saved searches yet. Set a state, county, material or acreage filter, then save it to return in one tap.
          </p>
        ) : (
          items.map((item) => (
            <div key={item.id} className="flex items-center gap-1 border-t border-slate-100 px-2 py-1.5">
              <button
                type="button"
                onClick={() => onApply(item)}
                className="flex min-h-10 min-w-0 flex-1 items-center gap-2 rounded-lg px-2 text-left text-xs font-semibold text-slate-800 hover:bg-slate-50"
              >
                <Search className="h-3.5 w-3.5 shrink-0 text-blue-700" />
                <span className="truncate">{item.label}</span>
              </button>
              <button
                type="button"
                onClick={() => remove(item.id)}
                aria-label="Delete saved search"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-red-600"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}