import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";

function getSessionId() {
  const key = "ss_view_session";
  let id = sessionStorage.getItem(key);
  if (!id) {
    id = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    sessionStorage.setItem(key, id);
  }
  return id;
}

function classifyPath(pathname) {
  if (pathname.startsWith("/mines/")) return { page_type: "mine_detail", resource_id: pathname.split("/")[2] || "" };
  if (pathname.startsWith("/listings/")) return { page_type: "listing_detail", resource_id: pathname.split("/")[2] || "" };
  if (pathname.startsWith("/admin/")) return { page_type: "admin", resource_id: "" };
  if (pathname === "/") return { page_type: "marketplace_home", resource_id: "" };
  return { page_type: "page", resource_id: "" };
}

export default function ActivityTracker() {
  const location = useLocation();
  const { user } = useAuth();

  useEffect(() => {
    const track = async () => {
      try {
        const meta = classifyPath(location.pathname);
        await base44.entities.ViewerActivity.create({
          user_id: user?.id || "anonymous",
          user_name: user?.name || "Anonymous visitor",
          user_email: user?.email || "",
          user_role: user?.role || "anonymous",
          path: `${location.pathname}${location.search || ""}`,
          page_type: meta.page_type,
          resource_id: meta.resource_id,
          referrer: document.referrer || "",
          session_id: getSessionId(),
          user_agent: navigator.userAgent || "",
          viewed_at: new Date().toISOString(),
        });
      } catch (error) {
        console.warn("Viewer activity tracking failed", error);
      }
    };

    track();
  }, [location.pathname, location.search, user?.id, user?.email, user?.name, user?.role]);

  return null;
}
