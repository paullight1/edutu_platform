import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CheckCircle,
  XCircle,
  Clock,
  MessageCircleQuestion,
  Loader2,
  RefreshCw,
  Search,
  ExternalLink,
  Inbox,
  X,
} from "lucide-react";
import { backendFetchJson } from "../lib/backend";

type SubmissionStatus = "pending" | "needs_info" | "approved" | "rejected";

type ThreadEntry = { role: "admin" | "user"; message: string; at: string };

interface Submission {
  id: string;
  user_id: string;
  title: string;
  organization: string | null;
  category: string | null;
  type: string | null;
  summary: string | null;
  description: string | null;
  location: string | null;
  is_remote: boolean | null;
  eligibility: string | null;
  benefits: string | null;
  deadline: string | null;
  apply_url: string | null;
  source_url: string | null;
  image_url: string | null;
  status: SubmissionStatus;
  admin_note: string | null;
  user_response: string | null;
  thread: ThreadEntry[] | null;
  approved_opportunity_id: string | null;
  submitted_at: string;
  updated_at: string;
}

type Banner = { type: "success" | "warning" | "error" | "info"; message: string };

const TABS: { key: SubmissionStatus | "all"; label: string }[] = [
  { key: "pending", label: "Pending" },
  { key: "needs_info", label: "Awaiting info" },
  { key: "approved", label: "Approved" },
  { key: "rejected", label: "Rejected" },
  { key: "all", label: "All" },
];

const STATUS_META: Record<SubmissionStatus, { label: string; badge: string }> = {
  pending: { label: "Pending review", badge: "badge-warning" },
  needs_info: { label: "Awaiting info", badge: "badge-primary" },
  approved: { label: "Approved", badge: "badge-success" },
  rejected: { label: "Rejected", badge: "badge-danger" },
};

