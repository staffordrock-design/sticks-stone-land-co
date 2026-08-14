import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { ArrowLeft, Eye, Users, Clock3, ShieldAlert } from "lucide-react";

export default function AdminActivity() {
  const { user } = useAuth();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user?.role !== "admin") {
      setLoading(false);
      return;
    }

    (async () => {
      try {
        const data = await base44.entities.ViewerActivity.list("-created_date", 250);
        setRows(data || []);
      } catch (error) {
        console.error("Failed to load viewer activity", error);
      } finally {
        setLoading(false);
      }
    })();
  }, [user?.role]);

  const uniqueVisitors = useMemo(() => {
    const ids = new Set(rows.map((r) => r.user_id || r.session_id).filter(Boolean));
    return ids.size;
  }, [rows]);

  const recentMineViews = useMemo(
    () => rows.filter((r) => r.page_type === "mine_detail").length,
    [rows]
  );

  if (user?.role !== "admin") {
    return (
      <div className="min-h-screen bg-background p-6">
        <div className="mx-auto max-w-3xl rounded-2xl border border-border bg-card p-8 text-center">
          <ShieldAlert className="mx-auto h-8 w-8 text-muted-foreground" />
          <h1 className="mt-4 text-xl font-bold">Admin only</h1>
          <p className="mt-2 text-sm text-muted-foreground">Viewer activity is restricted to administrators.</p>
          <Link to="/" className="mt-5 inline-block font-semibold text-sky-800 hover:underline">Back to quarry intelligence</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-7xl px-6 py-8">
        <Link to="/" className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Back to quarry intelligence
        </Link>

        <div className="mt-6 flex flex-col gap-2">
          <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Private Admin Analytics</p>
          <h1 className="text-3xl font-bold text-foreground">Who’s looking at S&S Rock Holdings</h1>
          <p className="text-sm text-muted-foreground">Recent registered-user and session activity captured inside the app.</p>
        </div>

        <div className="mt-8 grid gap-4 sm:grid-cols-3">
          <Stat icon={Eye} label="Recent views" value={rows.length} />
          <Stat icon={Users} label="Unique visitors" value={uniqueVisitors} />
          <Stat icon={Clock3} label="Mine detail views" value={recentMineViews} />
        </div>

        <div className="mt-8 overflow-hidden rounded-2xl border border-border bg-card">
          <div className="border-b border-border px-5 py-4">
            <h2 className="font-semibold text-foreground">Recent activity</h2>
          </div>

          {loading ? (
            <div className="p-8 text-sm text-muted-foreground">Loading activity…</div>
          ) : rows.length === 0 ? (
            <div className="p-8 text-sm text-muted-foreground">No activity has been recorded yet.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-left text-sm">
                <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="px-5 py-3">Visitor</th>
                    <th className="px-5 py-3">Email</th>
                    <th className="px-5 py-3">Viewed</th>
                    <th className="px-5 py-3">Page</th>
                    <th className="px-5 py-3">Resource</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id} className="border-t border-border align-top">
                      <td className="px-5 py-4 font-medium text-foreground">{row.user_name || "Anonymous visitor"}</td>
                      <td className="px-5 py-4 text-muted-foreground">{row.user_email || "—"}</td>
                      <td className="px-5 py-4 text-muted-foreground">{formatDate(row.viewed_at || row.created_date)}</td>
                      <td className="px-5 py-4">
                        <div className="font-medium text-foreground">{row.page_type || "page"}</div>
                        <div className="mt-1 max-w-[320px] truncate text-xs text-muted-foreground">{row.path}</div>
                      </td>
                      <td className="px-5 py-4 text-muted-foreground">{row.resource_id || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Stat({ icon: Icon, label, value }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <div className="flex items-center gap-2 text-muted-foreground"><Icon className="h-4 w-4" /><span className="text-sm">{label}</span></div>
      <div className="mt-3 text-3xl font-bold text-foreground">{Number(value || 0).toLocaleString()}</div>
    </div>
  );
}

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}
