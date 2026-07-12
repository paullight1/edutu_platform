import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import {
  AlertTriangle,
  CheckCircle,
  ChevronRight,
  Clock,
  ExternalLink,
  Inbox,
  Info,
  Loader2,
  MessageCircleQuestion,
  MessagesSquare,
  RefreshCw,
  Reply,
  Search,
  X,
  XCircle,
} from "lucide-react";
import { backendFetchJson } from "../lib/backend";

type SubmissionStatus = "pending" | "needs_info" | "approved" | "rejected";
type FilterKey = SubmissionStatus | "all";

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

type Banner = { type: "success" | "error" | "info"; message: string };

const FILTERS: {
  key: FilterKey;
  label: string;
  icon: typeof Inbox;
  accent: string;
}[] = [
  { key: "all", label: "All submissions", icon: Inbox, accent: "var(--text-tertiary)" },
  { key: "pending", label: "Pending review", icon: Clock, accent: "var(--warning)" },
  { key: "needs_info", label: "Awaiting info", icon: MessageCircleQuestion, accent: "var(--apple-blue)" },
  { key: "approved", label: "Approved", icon: CheckCircle, accent: "var(--success)" },
  { key: "rejected", label: "Rejected", icon: XCircle, accent: "var(--danger)" },
];

const STATUS_META: Record<SubmissionStatus, { label: string; badge: string }> = {
  pending: { label: "Pending review", badge: "badge-warning" },
  needs_info: { label: "Awaiting info", badge: "badge-primary" },
  approved: { label: "Approved", badge: "badge-success" },
  rejected: { label: "Rejected", badge: "badge-danger" },
};

