import { createClientFromRequest } from "npm:@base44/sdk@0.8.40";
import { secrets } from "base44:runtime";

const STATES = ["TN", "GA", "AL", "KY", "NC", "SC", "FL", "MS"];

export default async function (req: Request) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    if (user && user.role !== "admin") {
      return Response.json({ error: "Admin access required" }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const spreadsheetId = secrets.get("USGS_SYNC_SHEET_ID");
    if (!spreadsheetId) {
      return Response.json({ error: "USGS_SYNC_SHEET_ID secret not set" }, { status: 500 });
    }

    const { accessToken } = await base44.asServiceRole.connectors.getConnection("googlesheets");
    const now = new Date().toISOString();

    // Build one row per state from the sync + enrich results passed by the workflow.
    const rows = STATES.map((state) => {
      const sync = body[`sync_${state.toLowerCase()}`] || {};
      const enrich = body[`enrich_${state.toLowerCase()}`] || {};
      const errorMsg = sync.error || enrich.error || "";
      const status = sync.success === false
        ? `Sync Failed${enrich.success === false ? " + Enrich Failed" : ""}`
        : enrich.success === false
          ? "Enrich Failed"
          : "Success";

      return [
        now,
        state,
        sync.state_name || enrich.state_name || "",
        sync.wfs_features_total ?? "",
        sync.quarry_relevant ?? "",
        sync.created ?? "",
        sync.updated ?? "",
        sync.matched ?? "",
        sync.nearby ?? "",
        sync.historical ?? "",
        sync.unmatched ?? "",
        enrich.enriched ?? "",
        enrich.with_deposit_type ?? "",
        enrich.with_mineralogy ?? "",
        enrich.with_host_rock ?? "",
        enrich.match_downgrades ?? "",
        enrich.match_upgrades ?? "",
        errorMsg,
        status,
      ];
    });

    // Append all rows in a single API call.
    const range = "Sync Log!A:S";
    const appendResp = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}:append?valueInputOption=RAW`,
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ values: rows }),
      },
    );

    if (!appendResp.ok) {
      const errText = await appendResp.text();
      console.error("Google Sheets append failed", errText);
      return Response.json({ error: `Sheets API error: ${errText}` }, { status: 500 });
    }

    return Response.json({
      success: true,
      rows_appended: rows.length,
      spreadsheet_id: spreadsheetId,
      url: `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`,
      run_date: now,
    });
  } catch (error) {
    console.error("log-usgs-sync-to-sheets error", error);
    return Response.json({ error: error?.message || String(error) }, { status: 500 });
  }
}