import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';

const BOT_PATTERNS = [
  /googlebot/i,
  /bingbot/i,
  /slurp/i,
  /duckduckbot/i,
  /baiduspider/i,
  /yandexbot/i,
  /facebookexternalhit/i,
  /facebot/i,
  /meta-externalagent/i,
  /meta-externalfetcher/i,
  /twitterbot/i,
  /linkedinbot/i,
  /whatsapp/i,
  /telegrambot/i,
  /headlesschrome/i,
  /phantomjs/i,
  /puppeteer/i,
  /selenium/i,
  /apex/i,
  /crawler/i,
  /spider/i,
  /bot/i,
];

const ADMIN_EMAILS = new Set([
  'staffordrock@icloud.com',
  'contact@ssrockholdings.com',
  'karringtonstafford@gmail.com',
  'contact+appreview@ssrockholdings.com',
]);

const PREVIEW_PATTERNS = [
  /preview-sandbox/i,
  /base44\.app\/preview/i,
  /commit\./i,
  /deploy-check/i,
];

function isBotActivity(record: any): boolean {
  const ua = String(record?.user_agent || '');
  const ref = String(record?.referrer || '');
  const path = String(record?.path || '');
  if (BOT_PATTERNS.some((p) => p.test(ua))) return true;
  if (PREVIEW_PATTERNS.some((p) => p.test(ref) || p.test(path))) return true;
  return false;
}

function isAdminActivity(record: any): boolean {
  const email = String(record?.user_email || '').toLowerCase();
  const role = String(record?.user_role || '').toLowerCase();
  if (ADMIN_EMAILS.has(email)) return true;
  if (role === 'admin') return true;
  if (['6a78376a454093ba2f431ace','6a83be5a6f033f818145ab59','6a832a01e8e76c3871c9be33'].includes(String(record?.user_id || record?.created_by_id || ''))) return true;
  return false;
}

function isQualified(record: any): boolean {
  return !isBotActivity(record) && !isAdminActivity(record);
}

function trafficSource(referrer: string): string {
  const ref = String(referrer || '').toLowerCase();
  if (!ref) return 'direct';
  if (ref.includes('linkedin')) return 'LinkedIn';
  if (ref.includes('facebook') || ref.includes('meta.com') || ref.includes('fb.com')) return 'Facebook';
  if (ref.includes('google')) return 'Google';
  if (ref.includes('apple.com') || ref.includes('apps.apple.com') || ref.includes('itunes')) return 'App Store/iOS';
  if (ref.includes('ssrockholdings.com')) return 'website';
  if (ref.includes('base44.app')) return 'Base44';
  return 'other referral';
}

function funnelStep(record: any): string | null {
  const path = String(record?.path || '');
  const pageType = String(record?.page_type || '');
  const resourceId = String(record?.resource_id || '');

  if (resourceId === 'checkout_completed') return 'checkout_completed';
  if (resourceId === 'store_entitlement_activated') return 'entitlement_activated';
  if (resourceId === 'store_backend_verification_succeeded') return 'backend_verification_succeeded';
  if (resourceId === 'store_purchase_sheet_opening') return 'apple_purchase_sheet_opened';
  if (resourceId === 'checkout_created') return 'checkout_started';
  if (resourceId === 'store_product_loaded') return 'apple_product_loaded';
  if (resourceId === 'store_purchase_cancelled' || resourceId === 'checkout_cancelled') return 'purchase_canceled';
  if (/error$/.test(resourceId)) return 'purchase_error';
  if (resourceId === 'subscribe_cta_clicked') return 'subscribe_clicked';
  if (pageType === 'quarry_teaser' || resourceId === 'quarry_teaser') return 'quarry_teaser_viewed';
  if (path.split('?')[0] === '/subscribe' || pageType === 'subscription_page') return 'paywall_viewed';
  if (path.startsWith('/mines/')) return 'premium_intelligence_attempted';
  if (path === '/') return 'homepage_viewed';
  return null;
}

function emptyMetrics() {
  return {
    unique_visitors: new Set<string>(),
    homepage_viewed: new Set<string>(),
    quarry_teaser_viewed: new Set<string>(),
    premium_intelligence_attempted: new Set<string>(),
    paywall_viewed: new Set<string>(),
    subscribe_clicked: new Set<string>(),
    apple_product_loaded: new Set<string>(),
    checkout_started: new Set<string>(),
    apple_purchase_sheet_opened: new Set<string>(),
    purchase_canceled: new Set<string>(),
    purchase_error: new Set<string>(),
    backend_verification_succeeded: new Set<string>(),
    entitlement_activated: new Set<string>(),
    checkout_completed: new Set<string>(),
    paid_subscriber: new Set<string>(),
    revenue: 0,
    bySource: {} as Record<string, Set<string>>,
    bySourcePaid: {} as Record<string, number>,
  };
}

function addRecordToMetrics(metrics: any, record: any) {
  const sessionId = String(record?.session_id || record?.user_id || record?.id || '');
  if (!sessionId) return;

  const step = funnelStep(record);
  if (step && metrics[step]) metrics[step].add(sessionId);
  metrics.unique_visitors.add(sessionId);

  const source = trafficSource(record?.referrer);
  if (!metrics.bySource[source]) metrics.bySource[source] = new Set();
  metrics.bySource[source].add(sessionId);

  if (step === 'paid_subscriber') {
    metrics.revenue += 39;
    if (!metrics.bySourcePaid[source]) metrics.bySourcePaid[source] = 0;
    metrics.bySourcePaid[source] += 1;
  }
}

