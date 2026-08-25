import React from "react";

/**
 * S&S Rock Holdings brand mark — a bold, geometric boulder silhouette.
 * Clean angular facets read clearly at small sizes (header icon).
 */
export default function BrandLogo({ withWordmark = true, className = "", iconClassName = "h-9 w-9" }) {
  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      <div className={`relative flex shrink-0 items-center justify-center ${iconClassName}`}>
        <svg
          viewBox="0 0 48 48"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="h-full w-full"
          aria-hidden="true"
        >
          {/* Main boulder body — bold angular silhouette */}
          <path
            d="M24 3 L41 11 L45 27 L37 43 L13 45 L4 31 L8 13 Z"
            fill="url(#boulderGrad)"
            stroke="#1e293b"
            strokeWidth="2"
            strokeLinejoin="round"
          />
          {/* Top-left light facet */}
          <path
            d="M24 3 L8 13 L20 20 L24 3 Z"
            fill="#e2e8f0"
            stroke="#1e293b"
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
          {/* Top-right mid facet */}
          <path
            d="M24 3 L41 11 L30 19 L24 3 Z"
            fill="#94a3b8"
            stroke="#1e293b"
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
          {/* Bottom shadow facet */}
          <path
            d="M41 11 L45 27 L30 19 Z"
            fill="#475569"
            stroke="#1e293b"
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
          <path
            d="M8 13 L4 31 L20 20 Z"
            fill="#64748b"
            stroke="#1e293b"
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
          <defs>
            <linearGradient id="boulderGrad" x1="8" y1="6" x2="40" y2="44" gradientUnits="userSpaceOnUse">
              <stop stopColor="#cbd5e1" />
              <stop offset="0.45" stopColor="#64748b" />
              <stop offset="1" stopColor="#334155" />
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