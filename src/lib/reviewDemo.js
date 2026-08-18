const REVIEW_DEMO_KEY = "ss-apple-review-demo";

export const REVIEW_DEMO_EMAIL = "appreview@ssrockholdings.com";

export function isReviewDemoAccount(email) {
  return Boolean(email) && email.toLowerCase() === REVIEW_DEMO_EMAIL;
}

export function isReviewDemoMode() {
  try {
    return typeof window !== "undefined" && window.localStorage.getItem(REVIEW_DEMO_KEY) === "active";
  } catch {
    return false;
  }
}

export function enableReviewDemoMode() {
  try {
    window.localStorage.setItem(REVIEW_DEMO_KEY, "active");
  } catch {}
}

export function disableReviewDemoMode() {
  try {
    window.localStorage.removeItem(REVIEW_DEMO_KEY);
  } catch {}
}