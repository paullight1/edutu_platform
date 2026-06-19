import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Archive,
  Calendar,
  Edit3,
  ExternalLink,
  MapPin,
  Plus,
  RefreshCw,
  Save,
  Search,
  X,
} from "lucide-react";
import { backendFetchJson } from "../lib/backend";

type EventStatus = "draft" | "published" | "cancelled" | "archived";

interface AdminEvent {
  id: string;
  title: string;
  slug: string;
  summary: string | null;
  description: string | null;
  startsAt: string;
  endsAt: string | null;
  timezone: string | null;
  location: string | null;
  isOnline: boolean | null;
  ctaLabel: string | null;
  ctaUrl: string | null;
  imageUrl: string | null;
  status: EventStatus;
  audience: string | null;
  capacity: number | null;
  updatedAt: string | null;
}

interface AdminEventsResponse {
  data: AdminEvent[];
}

const emptyForm = {
  title: "",
  slug: "",
  summary: "",
  description: "",
  startsAt: "",
  endsAt: "",
  timezone: "UTC",
  location: "",
  isOnline: true,
  ctaLabel: "Join event",
  ctaUrl: "",
  imageUrl: "",
  status: "draft" as EventStatus,
  audience: "public",
  capacity: "",
};

function toDateTimeInput(value?: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 16);
}

