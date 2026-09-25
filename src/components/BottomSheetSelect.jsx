import React, { useState } from "react";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerTrigger } from "@/components/ui/drawer";
import { Check, ChevronDown } from "lucide-react";

const optValue = (opt) => (opt && typeof opt === "object" ? opt.value : opt);
const optLabel = (opt) => (opt && typeof opt === "object" ? opt.label : opt);

// Renders a native <select> on desktop and a bottom-sheet drawer on mobile.
// Options may be strings or { value, label } objects for display-vs-stored value.
export default function BottomSheetSelect({ value, onChange, options, label = "Select", className = "" }) {
  const [open, setOpen] = useState(false);
  const selectedLabel = options.map(optLabel).find((l, i) => optValue(options[i]) === value) || value;
  return (
    <>
      <div className="lg:hidden">
        <Drawer open={open} onOpenChange={setOpen}>
          <DrawerTrigger asChild>
            <button
              type="button"
              aria-label={label}
              className={`inline-flex min-h-[44px] w-full items-center justify-between rounded-lg border border-input bg-card px-3 py-2 text-xs font-semibold text-foreground ${className}`}
            >
              <span>{selectedLabel}</span>
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            </button>
          </DrawerTrigger>
          <DrawerContent className="max-h-[70vh]">
            <DrawerHeader className="pb-2">
              <DrawerTitle>{label}</DrawerTitle>
            </DrawerHeader>
            <div
              className="overflow-y-auto p-2"
              style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 16px) + 8px)" }}
            >
              {options.map((opt) => {
                const val = optValue(opt);
                const lbl = optLabel(opt);
                const active = val === value;
                return (
                  <button
                    key={val}
                    onClick={() => {
                      onChange(val);
                      setOpen(false);
                    }}
                    className={`flex min-h-[48px] w-full items-center justify-between rounded-xl px-4 py-3 text-sm font-medium transition ${
                      active ? "bg-slate-900 text-white dark:bg-primary dark:text-primary-foreground" : "text-foreground hover:bg-muted"
                    }`}
                  >
                    {lbl}
                    {active && <Check className="h-4 w-4" />}
                  </button>
                );
              })}
            </div>
          </DrawerContent>
        </Drawer>
      </div>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`hidden min-h-[44px] rounded-lg border border-input bg-card px-3 py-2 text-xs font-semibold text-foreground outline-none focus:ring-2 focus:ring-ring lg:block ${className}`}
      >
        {options.map((opt) => {
          const val = optValue(opt);
          const lbl = optLabel(opt);
          return <option key={val} value={val}>{lbl}</option>;
        })}
      </select>
    </>
  );
}