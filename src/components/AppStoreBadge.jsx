import React from "react";

// Update this URL with your actual App Store listing once the app is published.
const APP_STORE_URL = "https://apps.apple.com/us/app/idYOUR_APP_ID";

export default function AppStoreBadge({ className = "", variant = "dark" }) {
  const isDark = variant === "dark";
  return (
    <a
      href={APP_STORE_URL}
      target="_blank"
      rel="noreferrer"
      aria-label="Download S&S Rock Holdings on the App Store"
      className={`inline-flex items-center gap-2.5 rounded-xl px-3.5 py-2 transition hover:opacity-90 ${isDark ? "bg-black" : "bg-white border border-slate-300"} ${className}`}
    >
      <svg viewBox="0 0 24 24" className="h-7 w-7 shrink-0" fill={isDark ? "#fff" : "#000"}>
        <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.07-.35 2.22-.99 3.01-.67.83-1.83 1.47-2.95 1.39-.15-1.09.46-2.25 1-2.9" />
      </svg>
      <div className="flex flex-col leading-none">
        <span className={`text-[10px] font-medium ${isDark ? "text-slate-300" : "text-slate-500"}`}>Download on the</span>
        <span className={`text-base font-semibold ${isDark ? "text-white" : "text-slate-900"}`}>App Store</span>
      </div>
    </a>
  );
}