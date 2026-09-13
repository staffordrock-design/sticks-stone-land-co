import React, { useState } from "react";
import { ChevronDown } from "lucide-react";

export default function IntelligenceSection({
  title,
  icon: Icon,
  children,
  defaultOpen = false,
  badge,
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="rounded-2xl border border-border bg-card overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-5 py-4 text-left transition hover:bg-muted/40"
        aria-expanded={open}
      >
        <div className="flex items-center gap-3">
          {Icon && <Icon className="h-5 w-5 text-sky-700" />}
          <h3 className="font-heading text-base font-bold text-foreground">{title}</h3>
          {badge && (
            <span className="rounded-full border border-border bg-muted/40 px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
              {badge}
            </span>
          )}
        </div>
        <ChevronDown
          className={`h-5 w-5 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && <div className="border-t border-border px-5 py-5">{children}</div>}
    </section>
  );
}