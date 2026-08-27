export const REVIEW_DEMO_EMAIL = "contact+appreview@ssrockholdings.com";

export function isReviewDemoAccount(email) {
  return Boolean(email) && email.toLowerCase() === REVIEW_DEMO_EMAIL;
}
