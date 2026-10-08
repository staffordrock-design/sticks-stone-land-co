import { Capacitor } from "@capacitor/core";

const TAG_ID = "AW-18500427701";
const PURCHASE_DESTINATION = "AW-18500427701/jB7dCJbxjZUdELW_2PVE";
const sentThisPage = new Set();
const RECEIPT_PREFIX = "ss_google_ads_purchase_";

export function initializeGoogleAds() {
  if (typeof window === "undefined" || typeof document === "undefined" || Capacitor.isNativePlatform()) return false;
  if (!["ssrockholdings.com", "www.ssrockholdings.com"].includes(window.location.hostname)) return false;
  if (window.__ssGoogleAdsInitialized) return true;
  window.dataLayer = window.dataLayer || [];
  window.gtag = window.gtag || function () { window.dataLayer.push(arguments); };
  const cleanUrl = window.location.origin + window.location.pathname;
  window.gtag("js", new Date());
  window.gtag("config", TAG_ID, {
    send_page_view: false,
    page_location: cleanUrl,
    page_referrer: "",
    allow_google_signals: false,
    allow_ad_personalization_signals: false,
  });
  if (!document.querySelector('script[data-ss-google-ads]')) {
    const script = document.createElement("script");
    script.async = true;
    script.src = "https://www.googletagmanager.com/gtag/js?id=" + TAG_ID;
    script.setAttribute("data-ss-google-ads", "true");
    document.head.appendChild(script);
  }
  window.__ssGoogleAdsInitialized = true;
  return true;
}

// Only accepts the receipt returned after server-side Stripe payment verification.
// The receipt uses a hash rather than disclosing the Stripe checkout session ID.
export function trackVerifiedGoogleAdsPurchase(receipt) {
  if (receipt?.verified !== true || !/^[a-f0-9]{64}$/.test(receipt?.transaction_id || "")) return false;
  const value = Number(receipt.value);
  const currency = String(receipt.currency || "").toUpperCase();
  if (!Number.isFinite(value) || value <= 0 || !/^[A-Z]{3}$/.test(currency)) return false;
  if (!initializeGoogleAds()) return false;
  const id = receipt.transaction_id;
  try {
    if (localStorage.getItem(RECEIPT_PREFIX + id) === "sent") return false;
  } catch {}
  if (sentThisPage.has(id)) return false;
  sentThisPage.add(id);
  try {
    window.gtag("event", "conversion", {
      send_to: PURCHASE_DESTINATION,
      value,
      currency,
      transaction_id: id,
      page_location: window.location.origin + window.location.pathname,
      page_referrer: "",
      event_callback: () => {
        try { localStorage.setItem(RECEIPT_PREFIX + id, "sent"); } catch {}
      },
    });
    return true;
  } catch {
    sentThisPage.delete(id);
    return false;
  }
}
