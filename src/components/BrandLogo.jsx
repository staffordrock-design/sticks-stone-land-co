import React from "react";

/**
 * S&S Rock Holdings brand mark — a bold, faceted boulder SVG.
 * Renders the rock icon alone when `withWordmark` is false.
 */
export default function BrandLogo({ withWordmark = true, className = "", iconClassName = "h-9 w-9" }) {
  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      <div className={`relative flex shrink-0 items-center justify-center rounded-lg bg-slate-900 shadow-sm ${iconClassName}`}>
        <svg
          viewBox="0 0 48 48"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="h-[78%] w-[78%]"
          aria-hidden="true"
        >
          {/* Bold faceted boulder — angular rock faces */}
          <path
            d="M24 4 L40 12 L44 26 L36 42 L14 44 L5 32 L8 14 Z"
            fill="url(#rockFace)"
            stroke="#0f172a"
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
          {/* Light facet — top right */}
          <path
            d="M24 4 L40 12 L30 18 L24 4 Z"
            fill="#cbd5e1"
            stroke="#0f172a"
            strokeWidth="1.2"
            strokeLinejoin="round"
          />
          {/* Mid facet — left face */}
          <path
            d="M24 4 L8 14 L18 22 L24 4 Z"
            fill="#94a3b8"
            stroke="#0f172a"
            strokeWidth="1.2"
            strokeLinejoin="round"
          />
          {/* Shadow facet — bottom */}
          <path
            d="M8 14 L5 32 L18 22 L18 22 Z"
            fill="#64748b"
            stroke="#0f172a"
            strokeWidth="1.2"
            strokeLinejoin="round"
          />
          <path
            d="M40 12 L44 26 L30 18 Z"
            fill="#475569"
            stroke="#0f172a"
            strokeWidth="1.2"
            strokeLinejoin="round"
          />
          {/* S&S monogram etched on the front face */}
          <text
            x="24"
            y="33"
            textAnchor="middle"
            fontFamily="ui-sans-serif, system-ui, sans-serif"
            fontWeight="800"
            fontSize="11"
            fill="#f8fafc"
            letterSpacing="0.5"
          >
            S&amp;S
          </text>
          <defs>
            <linearGradient id="rockFace" x1="10" y1="6" x2="38" y2="42" gradientUnits="userSpaceOnUse">
              <stop stopColor="#e2e8f0" />
              <stop offset="0.5" stopColor="#94a3b8" />
              <stop offset="1" stopColor="#475569" />
            </linearGradient>
          </defs>
        </svg>
      </div>
      {withWordmark && (
        <div className="leading-none">
          <p className="font-heading text-base font-bold tracking-tight text-foreground">
            S&amp;S Rock Holdings
          </p>
          <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
            Industrial Quarry Intelligence
          </p>
        </div>
      )}
    </div>
  );
}