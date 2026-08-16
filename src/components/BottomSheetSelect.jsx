import React, { useState } from "react";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerTrigger } from "@/components/ui/drawer";
import { Check, ChevronDown } from "lucide-react";

// Renders a native <select> on desktop and a bottom-sheet drawer on mobile.
export default function BottomSheetSelect({ value, onChange, options, label = "Select", className = "" }) {
  const [open, setOpen] = useState(false);
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
              <span>{value}</span>
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
                const active = opt === value;
                return (
                  <button
                    key={opt}
                    onClick={() => {
                      onChange(opt);
                      setOpen(false);
                    }}
                    className={`flex min-h-[48px] w-full items-center justify-between rounded-xl px-4 py-3 text-sm font-medium transition ${
                      active ? "bg-slate-900 text-white" : "text-foreground hover:bg-muted"
                    }`}
                  >
                    {opt}
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
        {options.map((opt) => (
          <option key={opt}>{opt}</option>
        ))}
      </select>
    </>
  );
}