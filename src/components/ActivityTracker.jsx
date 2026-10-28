import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { trackFunnelEvent } from "@/lib/funnelTracking";
import { useAuth } from "@/lib/AuthContext";

function classifyPath(pathname) {
  if (pathname.startsWith("/mines/")) return { page_type: "mine_detail", resource_id: pathname.split("/")[2] || "" };
  if (pathname.startsWith("/listings/")) return { page_type: "listing_detail", resource_id: pathname.split("/")[2] || "" };
  if (pathname.startsWith("/admin/")) return { page_type: "admin", resource_id: "" };
  if (pathname === "/") return { page_type: "marketplace_home", resource_id: "" };
  return { page_type: "page", resource_id: "" };
}

export default function ActivityTracker() {
  const location = useLocation();
  const { user, authChecked } = useAuth();

  useEffect(() => {
    if (!authChecked) return;

    const track = async () => {
      try {
        const meta = classifyPath(location.pathname);
        await trackFunnelEvent({
          user, path: `${location.pathname}${location.search || ""}`,
          page_type: meta.page_type, resource_id: meta.resource_id,
        });
      } catch (error) {
        console.warn("Viewer activity tracking failed", error);
      }
    };

    track();
  }, [authChecked, location.pathname, location.search, user?.id, user?.email, user?.name, user?.role]);

  return null;
}
