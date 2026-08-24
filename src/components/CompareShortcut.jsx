import React from "react";
import { Link } from "react-router-dom";
import { GitCompareArrows } from "lucide-react";
export default function CompareShortcut(){return <Link to="/compare" className="inline-flex items-center gap-2 text-sm font-semibold text-sky-800 hover:text-sky-900"><GitCompareArrows className="h-4 w-4"/>Compare</Link>}
