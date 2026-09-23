import { base44 } from "@/api/base44Client";

const BOT_PATTERNS = [
  /googlebot/i, /bingbot/i, /slurp/i, /duckduckbot/i, /baiduspider/i, /yandexbot/i,
  /facebookexternalhit/i, /facebot/i, /meta-externalagent/i, /meta-externalfetcher/i,
  /twitterbot/i, /linkedinbot/i, /whatsapp/i, /telegrambot/i,
  /headlesschrome/i, /phantomjs/i, /puppeteer/i, /selenium/i,
  /crawler/i, /spider/i, /bot/i,
];

const ADMIN_EMAILS = new Set([
  "staffordrock@icloud.com",
  "contact+appreview@ssrockholdings.com",
]);

const PREVIEW_PATTERNS = [
  /preview-sandbox/i,
  /base44\.app\/preview/i,
  /commit\./i,
  /deploy-check/i,
];

function getSessionId() {
  try {
    const key = "ss_funnel_session";
    let id = sessionStorage.getItem(key);
    if (!id) {
      id = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      sessionStorage.setItem(key, id);
    }
    return id;
  } catch {
    return `session-${Date.now()}`;
  }
}

function isQualifiedUser(user) {
  const email = String(user?.email || "").toLowerCase();
  const role = String(user?.role || "").toLowerCase();
  if (ADMIN_EMAILS.has(email)) return false;
  if (role === "admin") return false;
  return true;
}

function isBotEnvironment() {
  const ua = String(navigator?.userAgent || "");
  if (navigator?.webdriver === true) return true;
  if (BOT_PATTERNS.some((p) => p.test(ua))) return true;
  const href = String(window?.location?.href || "");
  const ref = String(document?.referrer || "");
  if (PREVIEW_PATTERNS.some((p) => p.test(href) || p.test(ref))) return true;
  return false;
}

/**
 * Tracks a funnel event to ViewerActivity. Silently skips bots, admin/owner
 * accounts, and Base44 preview/commit URLs so qualified/human traffic stays clean.
 */
export async function trackFunnelEvent({ page_type, resource_id, resource_name, path, user }) {
  try {
    if (isBotEnvironment()) return;
    if (user && !isQualifiedUser(user)) return;

    const record = {
      user_id: user?.id || "anonymous",
      user_name: user?.name || "Anonymous visitor",
      user_email: user?.email || "",
      user_role: user?.role || "anonymous",
      path: path || window.location.pathname,
      page_type: page_type || "funnel_event",
      resource_id: resource_id || "",
      resource_name: String(resource_name || "").slice(0, 180),
      referrer: document.referrer || "",
      session_id: getSessionId(),
      user_agent: navigator.userAgent || "",
      viewed_at: new Date().toISOString(),
    };
    await base44.entities.ViewerActivity.create(record);
  } catch {
    // Tracking must never block the user experience.
  }
}