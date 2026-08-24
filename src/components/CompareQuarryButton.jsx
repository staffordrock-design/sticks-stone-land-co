import React, { useMemo } from "react";
import { GitCompareArrows } from "lucide-react";
import { useNavigate } from "react-router-dom";

export default function CompareQuarryButton({ site, className = "" }) {
  const navigate = useNavigate();
  const compareUrl = useMemo(() => site?.id ? `/compare?ids=${encodeURIComponent(site.id)}` : "/compare", [site?.id]);
  return <button type="button" onClick={()=>navigate(compareUrl)} className={`inline-flex items-center gap-2 rounded-xl border border-border px-4 py-2 text-xs font-bold transition hover:bg-muted ${className}`}><GitCompareArrows className="h-4 w-4 text-sky-700"/>Compare quarry</button>;
}