function timeAgo(iso: string) {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const diff = Date.now() - then;
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

export default function Submissions() {
  const [items, setItems] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<SubmissionStatus | "all">("pending");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Submission | null>(null);
  const [note, setNote] = useState("");
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [banner, setBanner] = useState<Banner | null>(null);

  const fetchData = useCallback(
    async (opts: { quiet?: boolean } = {}) => {
      if (!opts.quiet) setLoading(true);
      else setRefreshing(true);
      try {
        const query = activeTab === "all" ? "" : `?status=${activeTab}`;
        const rows = await backendFetchJson<Submission[]>(
          `/admin/opportunity-submissions${query}`,
        );
        setItems(Array.isArray(rows) ? rows : []);
        setBanner(null);
      } catch (error) {
        setBanner({
          type: "error",
          message:
            error instanceof Error
              ? `Couldn't load submissions: ${error.message}`
              : "Couldn't load submissions.",
        });
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [activeTab],
  );

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const review = useCallback(
    async (
      submission: Submission,
      decision: SubmissionStatus,
      adminNote?: string,
    ) => {
      setActionLoading(submission.id);
      try {
        await backendFetchJson(`/admin/opportunity-submissions/${submission.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ decision, adminNote }),
        });
        setBanner({
          type: decision === "approved" ? "success" : "info",
          message:
            decision === "approved"
              ? `Approved "${submission.title}" — a live opportunity was created and the submitter notified.`
              : decision === "rejected"
                ? `Rejected "${submission.title}". The submitter was notified.`
                : `Requested more info on "${submission.title}". The submitter was notified.`,
        });
        setSelected(null);
        setNote("");
        await fetchData({ quiet: true });
      } catch (error) {
        setBanner({
          type: "error",
          message:
            error instanceof Error ? error.message : "Action failed. Try again.",
        });
      } finally {
        setActionLoading(null);
      }
    },
    [fetchData],
  );

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return items;
    return items.filter(
      (item) =>
        item.title.toLowerCase().includes(term) ||
        (item.organization || "").toLowerCase().includes(term) ||
        (item.category || "").toLowerCase().includes(term),
    );
  }, [items, search]);

  const counts = useMemo(() => {
    const c = { pending: 0, needs_info: 0, approved: 0, rejected: 0 };
    for (const item of items) {
      if (item.status in c) c[item.status] += 1;
    }
    return c;
  }, [items]);

  const openDetail = (submission: Submission) => {
    setSelected(submission);
    setNote("");
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Opportunity Submissions</h1>
          <p style={{ color: "var(--text-secondary)", marginTop: 4 }}>
            Review opportunities submitted by users. Approve to publish, reject,
            or ask for more information.
          </p>
        </div>
        <button
          className="btn btn-secondary"
          onClick={() => fetchData({ quiet: true })}
          disabled={refreshing}
        >
          {refreshing ? (
            <Loader2 size={16} className="animate-spin" />
          ) : (
            <RefreshCw size={16} />
          )}
          Refresh
        </button>
      </div>

      {banner && (
        <div
          className={`card`}
          style={{
            marginBottom: 16,
            borderLeft: `3px solid ${
              banner.type === "error"
                ? "var(--danger)"
                : banner.type === "success"
                  ? "var(--success)"
                  : "var(--apple-blue)"
            }`,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
            }}
          >
            <span style={{ color: "var(--text-primary)" }}>{banner.message}</span>
            <button
              className="btn btn-secondary btn-pill"
              onClick={() => setBanner(null)}
              style={{ padding: "4px 8px" }}
            >
              <X size={14} />
            </button>
          </div>
        </div>
      )}

      {/* Stat cards */}
      <div className="grid grid-cols-4" style={{ marginBottom: 16 }}>
        {(["pending", "needs_info", "approved", "rejected"] as SubmissionStatus[]).map(
          (key) => (
            <div key={key} className="card">
              <div style={{ color: "var(--text-secondary)", fontSize: 13 }}>
                {STATUS_META[key].label}
              </div>
              <div
                style={{
                  fontSize: 28,
                  fontWeight: 800,
                  color: "var(--text-primary)",
                }}
              >
                {counts[key]}
              </div>
            </div>
          ),
        )}
      </div>

      {/* Filters */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div
          style={{
            display: "flex",
            gap: 12,
            flexWrap: "wrap",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {TABS.map((tab) => (
              <button
                key={tab.key}
                className={`btn btn-pill ${
                  activeTab === tab.key ? "btn-primary" : "btn-secondary"
                }`}
                onClick={() => setActiveTab(tab.key)}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <div style={{ position: "relative", minWidth: 220 }}>
            <Search
              size={16}
              style={{
                position: "absolute",
                left: 10,
                top: "50%",
                transform: "translateY(-50%)",
                color: "var(--text-tertiary)",
              }}
            />
            <input
              className="input-field"
              placeholder="Search title, org, category"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ paddingLeft: 32 }}
            />
          </div>
        </div>
      </div>

      {/* List */}
      {loading ? (
        <div className="card" style={{ textAlign: "center", padding: 48 }}>
          <Loader2
            size={24}
            className="animate-spin"
            style={{ color: "var(--apple-blue)" }}
          />
        </div>
      ) : filtered.length === 0 ? (
        <div
          className="card"
          style={{ textAlign: "center", padding: 48, color: "var(--text-secondary)" }}
        >
          <Inbox size={32} style={{ marginBottom: 8 }} />
          <div>No submissions in this view.</div>
        </div>
      ) : (
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>Opportunity</th>
                <th>Category</th>
                <th>Status</th>
                <th>Submitted</th>
                <th style={{ textAlign: "right" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((item) => (
                <tr key={item.id}>
                  <td>
                    <div style={{ fontWeight: 700, color: "var(--text-primary)" }}>
                      {item.title}
                    </div>
                    <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                      {item.organization || "—"}
                    </div>
                  </td>
                  <td style={{ color: "var(--text-secondary)" }}>
                    {item.category || "—"}
                  </td>
                  <td>
                    <span className={`badge ${STATUS_META[item.status].badge}`}>
                      {STATUS_META[item.status].label}
                    </span>
                  </td>
                  <td style={{ color: "var(--text-secondary)", fontSize: 13 }}>
                    {timeAgo(item.submitted_at)}
                  </td>
                  <td style={{ textAlign: "right" }}>
                    <button
                      className="btn btn-secondary btn-pill"
                      onClick={() => openDetail(item)}
                    >
                      Review
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Detail / action modal */}
      {selected && (
        <div
          onClick={() => setSelected(null)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
            zIndex: 1000,
          }}
        >
          <div
            className="card card-elevated"
            onClick={(e) => e.stopPropagation()}
            style={{ width: "100%", maxWidth: 640, maxHeight: "90vh", overflowY: "auto" }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
                gap: 12,
              }}
            >
              <div>
                <h2 style={{ margin: 0, color: "var(--text-primary)" }}>
                  {selected.title}
                </h2>
                <div style={{ color: "var(--text-secondary)", marginTop: 2 }}>
                  {selected.organization || "No organization"} ·{" "}
                  <span className={`badge ${STATUS_META[selected.status].badge}`}>
                    {STATUS_META[selected.status].label}
                  </span>
                </div>
              </div>
              <button
                className="btn btn-secondary btn-pill"
                onClick={() => setSelected(null)}
                style={{ padding: "4px 8px" }}
              >
                <X size={16} />
              </button>
            </div>

            <div style={{ marginTop: 16, display: "grid", gap: 10 }}>
              <DetailRow label="Category" value={selected.category} />
              <DetailRow label="Type" value={selected.type} />
              <DetailRow
                label="Location"
                value={
                  selected.is_remote
                    ? `${selected.location || "Anywhere"} (remote)`
                    : selected.location
                }
              />
              <DetailRow
                label="Deadline"
                value={
                  selected.deadline
                    ? new Date(selected.deadline).toLocaleDateString()
                    : null
                }
              />
              <DetailRow label="Summary" value={selected.summary} />
              <DetailRow label="Description" value={selected.description} multiline />
              <DetailRow label="Eligibility" value={selected.eligibility} multiline />
              <DetailRow label="Benefits" value={selected.benefits} multiline />
              {selected.apply_url && (
                <LinkRow label="Apply URL" url={selected.apply_url} />
              )}
              {selected.source_url && (
                <LinkRow label="Source URL" url={selected.source_url} />
              )}
            </div>

            {selected.thread && selected.thread.length > 0 && (
              <div style={{ marginTop: 16 }}>
                <div
                  style={{
                    fontSize: 12,
                    fontWeight: 700,
                    color: "var(--text-secondary)",
                    marginBottom: 6,
                  }}
                >
                  Conversation
                </div>
                <div style={{ display: "grid", gap: 8 }}>
                  {selected.thread.map((entry, i) => (
                    <div
                      key={i}
                      style={{
                        padding: 10,
                        borderRadius: 10,
                        background:
                          entry.role === "admin"
                            ? "var(--bg-tertiary)"
                            : "var(--bg-secondary)",
                      }}
                    >
                      <div
                        style={{
                          fontSize: 11,
                          fontWeight: 700,
                          color: "var(--text-tertiary)",
                          marginBottom: 2,
                        }}
                      >
                        {entry.role === "admin" ? "Edutu team" : "Submitter"} ·{" "}
                        {timeAgo(entry.at)}
                      </div>
                      <div style={{ color: "var(--text-primary)", fontSize: 14 }}>
                        {entry.message}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {selected.status !== "approved" && selected.status !== "rejected" && (
              <div style={{ marginTop: 16 }}>
                <label
                  style={{
                    fontSize: 12,
                    fontWeight: 700,
                    color: "var(--text-secondary)",
                  }}
                >
                  Message to submitter (required to request info; optional otherwise)
                </label>
                <textarea
                  className="input-field"
                  rows={3}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="e.g. Can you add the official application link and the deadline?"
                  style={{ marginTop: 6, width: "100%" }}
                />
              </div>
            )}

            <div
              style={{
                marginTop: 16,
                display: "flex",
                gap: 8,
                flexWrap: "wrap",
                justifyContent: "flex-end",
              }}
            >
              {selected.approved_opportunity_id && (
                <a
                  className="btn btn-secondary"
                  href={`/opportunities`}
                  style={{ marginRight: "auto" }}
                >
                  <ExternalLink size={16} /> View published
                </a>
              )}
              {selected.status !== "rejected" && (
                <button
                  className="btn btn-danger"
                  disabled={actionLoading === selected.id}
                  onClick={() => review(selected, "rejected", note.trim() || undefined)}
                >
                  {actionLoading === selected.id ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <XCircle size={16} />
                  )}
                  Reject
                </button>
              )}
              {selected.status !== "needs_info" && selected.status !== "approved" && (
                <button
                  className="btn btn-secondary"
                  disabled={actionLoading === selected.id || !note.trim()}
                  title={!note.trim() ? "Add a message first" : undefined}
                  onClick={() => review(selected, "needs_info", note.trim())}
                >
                  {actionLoading === selected.id ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <MessageCircleQuestion size={16} />
                  )}
                  Request info
                </button>
              )}
              {selected.status !== "approved" && (
                <button
                  className="btn btn-primary"
                  disabled={actionLoading === selected.id}
                  onClick={() => review(selected, "approved", note.trim() || undefined)}
                >
                  {actionLoading === selected.id ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <CheckCircle size={16} />
                  )}
                  Approve &amp; publish
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function DetailRow({
  label,
  value,
  multiline,
}: {
  label: string;
  value?: string | null;
  multiline?: boolean;
}) {
  if (!value) return null;
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-tertiary)" }}>
        {label}
      </div>
      <div
        style={{
          color: "var(--text-primary)",
          fontSize: 14,
          whiteSpace: multiline ? "pre-wrap" : "normal",
        }}
      >
        {value}
      </div>
    </div>
  );
}

function LinkRow({ label, url }: { label: string; url: string }) {
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-tertiary)" }}>
        {label}
      </div>
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        style={{
          color: "var(--apple-blue)",
          fontSize: 14,
          display: "inline-flex",
          alignItems: "center",
          gap: 4,
          wordBreak: "break-all",
        }}
      >
        {url} <ExternalLink size={12} />
      </a>
    </div>
  );
}
