import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Archive,
  CheckCircle2,
  Clock3,
  Flag,
  Loader2,
  MessageSquareWarning,
  RefreshCw,
  ShieldAlert,
  XCircle,
} from "lucide-react";
import { backendFetchJson } from "../lib/backend";
import "./CommunitySafety.css";

type ReportStatus = "open" | "reviewing" | "resolved" | "dismissed";
type StatusFilter = ReportStatus | "all";

type CommunityReport = {
  id: string;
  targetType: "message" | "group";
  targetId: string;
  reporterId: string;
  reason: string;
  status: ReportStatus;
  createdAt: string;
  group: {
    id: string;
    name: string;
    visibility: string;
    archivedAt: string | null;
  } | null;
  message: {
    id: string;
    userId: string;
    body: string;
    deletedAt: string | null;
  } | null;
};

type ReportsResponse = {
  reports: CommunityReport[];
  status: StatusFilter;
  generatedAt: string;
};

type Notice = { tone: "success" | "error"; text: string } | null;

const FILTERS: Array<{ value: StatusFilter; label: string }> = [
  { value: "open", label: "Open" },
  { value: "reviewing", label: "Reviewing" },
  { value: "resolved", label: "Resolved" },
  { value: "dismissed", label: "Dismissed" },
  { value: "all", label: "All" },
];

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Unknown time"
    : new Intl.DateTimeFormat(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(date);
}

function preview(value: string, limit = 360): string {
  const compact = value.replace(/\s+/g, " ").trim();
  return compact.length > limit ? `${compact.slice(0, limit)}…` : compact;
}

