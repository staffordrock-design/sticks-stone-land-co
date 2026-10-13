// Google Ads conversion tracking for verified Stripe subscription purchases.
// The gtag bootstrap lives at module scope in src/App.jsx, so window.gtag is
// already initialized by the time this function runs.
const SUBSCRIBE_PAID_DESTINATION = "AW-18504553803/gwFOCM7_yZcdEMuq1PdE";
const sentThisPage = new Set();
const RECEIPT_PREFIX = "ss_google_ads_purchase_";

// Only accepts the receipt returned after server-side Stripe payment verification.
// The receipt uses a hash rather than disclosing the Stripe checkout session ID.
export function trackVerifiedGoogleAdsPurchase(receipt) {
  if (receipt?.verified !== true || !/^[a-f0-9]{64}$/.test(receipt?.transaction_id || "")) return false;
  const value = Number(receipt.value);
  const currency = String(receipt.currency || "").toUpperCase();
  if (!Number.isFinite(value) || value <= 0 || !/^[A-Z]{3}$/.test(currency)) return false;
  if (typeof window === "undefined" || !window.gtag) return false;
  const id = receipt.transaction_id;
  try {
    if (localStorage.getItem(RECEIPT_PREFIX + id) === "sent") return false;
  } catch {}
  if (sentThisPage.has(id)) return false;
  sentThisPage.add(id);
  try {
    window.gtag("event", "conversion", {
      send_to: SUBSCRIBE_PAID_DESTINATION,
      value,
      currency,
      transaction_id: id,
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