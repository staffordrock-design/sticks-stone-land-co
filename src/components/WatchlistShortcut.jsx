import React from "react";
import { Link } from "react-router-dom";
import { Bell } from "lucide-react";
export default function WatchlistShortcut(){return <Link to="/watchlist" className="inline-flex items-center gap-2 text-sm font-semibold text-sky-800 hover:text-sky-900"><Bell className="h-4 w-4"/>Watchlist</Link>}
