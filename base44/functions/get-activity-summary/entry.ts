import { createClientFromRequest } from "npm:@base44/sdk";

const INTERNAL_EMAILS = new Set([
  "contact@ssrockholdings.com",
  "contact+appreview@ssrockholdings.com",
  "karringtonstafford@gmail.com",
]);

const BOT_PATTERN = /(bot|crawler|spider|headless|lighthouse|pagespeed|facebookexternalhit|linkedinbot|slurp)/i;

function visitorKey(row: any) {
  const email = String(row?.user_email || "").toLowerCase();
  if (email) return `user:${email}`;
  if (row?.session_id) return `session:${row.session_id}`;
  if (row?.user_id && row.user_id !== "anonymous") return `user:${row.user_id}`;
  return null;
}

function isHumanExternal(row: any) {
  const email = String(row?.user_email || "").toLowerCase();
  const role = String(row?.user_role || "").toLowerCase();
  const userAgent = String(row?.user_agent || "");

  if (role === "admin") return false;
  if (INTERNAL_EMAILS.has(email)) return false;
  if (BOT_PATTERN.test(userAgent)) return false;
  return true;
}

function rowTime(row: any) {
  return row?.viewed_at || row?.created_date || row?.updated_date || null;
}

async function readJsonBody(req: Request) {
  try {
    return await req.json();
  } catch (_) {
    return {};
  }
}

export default async function(req: Request) {
  try {
    const base44 = createClientFromRequest(req);
    const body = await readJsonBody(req);
    const url = new URL(req.url);
    const requestedLimit = Number(body?.limit || url.searchParams.get("limit") || 2000);
    const pageSize = 500;
    const maxRows = Math.min(Math.max(requestedLimit, pageSize), 5000);

    const allRows: any[] = [];
    for (let offset = 0; offset < maxRows; offset += pageSize) {
      const page = await base44.asServiceRole.entities.ViewerActivity.list("-created_date", pageSize, offset);
      if (!page?.length) break;
      allRows.push(...page);
      if (page.length < pageSize) break;
    }

    const humanRows = allRows.filter(isHumanExternal);
    const uniqueVisitors = new Set(humanRows.map(visitorKey).filter(Boolean));
    const conversionSessions = new Set(
      humanRows
        .filter((row) => {
          const path = String(row?.path || "");
          return path.startsWith("/subscribe") || path.startsWith("/get-started");
        })
        .map(visitorKey)
        .filter(Boolean),
    );

    return Response.json({
      checked_at: new Date().toISOString(),
      sampled_rows: allRows.length,
      human_page_views: humanRows.length,
      likely_unique_visitors: uniqueVisitors.size,
      mine_detail_views: humanRows.filter((row) => row?.page_type === "mine_detail").length,
      conversion_sessions: conversionSessions.size,
      newest_record_at: rowTime(allRows[0]),
      oldest_record_in_sample_at: rowTime(allRows[allRows.length - 1]),
      note: "Counts exclude admins, app-review/internal emails, and obvious bot user agents.",
    });
  } catch (error) {
    return Response.json({ error: error?.message || "Unable to load viewer activity" }, { status: 500 });
  }
}