export default function CommunitySafety() {
  const [status, setStatus] = useState<StatusFilter>("open");
  const [reports, setReports] = useState<CommunityReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);

  const load = useCallback(
    async (quiet = false) => {
      if (quiet) setRefreshing(true);
      else setLoading(true);
      setError(null);
      try {
        const data = await backendFetchJson<ReportsResponse>(
          `/admin/community/reports?status=${encodeURIComponent(status)}&limit=50`,
        );
        setReports(Array.isArray(data?.reports) ? data.reports : []);
        setGeneratedAt(typeof data?.generatedAt === "string" ? data.generatedAt : null);
      } catch (cause) {
        setError(
          cause instanceof Error
            ? cause.message
            : "Community reports could not be loaded.",
        );
      } finally {
        if (quiet) setRefreshing(false);
        else setLoading(false);
      }
    },
    [status],
  );

  useEffect(() => {
    void load(false);
  }, [load]);

  useEffect(() => {
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") void load(true);
    }, 30_000);
    return () => window.clearInterval(id);
  }, [load]);

  const counts = useMemo(
    () => ({
      messages: reports.filter((report) => report.targetType === "message").length,
      groups: reports.filter((report) => report.targetType === "group").length,
    }),
    [reports],
  );

  const updateStatus = async (report: CommunityReport, next: ReportStatus) => {
    setBusyId(report.id);
    setNotice(null);
    try {
      await backendFetchJson(`/admin/community/reports/${report.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      setReports((current) =>
        status === "all" || status === next
          ? current.map((row) =>
              row.id === report.id ? { ...row, status: next } : row,
            )
          : current.filter((row) => row.id !== report.id),
      );
      setNotice({ tone: "success", text: `Report marked ${next}.` });
    } catch (cause) {
      setNotice({
        tone: "error",
        text: cause instanceof Error ? cause.message : "Report could not be updated.",
      });
    } finally {
      setBusyId(null);
    }
  };

  const enforce = async (
    report: CommunityReport,
    action: "remove_message" | "archive_group",
  ) => {
    const label =
      action === "remove_message"
        ? "remove this message for everyone"
        : "archive this group and stop new activity";
    if (!window.confirm(`Confirm: ${label}? This action is audited.`)) return;

    setBusyId(report.id);
    setNotice(null);
    try {
      await backendFetchJson(`/admin/community/reports/${report.id}/enforce`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      setReports((current) =>
        status === "resolved" || status === "all"
          ? current.map((row) =>
              row.id === report.id
                ? {
                    ...row,
                    status: "resolved",
                    message:
                      action === "remove_message" && row.message
                        ? { ...row.message, deletedAt: new Date().toISOString() }
                        : row.message,
                    group:
                      action === "archive_group" && row.group
                        ? { ...row.group, archivedAt: new Date().toISOString() }
                        : row.group,
                  }
                : row,
            )
          : current.filter((row) => row.id !== report.id),
      );
      setNotice({
        tone: "success",
        text:
          action === "remove_message"
            ? "Reported message removed and report resolved."
            : "Reported group archived and report resolved.",
      });
    } catch (cause) {
      setNotice({
        tone: "error",
        text: cause instanceof Error ? cause.message : "Safety action failed.",
      });
    } finally {
      setBusyId(null);
    }
  };

  return (
    <main className="community-safety-page">
      <header className="community-safety-header">
        <div>
          <span className="community-safety-eyebrow">
            <ShieldAlert size={15} aria-hidden="true" /> Trust &amp; Safety
          </span>
          <h1>Community safety queue</h1>
          <p>
            Investigate member reports, record a decision, and take audited action
            when harmful content or groups need to be removed.
          </p>
        </div>
        <button
          type="button"
          className="community-safety-refresh"
          onClick={() => void load(true)}
          disabled={refreshing}
        >
          {refreshing ? <Loader2 size={16} className="spin" /> : <RefreshCw size={16} />}
          Refresh
        </button>
      </header>

      <section className="community-safety-summary" aria-label="Visible report summary">
        <div><strong>{reports.length}</strong><span>visible reports</span></div>
        <div><strong>{counts.messages}</strong><span>message reports</span></div>
        <div><strong>{counts.groups}</strong><span>group reports</span></div>
        <div><strong>{generatedAt ? formatDate(generatedAt) : "—"}</strong><span>last refreshed</span></div>
      </section>

      <nav className="community-safety-filters" aria-label="Report status">
        {FILTERS.map((filter) => (
          <button
            key={filter.value}
            type="button"
            className={status === filter.value ? "active" : ""}
            aria-pressed={status === filter.value}
            onClick={() => setStatus(filter.value)}
          >
            {filter.label}
          </button>
        ))}
      </nav>

      {notice ? (
        <div role={notice.tone === "error" ? "alert" : "status"} className={`community-safety-notice ${notice.tone}`}>
          {notice.text}
        </div>
      ) : null}

      {loading ? (
        <div className="community-safety-state"><Loader2 size={24} className="spin" /> Loading reports…</div>
      ) : error ? (
        <div className="community-safety-state error">
          <AlertTriangle size={24} />
          <strong>Reports unavailable</strong>
          <span>{error}</span>
          <button type="button" onClick={() => void load(false)}>Try again</button>
        </div>
      ) : reports.length === 0 ? (
        <div className="community-safety-state">
          <CheckCircle2 size={28} />
          <strong>No {status === "all" ? "" : status} reports</strong>
          <span>The queue has nothing matching this filter.</span>
        </div>
      ) : (
        <section className="community-safety-list" aria-label="Community reports">
          {reports.map((report) => {
            const busy = busyId === report.id;
            return (
              <article key={report.id} className="community-report-card">
                <div className="community-report-card-top">
                  <div className="community-report-target-icon" aria-hidden="true">
                    {report.targetType === "message" ? <MessageSquareWarning size={20} /> : <Flag size={20} />}
                  </div>
                  <div className="community-report-heading">
                    <div className="community-report-meta">
                      <span className={`community-report-status ${report.status}`}>{report.status}</span>
                      <span>{report.targetType} report</span>
                      <span><Clock3 size={13} /> {formatDate(report.createdAt)}</span>
                    </div>
                    <h2>{report.group?.name || "Community content"}</h2>
                    <p className="community-report-reason">{report.reason}</p>
                  </div>
                </div>

                {report.message ? (
                  <blockquote className={report.message.deletedAt ? "removed" : ""}>
                    {report.message.deletedAt ? "Message already removed" : preview(report.message.body)}
                  </blockquote>
                ) : null}

                <dl className="community-report-details">
                  <div><dt>Report ID</dt><dd>{report.id}</dd></div>
                  <div><dt>Reporter</dt><dd>{report.reporterId}</dd></div>
                  <div><dt>Target ID</dt><dd>{report.targetId}</dd></div>
                  {report.message ? <div><dt>Author</dt><dd>{report.message.userId}</dd></div> : null}
                  {report.group ? <div><dt>Group</dt><dd>{report.group.visibility}{report.group.archivedAt ? " · archived" : ""}</dd></div> : null}
                </dl>

                <div className="community-report-actions">
                  {report.status !== "reviewing" && report.status !== "resolved" ? (
                    <button type="button" disabled={busy} onClick={() => void updateStatus(report, "reviewing")}>Mark reviewing</button>
                  ) : null}
                  {report.status !== "resolved" ? (
                    <button type="button" disabled={busy} onClick={() => void updateStatus(report, "resolved")}><CheckCircle2 size={15} /> Resolve</button>
                  ) : null}
                  {report.status !== "dismissed" ? (
                    <button type="button" disabled={busy} onClick={() => void updateStatus(report, "dismissed")}><XCircle size={15} /> Dismiss</button>
                  ) : null}
                  {report.targetType === "message" && !report.message?.deletedAt ? (
                    <button type="button" className="danger" disabled={busy} onClick={() => void enforce(report, "remove_message")}><MessageSquareWarning size={15} /> Remove message</button>
                  ) : null}
                  {report.group && !report.group.archivedAt ? (
                    <button type="button" className="danger" disabled={busy} onClick={() => void enforce(report, "archive_group")}><Archive size={15} /> Archive group</button>
                  ) : null}
                  {busy ? <Loader2 size={16} className="spin community-report-busy" aria-label="Updating report" /> : null}
                </div>
              </article>
            );
          })}
        </section>
      )}
    </main>
  );
}
