import React from "react";
import { Link } from "react-router-dom";
import { BriefcaseBusiness } from "lucide-react";
export default function DealInvestorShortcut(){return <Link to="/deal-investor" className="inline-flex items-center gap-2 text-sm font-semibold text-sky-800 hover:text-sky-900"><BriefcaseBusiness className="h-4 w-4"/>Deal / Investor</Link>}
