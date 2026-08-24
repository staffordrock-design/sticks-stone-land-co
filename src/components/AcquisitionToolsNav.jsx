import React from "react";
import { Link } from "react-router-dom";
export default function AcquisitionToolsNav(){return <div className="flex flex-wrap gap-4 text-sm font-semibold"><Link to="/compare" className="hover:text-sky-800">Compare</Link><Link to="/watchlist" className="hover:text-sky-800">Watchlist</Link><Link to="/deal-investor" className="hover:text-sky-800">Deal / Investor</Link></div>}
