import React from "react";
import CompareQuarryButton from "@/components/CompareQuarryButton";
import WatchQuarryButton from "@/components/WatchQuarryButton";

export default function QuarryActionBar({ site }){
 if(!site) return null;
 return <div className="flex flex-wrap gap-2"><WatchQuarryButton site={site}/><CompareQuarryButton site={site}/></div>
}