function toEventDate(value?: string | null): string {
  if (!value) return "Date not set";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Date not set";
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function publicEventUrl(event: AdminEvent): string {
  return `https://edutu.ai/events/${encodeURIComponent(event.slug)}`;
}

export default function Events() {
  const [events, setEvents] = useState<AdminEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showEditor, setShowEditor] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<EventStatus | "all">("all");
  const [form, setForm] = useState(emptyForm);

  const fetchEvents = useCallback(async () => {
    setLoading(true);
    try {
      const response = await backendFetchJson<AdminEventsResponse>(
        "/events/admin/list?limit=100&status=all",
      );
      setEvents(response.data || []);
    } catch (error) {
      console.error("Error fetching events:", error);
      setEvents([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchEvents();
  }, [fetchEvents]);

  const stats = useMemo(
    () => ({
      total: events.length,
      published: events.filter((event) => event.status === "published").length,
      drafts: events.filter((event) => event.status === "draft").length,
      archived: events.filter((event) => event.status === "archived").length,
    }),
    [events],
  );

  const filteredEvents = useMemo(() => {
    const term = searchQuery.trim().toLowerCase();
    return events.filter((event) => {
      const matchesStatus =
        statusFilter === "all" || event.status === statusFilter;
      const haystack = [
        event.title,
        event.summary,
        event.location,
        event.audience,
        event.status,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return matchesStatus && (!term || haystack.includes(term));
    });
  }, [events, searchQuery, statusFilter]);

  const resetEditor = () => {
    setEditingId(null);
    setForm(emptyForm);
    setShowEditor(false);
  };

  const startCreate = () => {
    setEditingId(null);
    setForm({
      ...emptyForm,
      startsAt: toDateTimeInput(new Date().toISOString()),
    });
    setShowEditor(true);
  };

  const startEdit = (event: AdminEvent) => {
    setEditingId(event.id);
    setForm({
      title: event.title,
      slug: event.slug,
      summary: event.summary || "",
      description: event.description || "",
      startsAt: toDateTimeInput(event.startsAt),
      endsAt: toDateTimeInput(event.endsAt),
      timezone: event.timezone || "UTC",
      location: event.location || "",
      isOnline: event.isOnline ?? true,
      ctaLabel: event.ctaLabel || "Join event",
      ctaUrl: event.ctaUrl || "",
      imageUrl: event.imageUrl || "",
      status: event.status || "draft",
      audience: event.audience || "public",
      capacity: event.capacity ? String(event.capacity) : "",
    });
    setShowEditor(true);
  };

  const buildPayload = () => ({
    title: form.title.trim(),
    slug: form.slug.trim() || undefined,
    summary: form.summary.trim() || undefined,
    description: form.description.trim() || undefined,
    startsAt: form.startsAt ? new Date(form.startsAt).toISOString() : undefined,
    endsAt: form.endsAt ? new Date(form.endsAt).toISOString() : undefined,
    timezone: form.timezone.trim() || "UTC",
    location: form.location.trim() || undefined,
    isOnline: form.isOnline,
    ctaLabel: form.ctaLabel.trim() || "Join event",
    ctaUrl: form.ctaUrl.trim() || undefined,
    imageUrl: form.imageUrl.trim() || undefined,
    status: form.status,
    audience: form.audience.trim() || "public",
    capacity: form.capacity ? Number(form.capacity) : undefined,
  });

  const handleSave = async () => {
    if (!form.title.trim() || !form.startsAt) {
      alert("Event title and start date are required");
      return;
    }

    setSaving(true);
    try {
      const payload = buildPayload();
      if (editingId) {
        await backendFetchJson(`/events/admin/${editingId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      } else {
        await backendFetchJson("/events/admin", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      }

      resetEditor();
      await fetchEvents();
    } catch (error) {
      console.error("Error saving event:", error);
      alert(error instanceof Error ? error.message : "Could not save event");
    } finally {
      setSaving(false);
    }
  };

  const handleArchive = async (event: AdminEvent) => {
    if (!confirm(`Archive "${event.title}"?`)) return;
    await backendFetchJson(`/events/admin/${event.id}`, { method: "DELETE" });
    await fetchEvents();
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <div className="page-header">
        <div>
          <h1 className="page-title">Events</h1>
          <p
            style={{
              color: "var(--text-tertiary)",
              marginTop: 4,
              fontSize: 15,
            }}
          >
            Announce workshops, webinars, and community sessions.
          </p>
        </div>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <button
            className="btn btn-secondary"
            onClick={fetchEvents}
            disabled={loading}
          >
            <RefreshCw size={18} className={loading ? "animate-spin" : ""} />
            Refresh
          </button>
          <button className="btn btn-primary" onClick={startCreate}>
            <Plus size={18} />
            New Event
          </button>
        </div>
      </div>

      <div className="stats-grid">
        {[
          { label: "Total Events", value: stats.total },
          { label: "Published", value: stats.published },
          { label: "Drafts", value: stats.drafts },
          { label: "Archived", value: stats.archived },
        ].map((stat) => (
          <div key={stat.label} className="stat-card">
            <div className="stat-value">{stat.value}</div>
            <div className="stat-label">{stat.label}</div>
          </div>
        ))}
      </div>

      {showEditor ? (
        <section className="card" style={{ padding: 24 }}>
          <div className="page-header" style={{ marginBottom: 20 }}>
            <div>
              <h2 style={{ fontSize: 24, fontWeight: 600 }}>
                {editingId ? "Edit event" : "Create event"}
              </h2>
              <p
                style={{
                  color: "var(--text-tertiary)",
                  marginTop: 4,
                  fontSize: 14,
                }}
              >
                Published events appear on the public events page.
              </p>
            </div>
            <button className="btn btn-secondary" onClick={resetEditor}>
              <X size={18} />
              Close
            </button>
          </div>

          <div className="event-editor-grid">
            <label className="form-field">
              Title
              <input
                value={form.title}
                onChange={(event) =>
                  setForm({ ...form, title: event.target.value })
                }
                className="input"
                placeholder="Application strategy workshop"
              />
            </label>
            <label className="form-field">
              Slug
              <input
                value={form.slug}
                onChange={(event) =>
                  setForm({ ...form, slug: event.target.value })
                }
                className="input"
                placeholder="Auto-generated when empty"
              />
            </label>
            <label className="form-field">
              Start date
              <input
                type="datetime-local"
                value={form.startsAt}
                onChange={(event) =>
                  setForm({ ...form, startsAt: event.target.value })
                }
                className="input"
              />
            </label>
            <label className="form-field">
              End date
              <input
                type="datetime-local"
                value={form.endsAt}
                onChange={(event) =>
                  setForm({ ...form, endsAt: event.target.value })
                }
                className="input"
              />
            </label>
            <label className="form-field">
              Location
              <input
                value={form.location}
                onChange={(event) =>
                  setForm({ ...form, location: event.target.value })
                }
                className="input"
                placeholder="Zoom, Lagos, or campus venue"
              />
            </label>
            <label className="form-field">
              CTA link
              <input
                value={form.ctaUrl}
                onChange={(event) =>
                  setForm({ ...form, ctaUrl: event.target.value })
                }
                className="input"
                placeholder="https://..."
              />
            </label>
            <label className="form-field">
              CTA label
              <input
                value={form.ctaLabel}
                onChange={(event) =>
                  setForm({ ...form, ctaLabel: event.target.value })
                }
                className="input"
              />
            </label>
            <label className="form-field">
              Status
              <select
                value={form.status}
                onChange={(event) =>
                  setForm({
                    ...form,
                    status: event.target.value as EventStatus,
                  })
                }
                className="input"
              >
                <option value="draft">Draft</option>
                <option value="published">Published</option>
                <option value="cancelled">Cancelled</option>
                <option value="archived">Archived</option>
              </select>
            </label>
            <label className="form-field event-editor-full">
              Summary
              <input
                value={form.summary}
                onChange={(event) =>
                  setForm({ ...form, summary: event.target.value })
                }
                className="input"
                placeholder="Short public summary"
              />
            </label>
            <label className="form-field event-editor-full">
              Details
              <textarea
                value={form.description}
                onChange={(event) =>
                  setForm({ ...form, description: event.target.value })
                }
                className="input"
                rows={5}
                placeholder="What users should know before joining"
              />
            </label>
          </div>

          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              gap: 12,
              marginTop: 20,
            }}
          >
            <button className="btn btn-secondary" onClick={resetEditor}>
              Cancel
            </button>
            <button
              className="btn btn-primary"
              onClick={handleSave}
              disabled={saving}
            >
              <Save size={18} />
              {saving ? "Saving" : "Save Event"}
            </button>
          </div>
        </section>
      ) : null}

      <section className="card" style={{ padding: 16 }}>
        <div className="event-toolbar">
          <div className="event-search">
            <Search size={18} />
            <input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search events"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(event) =>
              setStatusFilter(event.target.value as EventStatus | "all")
            }
            className="input"
            style={{ minWidth: 160 }}
          >
            <option value="all">All statuses</option>
            <option value="published">Published</option>
            <option value="draft">Draft</option>
            <option value="cancelled">Cancelled</option>
            <option value="archived">Archived</option>
          </select>
        </div>
      </section>

      <section className="events-grid">
        {loading ? (
          Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="card event-card event-card-loading" />
          ))
        ) : filteredEvents.length > 0 ? (
          filteredEvents.map((event) => (
            <article key={event.id} className="card event-card">
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 12,
                }}
              >
                <span className={`status-pill status-${event.status}`}>
                  {event.status}
                </span>
                <a
                  href={publicEventUrl(event)}
                  target="_blank"
                  rel="noreferrer"
                  className="icon-link"
                  title="Open public page"
                >
                  <ExternalLink size={16} />
                </a>
              </div>
              <h2>{event.title}</h2>
              <p>{event.summary || event.description || "No summary yet."}</p>
              <div className="event-meta">
                <span>
                  <Calendar size={15} />
                  {toEventDate(event.startsAt)}
                </span>
                <span>
                  <MapPin size={15} />
                  {event.location ||
                    (event.isOnline ? "Online" : "Location TBA")}
                </span>
              </div>
              <div className="event-actions">
                <button
                  className="btn btn-secondary"
                  onClick={() => startEdit(event)}
                >
                  <Edit3 size={16} />
                  Edit
                </button>
                <button
                  className="btn btn-secondary"
                  onClick={() => handleArchive(event)}
                >
                  <Archive size={16} />
                  Archive
                </button>
              </div>
            </article>
          ))
        ) : (
          <div
            className="card"
            style={{ padding: 32, textAlign: "center", gridColumn: "1 / -1" }}
          >
            <h2 style={{ fontSize: 24, fontWeight: 600 }}>No events found</h2>
            <p style={{ marginTop: 8, color: "var(--text-tertiary)" }}>
              Create an event or adjust the current filters.
            </p>
          </div>
        )}
      </section>

      <style>{`
        .event-editor-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 16px;
        }

        .event-editor-full {
          grid-column: 1 / -1;
        }

        .form-field {
          display: grid;
          gap: 8px;
          color: var(--text-secondary);
          font-size: 14px;
          font-weight: 600;
        }

        .input {
          width: 100%;
          min-height: 44px;
          border: 1px solid var(--border-medium);
          border-radius: 8px;
          background: var(--bg-secondary);
          color: var(--text-primary);
          padding: 10px 12px;
          font: inherit;
          font-size: 15px;
        }

        textarea.input {
          resize: vertical;
          line-height: 1.5;
        }

        .event-toolbar {
          display: flex;
          gap: 12px;
          align-items: center;
          justify-content: space-between;
        }

        .event-search {
          min-height: 44px;
          flex: 1;
          display: flex;
          align-items: center;
          gap: 10px;
          border: 1px solid var(--border-medium);
          border-radius: 8px;
          background: var(--bg-secondary);
          padding: 0 12px;
          color: var(--text-tertiary);
        }

        .event-search input {
          width: 100%;
          border: 0;
          outline: 0;
          background: transparent;
          color: var(--text-primary);
          font: inherit;
          font-size: 15px;
        }

        .events-grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 16px;
        }

        .event-card {
          padding: 20px;
          display: flex;
          min-height: 280px;
          flex-direction: column;
          gap: 14px;
        }

        .event-card h2 {
          font-size: 20px;
          font-weight: 600;
          line-height: 1.2;
        }

        .event-card p {
          color: var(--text-tertiary);
          font-size: 14px;
          line-height: 1.5;
        }

        .event-card-loading {
          background: var(--bg-tertiary);
          animation: pulse 1.4s ease-in-out infinite;
        }

        .event-meta {
          display: grid;
          gap: 8px;
          margin-top: auto;
          color: var(--text-secondary);
          font-size: 14px;
        }

        .event-meta span {
          display: flex;
          gap: 8px;
          align-items: center;
          min-width: 0;
        }

        .event-actions {
          display: flex;
          gap: 10px;
          flex-wrap: wrap;
          padding-top: 12px;
          border-top: 1px solid var(--border-light);
        }

        .status-pill {
          display: inline-flex;
          align-items: center;
          width: fit-content;
          border-radius: 999px;
          padding: 6px 10px;
          font-size: 12px;
          font-weight: 700;
          text-transform: capitalize;
          background: var(--bg-tertiary);
          color: var(--text-secondary);
        }

        .status-published {
          background: rgba(52, 199, 89, 0.14);
          color: var(--success);
        }

        .status-draft {
          background: rgba(255, 149, 0, 0.14);
          color: var(--warning);
        }

        .status-archived,
        .status-cancelled {
          background: rgba(255, 59, 48, 0.12);
          color: var(--danger);
        }

        .icon-link {
          display: inline-flex;
          width: 36px;
          height: 36px;
          align-items: center;
          justify-content: center;
          border: 1px solid var(--border-medium);
          border-radius: 8px;
          color: var(--text-secondary);
        }

        @keyframes pulse {
          0%, 100% { opacity: 0.65; }
          50% { opacity: 1; }
        }

        @media (max-width: 1100px) {
          .events-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
        }

        @media (max-width: 720px) {
          .event-editor-grid,
          .events-grid {
            grid-template-columns: 1fr;
          }

          .event-toolbar {
            align-items: stretch;
            flex-direction: column;
          }
        }
      `}</style>
    </div>
  );
}
