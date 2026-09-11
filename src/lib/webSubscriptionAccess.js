import { base44 } from "@/api/base44Client";

const BROWSER_SESSION_KEY = "ss_subscription_browser_session";
const ACCESS_KEY = "ss_web_subscription_access";

function randomId() {
  try {
    if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  } catch {}
  return `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}

export function getWebSubscriptionBrowserId() {
  try {
    let id = localStorage.getItem(BROWSER_SESSION_KEY);
    if (!id) {
      id = randomId();
      localStorage.setItem(BROWSER_SESSION_KEY, id);
    }
    return id;
  } catch {
    return randomId();
  }
}

export function saveWebSubscriptionAccess(access = {}) {
  try {
    const value = {
      sessionId: String(access.sessionId || ""),
      browserSessionId: String(access.browserSessionId || getWebSubscriptionBrowserId()),
      planCode: String(access.planCode || ""),
      expiresAt: String(access.expiresAt || ""),
      savedAt: new Date().toISOString(),
    };
    if (!value.sessionId || !value.browserSessionId) return;
    localStorage.setItem(ACCESS_KEY, JSON.stringify(value));
  } catch {}
}

export function getSavedWebSubscriptionAccess() {
  try {
    const raw = localStorage.getItem(ACCESS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.sessionId || !parsed?.browserSessionId) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearWebSubscriptionAccess() {
  try { localStorage.removeItem(ACCESS_KEY); } catch {}
}

export async function verifySavedWebSubscriptionAccess(overrideSessionId = "") {
  const saved = getSavedWebSubscriptionAccess();
  const sessionId = String(overrideSessionId || saved?.sessionId || "").trim();
  const browserSessionId = String(saved?.browserSessionId || getWebSubscriptionBrowserId()).trim();
  if (!sessionId || !browserSessionId) return { active: false };

  try {
    const response = await base44.functions.invoke("verify-public-stripe-subscription", {
      session_id: sessionId,
      browser_session_id: browserSessionId,
    });
    const payload = response?.data || response || {};
    if (payload?.active) {
      saveWebSubscriptionAccess({
        sessionId,
        browserSessionId,
        planCode: payload.plan_code,
        expiresAt: payload.expires_at,
      });
      return payload;
    }
    if (saved?.sessionId === sessionId) clearWebSubscriptionAccess();
    return { active: false, ...payload };
  } catch (error) {
    return { active: false, error: error?.message || String(error) };
  }
}