const EMPTY_COPY: Record<FilterKey, { title: string; hint: string }> = {
  all: {
    title: "No submissions yet",
    hint: "When users submit opportunities from the Edutu app or website, they land here for review.",
  },
  pending: {
    title: "Queue is clear",
    hint: "No submissions are waiting for review right now. New user submissions arrive here automatically.",
  },
  needs_info: {
    title: "Nothing awaiting info",
    hint: "Submissions you've asked follow-up questions about will sit here until the submitter replies.",
  },
  approved: {
    title: "No approved submissions",
    hint: "Approved submissions become live opportunities and are listed here for reference.",
  },
  rejected: {
    title: "No rejected submissions",
    hint: "Submissions you decline stay here so you can revisit the decision history.",
  },
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
  const days = Math.round(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

function deadlineInfo(iso: string | null) {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  const days = Math.ceil((date.getTime() - Date.now()) / 86400000);
  const text = date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  return { text, days };
}

// A pending submission whose latest thread entry is from the submitter came
// back from a "needs info" round trip — surface that to the reviewer.
function hasFreshReply(item: Submission) {
  if (item.status !== "pending" || !item.thread?.length) return false;
  return item.thread[item.thread.length - 1].role === "user";
}

export default function Submissions() {
  const [items, setItems] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<FilterKey>("pending");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Submission | null>(null);
  const [note, setNote] = useState("");
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [banner, setBanner] = useState<Banner | null>(null);
  const [confirmReject, setConfirmReject] = useState(false);
  const [lastSynced, setLastSynced] = useState<Date | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  // Fetch the whole queue once; tabs and counts filter client-side so the
  // status tiles always reflect reality and tab switches are instant.
  const fetchData = useCallback(async (opts: { quiet?: boolean } = {}) => {
    if (!opts.quiet) setLoading(true);
    else setRefreshing(true);
    try {
      const rows = await backendFetchJson<Submission[]>(
        "/admin/opportunity-submissions",
      );
      setItems(Array.isArray(rows) ? rows : []);
      setLoadError(null);
      setLastSynced(new Date());
    } catch (error) {
      setLoadError(
        error instanceof Error ? error.message : "Couldn't load submissions.",
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(() => fetchData({ quiet: true }), 60000);
    return () => clearInterval(interval);
  }, [fetchData]);

  // Success/info banners dismiss themselves; errors stay until acknowledged.
  useEffect(() => {
    if (!banner || banner.type === "error") return;
    const t = setTimeout(() => setBanner(null), 6000);
    return () => clearTimeout(t);
  }, [banner]);

  useEffect(() => {
    if (!selected) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSelected(null);
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [selected]);

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

  const counts = useMemo(() => {
    const c: Record<FilterKey, number> = {
      all: items.length,
      pending: 0,
      needs_info: 0,
      approved: 0,
      rejected: 0,
    };
    for (const item of items) c[item.status] += 1;
    return c;
  }, [items]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return items.filter((item) => {
      if (filter !== "all" && item.status !== filter) return false;
      if (!term) return true;
      return [item.title, item.organization, item.category, item.location]
        .some((field) => (field || "").toLowerCase().includes(term));
    });
  }, [items, filter, search]);

  const openDetail = (submission: Submission) => {
    setSelected(submission);
    setNote("");
    setConfirmReject(false);
  };

  const handleReject = () => {
    if (!selected) return;
    if (!confirmReject) {
      setConfirmReject(true);
      return;
    }
    review(selected, "rejected", note.trim() || undefined);
  };

  const bannerAccent =
    banner?.type === "error"
      ? "var(--danger)"
      : banner?.type === "success"
        ? "var(--success)"
        : "var(--apple-blue)";
  const BannerIcon =
    banner?.type === "error"
      ? AlertTriangle
      : banner?.type === "success"
        ? CheckCircle
        : Info;

  const emptyCopy = EMPTY_COPY[filter];
  const searching = search.trim().length > 0;

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
          className="subs-banner"
          role="status"
          style={{ "--banner-accent": bannerAccent } as CSSProperties}
        >
          <BannerIcon size={17} className="subs-banner-icon" />
          <span>{banner.message}</span>
          <button
            className="subs-banner-dismiss"
            onClick={() => setBanner(null)}
            aria-label="Dismiss"
          >
            <X size={15} />
          </button>
        </div>
      )}

      {/* Status tiles double as the filter */}
      <div className="subs-tiles" role="tablist" aria-label="Filter by status">
        {FILTERS.map(({ key, label, icon: Icon, accent }) => (
          <button
            key={key}
            role="tab"
            aria-selected={filter === key}
            className={`subs-tile ${filter === key ? "active" : ""}`}
            style={{ "--tile-accent": accent } as CSSProperties}
            onClick={() => setFilter(key)}
          >
            <span className="subs-tile-icon">
              <Icon size={17} />
            </span>
            <span>
              <span className="subs-tile-count">
                {loading ? "–" : counts[key]}
              </span>
              <span className="subs-tile-label">{label}</span>
            </span>
          </button>
        ))}
      </div>

      <div className="subs-toolbar">
        <div className="subs-search">
          <Search size={16} className="subs-search-icon" />
          <input
            ref={searchRef}
            className="input-field"
            placeholder="Search title, org, category, location"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search submissions"
          />
          {searching && (
            <button
              className="subs-search-clear"
              onClick={() => {
                setSearch("");
                searchRef.current?.focus();
              }}
              aria-label="Clear search"
            >
              <X size={13} />
            </button>
          )}
        </div>
        <div className="subs-toolbar-meta">
          {!loading && (
            <span>
              {filtered.length} {filtered.length === 1 ? "submission" : "submissions"}
            </span>
          )}
          {lastSynced && (
            <span>Updated {timeAgo(lastSynced.toISOString())}</span>
          )}
        </div>
      </div>

      {loading ? (
        <div className="table-container subs-table-container">
          <table className="table">
            <thead>
              <tr>
                <th>Opportunity</th>
                <th>Category</th>
                <th>Deadline</th>
                <th>Status</th>
                <th>Submitted</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: 5 }).map((_, i) => (
                <tr key={i}>
                  <td>
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <div className="subs-skeleton" style={{ width: 40, height: 40, borderRadius: 9 }} />
                      <div style={{ flex: 1, display: "grid", gap: 6 }}>
                        <div className="subs-skeleton" style={{ width: "60%" }} />
                        <div className="subs-skeleton" style={{ width: "35%" }} />
                      </div>
                    </div>
                  </td>
                  <td><div className="subs-skeleton" style={{ width: 80 }} /></td>
                  <td><div className="subs-skeleton" style={{ width: 90 }} /></td>
                  <td><div className="subs-skeleton" style={{ width: 90, borderRadius: 980 }} /></td>
                  <td><div className="subs-skeleton" style={{ width: 56 }} /></td>
                  <td />
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : loadError ? (
        <div className="card subs-empty">
          <div className="subs-empty-icon">
            <AlertTriangle size={22} />
          </div>
          <div className="subs-empty-title">Couldn't load submissions</div>
          <p className="subs-empty-hint">{loadError}</p>
          <button className="btn btn-primary" onClick={() => fetchData()}>
            <RefreshCw size={16} /> Try again
          </button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="card subs-empty">
          <div className="subs-empty-icon">
            {searching ? <Search size={22} /> : <Inbox size={22} />}
          </div>
          <div className="subs-empty-title">
            {searching ? "No matches" : emptyCopy.title}
          </div>
          <p className="subs-empty-hint">
            {searching
              ? `Nothing in ${filter === "all" ? "any status" : `"${FILTERS.find((f) => f.key === filter)?.label}"`} matches "${search.trim()}".`
              : emptyCopy.hint}
          </p>
          {searching ? (
            <button className="btn btn-secondary" onClick={() => setSearch("")}>
              Clear search
            </button>
          ) : filter !== "all" && counts.all > 0 ? (
            <button className="btn btn-secondary" onClick={() => setFilter("all")}>
              View all {counts.all}
            </button>
          ) : null}
        </div>
      ) : (
        <div className="table-container subs-table-container">
          <table className="table">
            <thead>
              <tr>
                <th>Opportunity</th>
                <th>Category</th>
                <th>Deadline</th>
                <th>Status</th>
                <th>Submitted</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {filtered.map((item) => {
                const deadline = deadlineInfo(item.deadline);
                const threadCount = item.thread?.length ?? 0;
                return (
                  <tr
                    key={item.id}
                    className="subs-row"
                    onClick={() => openDetail(item)}
                  >
                    <td>
                      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                        {item.image_url ? (
                          <img
                            className="subs-thumb"
                            src={item.image_url}
                            alt=""
                            loading="lazy"
                          />
                        ) : (
                          <div className="subs-thumb-fallback" aria-hidden>
                            {(item.title || "?").charAt(0).toUpperCase()}
                          </div>
                        )}
                        <div style={{ minWidth: 0 }}>
                          <div
                            style={{
                              fontWeight: 600,
                              color: "var(--text-primary)",
                              display: "flex",
                              alignItems: "center",
                              gap: 8,
                            }}
                          >
                            <span
                              style={{
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                                maxWidth: 340,
                              }}
                            >
                              {item.title}
                            </span>
                            {hasFreshReply(item) && (
                              <span className="subs-reply-chip">
                                <Reply size={11} /> New reply
                              </span>
                            )}
                          </div>
                          <div
                            style={{
                              fontSize: 12,
                              color: "var(--text-secondary)",
                              display: "flex",
                              alignItems: "center",
                              gap: 6,
                            }}
                          >
                            <span>{item.organization || "—"}</span>
                            {threadCount > 0 && (
                              <span
                                style={{
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: 3,
                                  color: "var(--text-tertiary)",
                                }}
                              >
                                <MessagesSquare size={11} /> {threadCount}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td style={{ color: "var(--text-secondary)" }}>
                      {item.category || "—"}
                    </td>
                    <td>
                      {deadline ? (
                        <span
                          style={{
                            fontSize: 13,
                            color:
                              deadline.days < 0
                                ? "var(--danger)"
                                : deadline.days <= 7
                                  ? "var(--warning)"
                                  : "var(--text-secondary)",
                          }}
                        >
                          {deadline.text}
                          {deadline.days >= 0 && deadline.days <= 7
                            ? ` · ${deadline.days}d left`
                            : deadline.days < 0
                              ? " · passed"
                              : ""}
                        </span>
                      ) : (
                        <span style={{ color: "var(--text-tertiary)" }}>—</span>
                      )}
                    </td>
                    <td>
                      <span className={`badge ${STATUS_META[item.status].badge}`}>
                        {STATUS_META[item.status].label}
                      </span>
                    </td>
                    <td style={{ color: "var(--text-secondary)", fontSize: 13 }}>
                      {timeAgo(item.submitted_at)}
                    </td>
                    <td style={{ textAlign: "right", width: 36 }}>
                      <ChevronRight size={16} style={{ color: "var(--text-tertiary)" }} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Review modal */}
      {selected && (
        <div
          className="subs-modal-overlay"
          onClick={() => setSelected(null)}
          role="dialog"
          aria-modal="true"
          aria-label={`Review ${selected.title}`}
        >
          <div className="subs-modal" onClick={(e) => e.stopPropagation()}>
            <div className="subs-modal-header">
              <div style={{ minWidth: 0, flex: 1 }}>
                <h3 style={{ margin: 0 }}>{selected.title}</h3>
                <div
                  style={{
                    color: "var(--text-secondary)",
                    marginTop: 4,
                    fontSize: 14,
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    flexWrap: "wrap",
                  }}
                >
                  <span>{selected.organization || "No organization"}</span>
                  <span className={`badge ${STATUS_META[selected.status].badge}`}>
                    {STATUS_META[selected.status].label}
                  </span>
                  <span style={{ color: "var(--text-tertiary)", fontSize: 13 }}>
                    Submitted {timeAgo(selected.submitted_at)}
                  </span>
                </div>
              </div>
              <button
                className="subs-modal-close"
                onClick={() => setSelected(null)}
                aria-label="Close"
              >
                <X size={16} />
              </button>
            </div>

            <div className="subs-modal-body">
              {selected.image_url && (
                <img
                  className="subs-hero-image"
                  src={selected.image_url}
                  alt=""
                />
              )}

              <div className="subs-meta-grid">
                <MetaItem label="Category" value={selected.category} />
                <MetaItem label="Type" value={selected.type} />
                <MetaItem
                  label="Location"
                  value={
                    selected.is_remote
                      ? `${selected.location || "Anywhere"} (remote)`
                      : selected.location
                  }
                />
                <MetaItem
                  label="Deadline"
                  value={deadlineInfo(selected.deadline)?.text ?? null}
                />
                <MetaItem label="Summary" value={selected.summary} full />
                <MetaItem
                  label="Description"
                  value={selected.description}
                  full
                  multiline
                />
                <MetaItem
                  label="Eligibility"
                  value={selected.eligibility}
                  full
                  multiline
                />
                <MetaItem label="Benefits" value={selected.benefits} full multiline />
                {selected.apply_url && (
                  <MetaLink label="Apply URL" url={selected.apply_url} />
                )}
                {selected.source_url && (
                  <MetaLink label="Source URL" url={selected.source_url} />
                )}
              </div>

              {selected.thread && selected.thread.length > 0 && (
                <div className="subs-thread">
                  <div className="subs-meta-label" style={{ marginBottom: 8 }}>
                    Conversation
                  </div>
                  <div style={{ display: "grid", gap: 8 }}>
                    {selected.thread.map((entry, i) => (
                      <div
                        key={i}
                        className={`subs-thread-bubble ${entry.role === "admin" ? "admin" : ""}`}
                      >
                        <div className="subs-thread-who">
                          {entry.role === "admin" ? "Edutu team" : "Submitter"} ·{" "}
                          {timeAgo(entry.at)}
                        </div>
                        {entry.message}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {selected.status !== "approved" && selected.status !== "rejected" && (
                <div style={{ marginTop: 20 }}>
                  <label
                    className="subs-meta-label"
                    htmlFor="subs-note"
                    style={{ display: "block" }}
                  >
                    Message to submitter
                  </label>
                  <textarea
                    id="subs-note"
                    className="input-field"
                    rows={3}
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="e.g. Can you add the official application link and the deadline?"
                    style={{ marginTop: 6, fontSize: 15, resize: "vertical" }}
                  />
                  <div
                    style={{
                      fontSize: 12,
                      color: "var(--text-tertiary)",
                      marginTop: 5,
                    }}
                  >
                    Required to request info · optional for approve and reject ·
                    the submitter is notified either way.
                  </div>
                </div>
              )}
            </div>

            <div className="subs-modal-footer">
              {selected.approved_opportunity_id && (
                <a
                  className="btn btn-secondary"
                  href="/opportunities"
                  style={{ marginRight: "auto" }}
                >
                  <ExternalLink size={16} /> View published
                </a>
              )}
              {selected.status !== "rejected" && (
                <button
                  className={confirmReject ? "btn btn-danger" : "btn btn-secondary"}
                  disabled={actionLoading === selected.id}
                  onClick={handleReject}
                  onBlur={() => setConfirmReject(false)}
                >
                  {actionLoading === selected.id ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <XCircle size={16} />
                  )}
                  {confirmReject ? "Confirm reject" : "Reject"}
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

function MetaItem({
  label,
  value,
  full,
  multiline,
}: {
  label: string;
  value?: string | null;
  full?: boolean;
  multiline?: boolean;
}) {
  if (!value) return null;
  return (
    <div className={full ? "subs-meta-full" : undefined}>
      <div className="subs-meta-label">{label}</div>
      <div
        className="subs-meta-value"
        style={multiline ? { whiteSpace: "pre-wrap" } : undefined}
      >
        {value}
      </div>
    </div>
  );
}

function MetaLink({ label, url }: { label: string; url: string }) {
  return (
    <div className="subs-meta-full">
      <div className="subs-meta-label">{label}</div>
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        className="subs-meta-value"
        style={{ display: "inline-flex", alignItems: "center", gap: 4 }}
      >
        {url} <ExternalLink size={12} style={{ flex: "none" }} />
      </a>
    </div>
  );
}
