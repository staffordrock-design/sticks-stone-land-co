import React, { useEffect, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { isNativeIOS } from "@/lib/appleSubscriptions";

const PUBLIC_PATHS = new Set([
  "/",
  "/login",
  "/register",
  "/forgot-password",
  "/reset-password",
  "/oauth/consent",
  "/privacy",
  "/terms",
  "/support",
  "/account/delete",
  "/account-deletion",
  "/subscribe",
]);

// A completed profile is useful for account/workspace features, but it must never
// stand between a paid subscriber and the quarry intelligence they purchased.
const PROFILE_REQUIRED_PATHS = new Set([
  "/watchlist",
  "/opportunities",
  "/buyer-profile",
  "/sell",
  "/seller-portal",
  "/network",
  "/network/community",
  "/messages",
]);

function loadingScreen() {
  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-background">
      <div className="text-center">
        <Loader2 className="mx-auto h-7 w-7 animate-spin text-slate-700" />
        <p className="mt-3 text-sm font-medium text-muted-foreground">Opening your S&amp;S account…</p>
      </div>
    </div>
  );
}

export default function AccountProfileGate({ children }) {
  const { pathname, search } = useLocation();
  const { user, isLoadingAuth, isLoadingPublicSettings, authChecked } = useAuth();
  const [profileState, setProfileState] = useState({ loading: true, complete: false });

  const isPublic = PUBLIC_PATHS.has(pathname);
  const isProfile = pathname === "/profile";
  const requiresProfile = PROFILE_REQUIRED_PATHS.has(pathname);

  useEffect(() => {
    let cancelled = false;

    if (isPublic || !requiresProfile || !user?.id) {
      setProfileState({ loading: false, complete: false });
      return () => { cancelled = true; };
    }

    setProfileState((current) => ({ ...current, loading: true }));
    (async () => {
      try {
        const rows = await base44.entities.UserProfile.filter({ user_id: user.id }, "-updated_date", 1);
        const profile = rows?.[0] || null;
        if (!cancelled) setProfileState({ loading: false, complete: Boolean(profile?.profile_complete), profile });
      } catch (error) {
        console.error("User profile check failed", error);
        if (!cancelled) setProfileState({ loading: false, complete: false, profile: null });
      }
    })();

    return () => { cancelled = true; };
  }, [user?.id, pathname, isPublic, requiresProfile]);

  if (isPublic || (!requiresProfile && !isProfile)) return children;
  if (isNativeIOS() && !user?.id) return children;

  if (isLoadingPublicSettings || isLoadingAuth || !authChecked) return loadingScreen();

  if (!user?.id) {
    const returnTo = `${pathname}${search || ""}`;
    return <Navigate to={`/login?returnTo=${encodeURIComponent(returnTo)}`} replace />;
  }

  if (isProfile) return children;

  if (profileState.loading) return loadingScreen();

  if (!profileState.complete) {
    const returnTo = `${pathname}${search || ""}`;
    return <Navigate to={`/profile?returnTo=${encodeURIComponent(returnTo)}`} replace />;
  }

  return children;
}
