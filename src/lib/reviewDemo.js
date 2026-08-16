const REVIEW_DEMO_KEY = "ss-apple-review-demo";

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
