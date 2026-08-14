import { useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Capacitor } from "@capacitor/core";
import { App as CapacitorApp } from "@capacitor/app";

// Hooks the native hardware back button: navigate react-router backwards,
// and only exit the app when already at the marketplace root.
export default function NativeBackHandler() {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    const listenerPromise = CapacitorApp.addListener("backButton", () => {
      if (location.pathname !== "/") {
        navigate(-1);
      } else {
        CapacitorApp.exitApp();
      }
    });
    return () => {
      listenerPromise.then((l) => l.remove());
    };
  }, [navigate, location.pathname]);

  return null;
}