function summarizeMetrics(metrics: any, payments: any[] = []) {
  const m = (key: string) => metrics[key]?.size || 0;
  const visitors = m('unique_visitors');
  const paywall = m('paywall_viewed');
  const subscribeClick = m('subscribe_clicked');
  const checkoutStarted = new Set([...metrics.checkout_started, ...metrics.apple_purchase_sheet_opened]).size;
  const paid = new Set(payments.map(p => p.user_id || p.customer_email || p.external_transaction_id)).size;

  return {
    unique_visitors: visitors,
    homepage_viewed: m('homepage_viewed'),
    quarry_teaser_viewed: m('quarry_teaser_viewed'),
    premium_intelligence_attempted: m('premium_intelligence_attempted'),
    paywall_viewed: paywall,
    subscribe_clicked: subscribeClick,
    apple_product_loaded: m('apple_product_loaded'),
    checkout_started: m('checkout_started'),
    checkout_started_total: checkoutStarted,
    apple_purchase_sheet_opened: m('apple_purchase_sheet_opened'),
    purchase_canceled: m('purchase_canceled'),
    purchase_error: m('purchase_error'),
    backend_verification_succeeded: m('backend_verification_succeeded'),
    entitlement_activated: m('entitlement_activated'),
    checkout_completed: m('checkout_completed'),
    paid_subscribers: paid,
    revenue: payments.filter(p => String(p.currency).toUpperCase() === 'USD').reduce((sum, p) => sum + Number(p.amount || 0), 0),
    revenue_note: 'Verified recorded USD payments; excludes legacy subscription/session snapshots. Other currencies are not summed.',
    conversion: {
      visitor_to_paywall: visitors > 0 ? Math.round((paywall / visitors) * 1000) / 10 : 0,
      paywall_to_subscribe: paywall > 0 ? Math.round((subscribeClick / paywall) * 1000) / 10 : 0,
      subscribe_to_checkout: subscribeClick > 0 ? Math.round((checkoutStarted / subscribeClick) * 1000) / 10 : 0,
      checkout_to_paid: checkoutStarted > 0 ? Math.round((paid / checkoutStarted) * 1000) / 10 : 0,
      visitor_to_paid: visitors > 0 ? Math.round((paid / visitors) * 1000) / 10 : 0,
    },
    by_source: Object.fromEntries(
      Object.entries(metrics.bySource).map(([k, v]) => [k, (v as Set<string>).size])
    ),
    by_source_paid: metrics.bySourcePaid,
  };
}

export default async function(req: Request) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user?.id || user.role !== 'admin') {
      return Response.json({ error: 'Admin access required' }, { status: 403 });
    }

    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

    // Load recent ViewerActivity records (up to 500 per query, paginate if needed)
    const loadRecent = async (since: string, limit: number = 500) => {
      const all: any[] = [];
      let offset = 0;
      while (offset < 2000) {
        const batch = await base44.asServiceRole.entities.ViewerActivity.filter(
          { viewed_at: { $gte: since } },
          '-viewed_at',
          limit,
          offset
        );
        if (!batch || batch.length === 0) break;
        all.push(...batch);
        if (batch.length < limit) break;
        offset += limit;
      }
      return all;
    };

    const [todayRecords, weekRecords, allTimeRecords] = await Promise.all([
      loadRecent(todayStart, 500),
      loadRecent(sevenDaysAgo, 500),
      base44.asServiceRole.entities.ViewerActivity.list('-viewed_at', 500),
    ]);

    const billing = await base44.asServiceRole.entities.BillingEvent.filter({ status: 'Paid', revenue_type: 'Subscription' }, '-occurred_at', 500, 0);
    const payments = [...new Map((billing || []).map(p => [p.external_transaction_id || p.id, p])).values()].filter(p =>
      !ADMIN_EMAILS.has(String(p.customer_email || '').toLowerCase()) &&
      !['6a78376a454093ba2f431ace','6a83be5a6f033f818145ab59','6a832a01e8e76c3871c9be33'].includes(String(p.user_id || '')) &&
      (p.platform !== 'Stripe' || String(p.external_transaction_id || '').startsWith('in_'))
    );
    const todayMetrics = emptyMetrics();
    const weekMetrics = emptyMetrics();
    const allTimeMetrics = emptyMetrics();

    for (const r of todayRecords) {
      if (isQualified(r)) addRecordToMetrics(todayMetrics, r);
    }
    for (const r of weekRecords) {
      if (isQualified(r)) addRecordToMetrics(weekMetrics, r);
    }
    for (const r of (allTimeRecords || [])) {
      if (isQualified(r)) addRecordToMetrics(allTimeMetrics, r);
    }

    return Response.json({
      today: summarizeMetrics(todayMetrics, payments.filter(p => p.occurred_at >= todayStart)),
      last_7_days: summarizeMetrics(weekMetrics, payments.filter(p => p.occurred_at >= sevenDaysAgo)),
      all_time: summarizeMetrics(allTimeMetrics, payments.filter(p => p.occurred_at >= String((allTimeRecords || []).at(-1)?.viewed_at || '9999'))),
      history_note: 'Traffic history below is a bounded recent sample, not lifetime traffic; payment totals use that sample's time window. Anonymous testing that does not identify itself cannot always be excluded.',
      excluded: {
        note: 'Bots (Googlebot, Facebook/Meta crawlers, HeadlessChrome, etc.), admin/owner testing, Base44 preview URLs, and Apple review accounts are excluded from qualified traffic.',
      },
    });
  } catch (error) {
    console.error('get-conversion-funnel error:', error);
    return Response.json({ error: error?.message || String(error) }, { status: 500 });
  }
}