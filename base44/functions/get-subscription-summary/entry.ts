import { createClientFromRequest } from "npm:@base44/sdk";

const INTERNAL_EMAIL_PATTERNS = [
  /^contact@ssrockholdings\.com$/i,
  /^contact\+appreview@ssrockholdings\.com$/i,
  /^karringtonstafford@gmail\.com$/i,
];

function isInternalEmail(value: any) {
  const email = String(value || "").trim();
  return INTERNAL_EMAIL_PATTERNS.some((pattern) => pattern.test(email));
}

function isRealSubscriber(row: any) {
  const status = String(row?.status || "").toLowerCase();
  const platform = String(row?.platform || "").toLowerCase();
  const source = String(row?.source || "").toLowerCase();
  const userId = String(row?.user_id || "").toLowerCase();

  if (!["active", "trial", "grace_period"].includes(status)) return false;
  if (platform === "admin" || source.includes("review") || source.includes("demo")) return false;
  if (userId.includes("review") || userId.includes("demo")) return false;
  return true;
}

function isPaidBilling(row: any) {
  const status = String(row?.status || "").toLowerCase();
  const revenueType = String(row?.revenue_type || "").toLowerCase();
  if (status !== "paid") return false;
  if (revenueType !== "subscription") return false;
  if (isInternalEmail(row?.customer_email)) return false;
  return true;
}

async function listAll(entity: any, sort = "-created_date", maxRows = 5000) {
  const rows: any[] = [];
  const pageSize = 500;
  for (let offset = 0; offset < maxRows; offset += pageSize) {
    const page = await entity.list(sort, pageSize, offset).catch(() => []);
    if (!page?.length) break;
    rows.push(...page);
    if (page.length < pageSize) break;
  }
  return rows;
}

function countBy(rows: any[], key: string) {
  return rows.reduce((acc: Record<string, number>, row: any) => {
    const value = String(row?.[key] || "unknown").toLowerCase();
    acc[value] = (acc[value] || 0) + 1;
    return acc;
  }, {});
}

function latestDate(rows: any[], fields: string[]) {
  const dates = rows
    .flatMap((row) => fields.map((field) => row?.[field]))
    .filter(Boolean)
    .map((value) => new Date(value).getTime())
    .filter((time) => Number.isFinite(time));
  if (!dates.length) return null;
  return new Date(Math.max(...dates)).toISOString();
}

export default async function(req: Request) {
  try {
    const base44 = createClientFromRequest(req);
    const [entitlements, receipts, billingEvents, summaries, funnel] = await Promise.all([
      listAll(base44.asServiceRole.entities.SubscriptionEntitlement, "-updated_date"),
      listAll(base44.asServiceRole.entities.StoreReceipt, "-created_date"),
      listAll(base44.asServiceRole.entities.BillingEvent, "-occurred_at"),
      listAll(base44.asServiceRole.entities.CustomerBillingSummary, "-updated_date"),
      listAll(base44.asServiceRole.entities.SubscriptionConversionFunnel, "-created_date"),
    ]);

    const realEntitlements = entitlements.filter(isRealSubscriber);
    const paidBillingEvents = billingEvents.filter(isPaidBilling);
    const verifiedReceipts = receipts.filter((row) => {
      const status = String(row?.status || "").toLowerCase();
      return status === "verified" && !String(row?.user_id || "").toLowerCase().includes("review");
    });
    const currentBillingSummaries = summaries.filter((row) => String(row?.billing_status || "").toLowerCase() === "current" && !isInternalEmail(row?.email));

    return Response.json({
      checked_at: new Date().toISOString(),
      active_or_trial_subscribers: realEntitlements.length,
      paid_subscription_events: paidBillingEvents.length,
      verified_store_receipts: verifiedReceipts.length,
      current_billing_summaries: currentBillingSummaries.length,
      entitlement_statuses: countBy(entitlements, "status"),
      entitlement_platforms: countBy(entitlements, "platform"),
      paid_platforms: countBy(paidBillingEvents, "platform"),
      latest_entitlement_activity_at: latestDate(entitlements, ["last_verified_at", "updated_date", "created_date", "started_at"]),
      latest_paid_subscription_at: latestDate(paidBillingEvents, ["occurred_at", "created_date"]),
      latest_funnel_rows: funnel.slice(0, 5).map((row: any) => ({
        period: row?.period,
        visitors: row?.visitors || 0,
        registered: row?.registered || 0,
        pricing_views: row?.pricing_views || 0,
        purchase_started: row?.purchase_started || 0,
        subscribed: row?.subscribed || 0,
      })),
      note: "Counts exclude obvious internal review/demo/admin entitlements where identifiable. App Store Connect sales may differ until receipts are verified in the app.",
    });
  } catch (error) {
    return Response.json({ error: error?.message || "Unable to load subscription summary" }, { status: 500 });
  }
}
