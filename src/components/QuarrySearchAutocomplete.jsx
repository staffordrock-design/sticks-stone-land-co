import React, { useState, useRef, useEffect } from "react";
import { Search, MapPin } from "lucide-react";

/**
 * Search input with an autocomplete dropdown of matching quarry sites and locations.
 * Suggestions match mine name, city, county, state, commodity, MSHA ID, and permit IDs.
 */
export default function QuarrySearchAutocomplete({ sites, query, setQuery, placeholder = "Mine, county, state, MSHA ID, commodity…" }) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const wrapperRef = useRef(null);

  const q = query.trim().toLowerCase();

  const suggestions = React.useMemo(() => {
    if (q.length < 1) return [];
    const matches = [];
    const seen = new Set();
    for (const s of sites) {
      const haystack = [
        s.mine_name, s.city, s.county, s.state, s.commodity,
        s.operator_name, s.msha_mine_id, s.tdec_permit_number, s.parcel_id,
      ].map((v) => String(v || "").toLowerCase());
      if (haystack.some((h) => h.includes(q))) {
        const key = s.id || `${s.mine_name}-${s.msha_mine_id}`;
        if (!seen.has(key)) {
          seen.add(key);
          matches.push(s);
        }
      }
      if (matches.length >= 8) break;
    }
    return matches;
  }, [sites, q]);

  useEffect(() => {
    setActiveIndex(-1);
  }, [q]);

  useEffect(() => {
    const onClickOutside = (e) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  const pick = (site) => {
    setQuery(site.mine_name || site.county || site.state || "");
    setOpen(false);
  };

  const onKeyDown = (e) => {
    if (!open || suggestions.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, suggestions.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && activeIndex >= 0) {
      e.preventDefault();
      pick(suggestions[activeIndex]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  return (
    <div ref={wrapperRef} className="relative w-full sm:w-64">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <input
        value={query}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        aria-label="Search quarries and locations"
        aria-expanded={open && suggestions.length > 0}
        aria-autocomplete="list"
        className="w-full rounded-lg border border-input bg-card py-2 pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-ring"
      />
      {open && q.length >= 1 && (
        <div
          className="absolute left-0 right-0 top-full z-50 mt-1 max-h-80 overflow-y-auto rounded-xl border border-border bg-popover shadow-lg"
          role="listbox"
        >
          {suggestions.length === 0 ? (
            <div className="px-4 py-3 text-sm text-muted-foreground">No matching quarries or locations.</div>
          ) : (
            suggestions.map((s, i) => (
              <button
                key={s.id || i}
                type="button"
                role="option"
                aria-selected={i === activeIndex}
                onMouseEnter={() => setActiveIndex(i)}
                onClick={() => pick(s)}
                className={`flex w-full items-start gap-2.5 border-b border-border/60 px-3 py-2.5 text-left transition last:border-0 ${
                  i === activeIndex ? "bg-muted" : "hover:bg-muted/60"
                }`}
              >
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-sky-600" />
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-foreground">
                    {s.mine_name || "Unnamed site"}
                  </div>
                  <div className="truncate text-xs text-muted-foreground">
                    {[s.city, s.county, s.state].filter(Boolean).join(", ") || s.state || s.commodity || "—"}
                    {s.commodity ? ` · ${s.commodity}` : ""}
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}