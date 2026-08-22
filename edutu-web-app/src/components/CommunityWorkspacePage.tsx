import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  Check,
  Clock3,
  Lock,
  MessageCircle,
  Plus,
  Search,
  ShieldCheck,
  Sparkles,
  Users,
  X,
} from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { useClerk } from "../hooks/useAuth";
import {
  createGroup,
  fetchGroups,
  isCommunityApiError,
  joinGroup,
  type CommunityGroup,
  type GroupJoinPolicy,
  type GroupVisibility,
  type GroupWithMembership,
} from "../services/community";
import {
  fetchDmConversations,
  fetchDmRequests,
  isCommunityDmApiError,
  type DmConversationSummary,
  type DmRequestSummary,
} from "../services/communityDms";

type CommunityTab = "discover" | "groups" | "messages";

type Notice = {
  tone: "success" | "error";
  text: string;
} | null;

function formatActivity(value: string | null): string {
  if (!value) return "No messages yet";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Recent activity";
  const diffMinutes = Math.max(0, Math.round((Date.now() - date.getTime()) / 60_000));
  if (diffMinutes < 2) return "Active now";
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  const hours = Math.round(diffMinutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? "Yesterday" : `${days}d ago`;
}

function membershipLabel(row: GroupWithMembership): string | null {
  const status = row.membership?.status;
  if (status === "invited") return "Invited";
  if (status === "pending") return "Request pending";
  if (status === "banned") return "Unavailable";
  if (status === "removed") return "Removed";
  if (status === "active") {
    if (row.membership?.role === "owner") return "Owner";
    if (row.membership?.role === "mod") return "Moderator";
    return "Member";
  }
  return null;
}

function GroupCard({
  row,
  busyGroupId,
  onJoin,
}: {
  row: GroupWithMembership;
  busyGroupId: string | null;
  onJoin: (row: GroupWithMembership) => void;
}) {
  const { group, membership } = row;
  const isBusy = busyGroupId === group.id;
  const label = membershipLabel(row);
  const isActive = membership?.status === "active";
  const isInvited = membership?.status === "invited";
  const isPending = membership?.status === "pending";
  const isBlocked = membership?.status === "banned" || membership?.status === "removed";
  const canInstantJoin =
    !membership && group.visibility === "public" && group.joinPolicy === "open";

  return (
    <article className="group flex min-h-[240px] flex-col overflow-hidden rounded-[28px] border border-subtle bg-surface-layer shadow-sm transition duration-200 hover:-translate-y-0.5 hover:shadow-lg">
      <div className="relative min-h-[112px] overflow-hidden bg-gradient-to-br from-brand-500/20 via-brand-500/5 to-surface-elevated p-5">
        {group.coverImageResourceUrl ? (
          <img
            src={group.coverImageResourceUrl}
            alt=""
            className="absolute inset-0 h-full w-full object-cover"
            loading="lazy"
          />
        ) : null}
        <div className="absolute inset-0 bg-gradient-to-t from-surface-layer/85 via-transparent to-transparent" />
        <div className="relative flex items-start justify-between gap-3">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/25 bg-surface-layer/90 text-2xl shadow-sm">
            {group.coverEmoji || "💬"}
          </span>
          <div className="flex flex-wrap justify-end gap-2">
            {group.visibility === "private" ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-slate-950/70 px-2.5 py-1 text-xs font-semibold text-white">
                <Lock size={12} aria-hidden="true" /> Private
              </span>
            ) : null}
            {label ? (
              <span className="rounded-full bg-surface-layer/90 px-2.5 py-1 text-xs font-semibold text-text-primary shadow-sm">
                {label}
              </span>
            ) : null}
          </div>
        </div>
      </div>

      <div className="flex flex-1 flex-col p-5">
        <h2 className="text-lg font-semibold tracking-tight text-text-primary">
          {group.name}
        </h2>
        <p className="mt-2 line-clamp-2 text-sm leading-6 text-text-secondary">
          {group.description || "A focused Edutu group for sharing progress and useful resources."}
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs font-semibold text-text-muted">
          <span className="inline-flex items-center gap-1.5">
            <Users size={14} aria-hidden="true" /> {group.memberCount} members
          </span>
          <span className="inline-flex items-center gap-1.5">
            <MessageCircle size={14} aria-hidden="true" /> {group.messageCount} posts
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Clock3 size={14} aria-hidden="true" /> {formatActivity(group.lastMessageAt)}
          </span>
        </div>

        <div className="mt-auto pt-5">
          {isActive ? (
            <Link
              to={`/app/community/groups/${encodeURIComponent(group.id)}`}
              className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl bg-brand-500 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
            >
              Open group <ArrowRight size={16} aria-hidden="true" />
            </Link>
          ) : isInvited ? (
            <button
              type="button"
              disabled={isBusy}
              onClick={() => onJoin(row)}
              aria-label={`Accept invite to ${group.name}`}
              className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl bg-brand-500 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-600 disabled:cursor-wait disabled:opacity-60"
            >
              <Check size={16} aria-hidden="true" />
              {isBusy ? "Accepting…" : "Accept invite"}
            </button>
          ) : isPending ? (
            <button
              type="button"
              disabled
              className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl border border-subtle bg-surface-elevated px-4 text-sm font-semibold text-text-muted"
            >
              <Clock3 size={16} aria-hidden="true" /> Request pending
            </button>
          ) : isBlocked ? (
            <button
              type="button"
              disabled
              className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl border border-subtle bg-surface-elevated px-4 text-sm font-semibold text-text-muted"
            >
              <ShieldCheck size={16} aria-hidden="true" /> Unavailable
            </button>
          ) : canInstantJoin ? (
            <button
              type="button"
              disabled={isBusy}
              onClick={() => onJoin(row)}
              aria-label={`Join ${group.name}`}
              className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl border border-brand-500/30 bg-brand-500/10 px-4 text-sm font-semibold text-brand-700 transition hover:bg-brand-500/15 disabled:cursor-wait disabled:opacity-60"
            >
              <Users size={16} aria-hidden="true" /> {isBusy ? "Joining…" : "Join group"}
            </button>
          ) : (
            <Link
              to={`/app/community/groups/${encodeURIComponent(group.id)}`}
              className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl border border-subtle bg-surface-layer px-4 text-sm font-semibold text-text-primary transition hover:bg-surface-elevated"
            >
              View details <ArrowRight size={16} aria-hidden="true" />
            </Link>
          )}
        </div>
      </div>
    </article>
  );
}

function CreateGroupDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (group: CommunityGroup) => void;
}) {
  const { getToken } = useClerk();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [coverEmoji, setCoverEmoji] = useState("✨");
  const [visibility, setVisibility] = useState<GroupVisibility>("public");
  const [joinPolicy, setJoinPolicy] = useState<GroupJoinPolicy>("open");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setName("");
      setDescription("");
      setCoverEmoji("✨");
      setVisibility("public");
      setJoinPolicy("open");
      setSaving(false);
      setError(null);
    }
  }, [open]);

  if (!open) return null;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const trimmedName = name.trim();
    if (trimmedName.length < 3) {
      setError("Give your group a name with at least 3 characters.");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const group = await createGroup(
        {
          name: trimmedName,
          description: description.trim() || undefined,
          coverEmoji: coverEmoji.trim() || "💬",
          visibility,
          joinPolicy: visibility === "private" ? "open" : joinPolicy,
        },
        getToken,
      );
      onCreated(group);
    } catch (cause) {
      setError(
        isCommunityApiError(cause)
          ? cause.message
          : "We couldn't create the group. Please try again.",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[90] flex items-end justify-center bg-slate-950/50 p-0 backdrop-blur-sm sm:items-center sm:p-6">
      <button
        type="button"
        aria-label="Close create group dialog"
        className="absolute inset-0 cursor-default"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-community-group-title"
        className="relative z-10 max-h-[92dvh] w-full overflow-y-auto rounded-t-[32px] border border-subtle bg-surface-layer p-5 shadow-2xl sm:max-w-xl sm:rounded-[32px] sm:p-7"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-600">
              New space
            </p>
            <h2
              id="create-community-group-title"
              className="mt-1 text-2xl font-semibold tracking-tight"
            >
              Create a group
            </h2>
            <p className="mt-2 text-sm leading-6 text-text-secondary">
              Build a focused space for progress, resources, and accountable peers.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-text-secondary transition hover:bg-surface-elevated"
            aria-label="Close dialog"
          >
            <X size={19} />
          </button>
        </div>

        <form className="mt-6 space-y-5" onSubmit={submit}>
          <label className="block">
            <span className="text-sm font-semibold">Group name</span>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={80}
              autoFocus
              className="mt-2 h-12 w-full rounded-2xl border border-subtle bg-surface-body px-4 text-base outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
              placeholder="e.g. Scholarship Builders"
            />
          </label>

          <label className="block">
            <span className="text-sm font-semibold">Description</span>
            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              maxLength={500}
              rows={4}
              className="mt-2 w-full resize-none rounded-2xl border border-subtle bg-surface-body px-4 py-3 text-sm leading-6 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
              placeholder="What should members use this group for?"
            />
          </label>

          <div className="grid gap-4 sm:grid-cols-[112px_1fr]">
            <label className="block">
              <span className="text-sm font-semibold">Emoji</span>
              <input
                value={coverEmoji}
                onChange={(event) => setCoverEmoji(event.target.value)}
                maxLength={8}
                className="mt-2 h-12 w-full rounded-2xl border border-subtle bg-surface-body px-4 text-center text-xl outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
              />
            </label>
            <label className="block">
              <span className="text-sm font-semibold">Visibility</span>
              <select
                value={visibility}
                onChange={(event) =>
                  setVisibility(event.target.value as GroupVisibility)
                }
                className="mt-2 h-12 w-full rounded-2xl border border-subtle bg-surface-body px-4 text-sm font-semibold outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
              >
                <option value="public">Public — discoverable</option>
                <option value="private">Private — invite only</option>
              </select>
            </label>
          </div>

          {visibility === "public" ? (
            <fieldset>
              <legend className="text-sm font-semibold">How people join</legend>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                {([
                  ["open", "Open", "Join instantly"],
                  ["request", "Request", "Owner approves"],
                ] as const).map(([value, title, subtitle]) => (
                  <label
                    key={value}
                    className={`cursor-pointer rounded-2xl border p-4 transition ${
                      joinPolicy === value
                        ? "border-brand-500 bg-brand-500/10"
                        : "border-subtle bg-surface-body hover:bg-surface-elevated"
                    }`}
                  >
                    <input
                      type="radio"
                      name="joinPolicy"
                      value={value}
                      checked={joinPolicy === value}
                      onChange={() => setJoinPolicy(value)}
                      className="sr-only"
                    />
                    <span className="block text-sm font-semibold">{title}</span>
                    <span className="mt-1 block text-xs text-text-muted">
                      {subtitle}
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
          ) : (
            <div className="rounded-2xl border border-subtle bg-surface-elevated p-4 text-sm leading-6 text-text-secondary">
              Private groups are invite-only and never appear as open self-join rooms.
            </div>
          )}

          {error ? (
            <div role="alert" className="rounded-2xl bg-danger/10 px-4 py-3 text-sm font-semibold text-danger">
              {error}
            </div>
          ) : null}

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={onClose}
              className="min-h-11 rounded-2xl border border-subtle px-5 text-sm font-semibold text-text-secondary transition hover:bg-surface-elevated"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="min-h-11 rounded-2xl bg-brand-500 px-5 text-sm font-semibold text-white transition hover:bg-brand-600 disabled:cursor-wait disabled:opacity-60"
            >
              {saving ? "Creating…" : "Create group"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function EmptyGroups({ mine }: { mine: boolean }) {
  return (
    <div className="col-span-full rounded-[28px] border border-dashed border-subtle bg-surface-layer p-8 text-center sm:p-12">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-500/10 text-brand-600">
        <Users size={24} />
      </div>
      <h2 className="mt-4 text-lg font-semibold">
        {mine ? "No active groups yet" : "No groups match this search"}
      </h2>
      <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-text-secondary">
        {mine
          ? "Join a group from Discover or create a focused room for your next goal."
          : "Try a broader search or clear the current keywords."}
      </p>
    </div>
  );
}

function MessagesPanel({
  conversations,
  requests,
  loading,
  error,
  onRetry,
}: {
  conversations: DmConversationSummary[];
  requests: DmRequestSummary[];
  loading: boolean;
  error: string | null;
  onRetry: () => void;
}) {
  if (loading) {
    return (
      <div className="grid gap-3" aria-label="Loading messages">
        {[0, 1, 2].map((item) => (
          <div key={item} className="h-24 animate-pulse rounded-[24px] bg-surface-elevated" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-[28px] border border-danger/20 bg-danger/5 p-6">
        <h2 className="font-semibold">Messages could not load</h2>
        <p className="mt-2 text-sm text-text-secondary">{error}</p>
        <button
          type="button"
          onClick={onRetry}
          className="mt-4 min-h-11 rounded-2xl bg-brand-500 px-5 text-sm font-semibold text-white"
        >
          Try again
        </button>
      </div>
    );
  }

  if (!requests.length && !conversations.length) {
    return (
      <div className="rounded-[28px] border border-dashed border-subtle bg-surface-layer p-10 text-center">
        <MessageCircle className="mx-auto text-brand-500" size={28} />
        <h2 className="mt-4 text-lg font-semibold">Your inbox is quiet</h2>
        <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-text-secondary">
          Direct messages start from people you meet inside Community groups. New conversations begin as requests for safety.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {requests.length ? (
        <section aria-labelledby="message-requests-title">
          <div className="mb-3 flex items-center justify-between">
            <h2 id="message-requests-title" className="text-base font-semibold">
              Message requests
            </h2>
            <span className="rounded-full bg-brand-500/10 px-2.5 py-1 text-xs font-semibold text-brand-700">
              {requests.length}
            </span>
          </div>
          <div className="grid gap-3">
            {requests.map((request) => (
              <Link
                key={request.id}
                to={`/app/community/messages/${encodeURIComponent(request.id)}`}
                className="flex items-center gap-4 rounded-[24px] border border-subtle bg-surface-layer p-4 shadow-sm transition hover:bg-surface-elevated"
              >
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-brand-500/10 text-sm font-semibold text-brand-700">
                  {request.otherUser.displayName.slice(0, 2).toUpperCase() || "E"}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">
                    {request.otherUser.displayName}
                  </span>
                  <span className="mt-1 block truncate text-sm text-text-secondary">
                    {request.firstMessage.body}
                  </span>
                </span>
                <ArrowRight size={17} className="shrink-0 text-text-muted" />
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      {conversations.length ? (
        <section aria-labelledby="conversations-title">
          <h2 id="conversations-title" className="mb-3 text-base font-semibold">
            Conversations
          </h2>
          <div className="grid gap-3">
            {conversations.map((conversation) => (
              <Link
                key={conversation.id}
                to={`/app/community/messages/${encodeURIComponent(conversation.id)}`}
                className="flex items-center gap-4 rounded-[24px] border border-subtle bg-surface-layer p-4 shadow-sm transition hover:bg-surface-elevated"
              >
                <span className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-surface-elevated text-sm font-semibold">
                  {conversation.otherUser.displayName.slice(0, 2).toUpperCase() || "E"}
                  {conversation.unreadCount > 0 ? (
                    <span className="absolute -right-1 -top-1 min-w-5 rounded-full bg-brand-500 px-1.5 text-center text-2xs font-semibold leading-5 text-white">
                      {conversation.unreadCount > 99 ? "99+" : conversation.unreadCount}
                    </span>
                  ) : null}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">
                    {conversation.otherUser.displayName}
                  </span>
                  <span className="mt-1 block truncate text-sm text-text-secondary">
                    {conversation.lastMessage.body}
                  </span>
                </span>
                <span className="shrink-0 text-xs font-semibold text-text-muted">
                  {formatActivity(conversation.lastMessageAt)}
                </span>
              </Link>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

export default function CommunityWorkspacePage() {
  const { getToken } = useClerk();
  const navigate = useNavigate();
  const [tab, setTab] = useState<CommunityTab>("discover");
  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [groups, setGroups] = useState<GroupWithMembership[]>([]);
  const [groupsLoading, setGroupsLoading] = useState(true);
  const [groupsError, setGroupsError] = useState<string | null>(null);
  const [busyGroupId, setBusyGroupId] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [conversations, setConversations] = useState<DmConversationSummary[]>([]);
  const [requests, setRequests] = useState<DmRequestSummary[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [messagesError, setMessagesError] = useState<string | null>(null);

  const mine = tab === "groups";

  const loadGroups = useCallback(async () => {
    if (tab === "messages") return;
    setGroupsLoading(true);
    setGroupsError(null);
    try {
      const rows = await fetchGroups(
        {
          mine,
          query: mine ? undefined : searchQuery || undefined,
          limit: 50,
        },
        getToken,
      );
      setGroups(rows);
    } catch (cause) {
      setGroupsError(
        isCommunityApiError(cause)
          ? cause.message
          : "Community groups are unavailable right now.",
      );
    } finally {
      setGroupsLoading(false);
    }
  }, [getToken, mine, searchQuery, tab]);

  const loadMessages = useCallback(async () => {
    if (tab !== "messages") return;
    setMessagesLoading(true);
    setMessagesError(null);
    try {
      const [conversationRows, requestRows] = await Promise.all([
        fetchDmConversations({ limit: 30 }, getToken),
        fetchDmRequests("incoming", { limit: 20 }, getToken),
      ]);
      setConversations(conversationRows);
      setRequests(requestRows);
    } catch (cause) {
      setMessagesError(
        isCommunityDmApiError(cause)
          ? cause.message
          : "Messages are unavailable right now.",
      );
    } finally {
      setMessagesLoading(false);
    }
  }, [getToken, tab]);

  useEffect(() => {
    void loadGroups();
  }, [loadGroups]);

  useEffect(() => {
    void loadMessages();
  }, [loadMessages]);

  const visibleGroups = useMemo(
    () =>
      mine
        ? groups.filter(
            (row) =>
              row.membership?.status === "active" ||
              row.membership?.status === "invited" ||
              row.membership?.status === "pending",
          )
        : groups,
    [groups, mine],
  );

  const handleJoin = async (row: GroupWithMembership) => {
    if (busyGroupId) return;
    setBusyGroupId(row.group.id);
    setNotice(null);
    try {
      const result = await joinGroup(row.group.id, [], getToken);
      setGroups((current) =>
        current.map((candidate) =>
          candidate.group.id === row.group.id
            ? { ...candidate, membership: result.membership }
            : candidate,
        ),
      );
      setNotice({
        tone: "success",
        text:
          row.membership?.status === "invited"
            ? "Invitation accepted."
            : result.status === "pending"
              ? "Request sent."
              : "You're in the group.",
      });
    } catch (cause) {
      setNotice({
        tone: "error",
        text: isCommunityApiError(cause)
          ? cause.message
          : "We couldn't update your membership. Please try again.",
      });
    } finally {
      setBusyGroupId(null);
    }
  };

  const submitSearch = (event: React.FormEvent) => {
    event.preventDefault();
    setSearchQuery(searchInput.trim());
  };

  return (
    <main className="min-h-[calc(100dvh-4rem)] bg-surface-body px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <div className="mx-auto max-w-7xl">
        <section className="relative overflow-hidden rounded-[32px] border border-subtle bg-surface-layer p-5 shadow-sm sm:p-7 lg:p-8">
          <div className="pointer-events-none absolute -right-16 -top-20 h-64 w-64 rounded-full bg-brand-500/10 blur-3xl" />
          <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <div className="inline-flex items-center gap-2 rounded-full bg-brand-500/10 px-3 py-1.5 text-xs font-semibold text-brand-700">
                <Sparkles size={14} aria-hidden="true" /> Learn with people who are moving too
              </div>
              <h1 className="mt-4 text-3xl font-semibold tracking-[-0.035em] text-text-primary sm:text-4xl lg:text-5xl">
                Community
              </h1>
              <p className="mt-3 max-w-2xl text-base leading-7 text-text-secondary sm:text-lg">
                Find focused groups, compare progress, share useful resources, and message peers without leaving your Edutu workspace.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setCreateOpen(true)}
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-brand-500 px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
            >
              <Plus size={18} aria-hidden="true" /> Create group
            </button>
          </div>
        </section>

        {notice ? (
          <div
            role={notice.tone === "error" ? "alert" : "status"}
            className={`mt-4 flex items-start justify-between gap-3 rounded-2xl border px-4 py-3 text-sm font-semibold ${
              notice.tone === "error"
                ? "border-danger/20 bg-danger/10 text-danger"
                : "border-success/20 bg-success/10 text-success"
            }`}
          >
            <span>{notice.text}</span>
            <button
              type="button"
              aria-label="Dismiss notification"
              onClick={() => setNotice(null)}
              className="shrink-0 rounded-lg p-1 hover:bg-black/5"
            >
              <X size={15} />
            </button>
          </div>
        ) : null}

        <div className="mt-6 border-b border-subtle">
          <div
            role="tablist"
            aria-label="Community sections"
            className="flex gap-1 overflow-x-auto"
          >
            {([
              ["discover", "Discover", Search],
              ["groups", "Your groups", Users],
              ["messages", "Messages", MessageCircle],
            ] as const).map(([value, label, Icon]) => {
              const active = tab === value;
              return (
                <button
                  key={value}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => {
                    setTab(value);
                    setNotice(null);
                  }}
                  className={`relative flex min-h-12 shrink-0 items-center gap-2 px-4 text-sm font-semibold transition ${
                    active ? "text-brand-700" : "text-text-muted hover:text-text-primary"
                  }`}
                >
                  <Icon size={17} aria-hidden="true" /> {label}
                  <span
                    className={`absolute inset-x-3 bottom-0 h-0.5 rounded-full bg-brand-500 transition-opacity ${
                      active ? "opacity-100" : "opacity-0"
                    }`}
                  />
                </button>
              );
            })}
          </div>
        </div>

        {tab !== "messages" ? (
          <section className="mt-6" aria-live="polite">
            <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2 className="text-xl font-semibold tracking-tight">
                  {mine ? "Your groups" : "Discover groups"}
                </h2>
                <p className="mt-1 text-sm leading-6 text-text-secondary">
                  {mine
                    ? "Active rooms, invitations, and requests you are waiting on."
                    : "Browse public rooms and any private invitations sent to you."}
                </p>
              </div>

              {!mine ? (
                <form onSubmit={submitSearch} className="flex w-full gap-2 sm:max-w-md">
                  <label className="relative flex-1">
                    <span className="sr-only">Search community groups</span>
                    <Search
                      size={17}
                      className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-text-muted"
                    />
                    <input
                      value={searchInput}
                      onChange={(event) => setSearchInput(event.target.value)}
                      className="h-12 w-full rounded-2xl border border-subtle bg-surface-layer pl-11 pr-4 text-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
                      placeholder="Search groups"
                    />
                  </label>
                  <button
                    type="submit"
                    className="h-12 rounded-2xl border border-subtle bg-surface-layer px-4 text-sm font-semibold transition hover:bg-surface-elevated"
                  >
                    Search
                  </button>
                </form>
              ) : null}
            </div>

            {groupsLoading ? (
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3" aria-label="Loading community groups">
                {[0, 1, 2, 3, 4, 5].map((item) => (
                  <div
                    key={item}
                    className="h-[280px] animate-pulse rounded-[28px] bg-surface-elevated"
                  />
                ))}
              </div>
            ) : groupsError ? (
              <div className="rounded-[28px] border border-danger/20 bg-danger/5 p-6 sm:p-8">
                <h2 className="text-lg font-semibold">Community could not load</h2>
                <p className="mt-2 max-w-xl text-sm leading-6 text-text-secondary">
                  {groupsError}
                </p>
                <button
                  type="button"
                  onClick={() => void loadGroups()}
                  className="mt-4 min-h-11 rounded-2xl bg-brand-500 px-5 text-sm font-semibold text-white"
                >
                  Try again
                </button>
              </div>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {visibleGroups.length ? (
                  visibleGroups.map((row) => (
                    <GroupCard
                      key={row.group.id}
                      row={row}
                      busyGroupId={busyGroupId}
                      onJoin={(candidate) => void handleJoin(candidate)}
                    />
                  ))
                ) : (
                  <EmptyGroups mine={mine} />
                )}
              </div>
            )}
          </section>
        ) : (
          <section className="mt-6" aria-live="polite">
            <div className="mb-5 flex items-end justify-between gap-4">
              <div>
                <h2 className="text-xl font-semibold tracking-tight">Messages</h2>
                <p className="mt-1 text-sm leading-6 text-text-secondary">
                  Private peer conversations begin as requests and stay separate from group chat.
                </p>
              </div>
              <Link
                to="/app/community/messages"
                className="hidden min-h-11 items-center gap-2 rounded-2xl border border-subtle bg-surface-layer px-4 text-sm font-semibold transition hover:bg-surface-elevated sm:inline-flex"
              >
                Open inbox <ArrowRight size={16} />
              </Link>
            </div>
            <MessagesPanel
              conversations={conversations}
              requests={requests}
              loading={messagesLoading}
              error={messagesError}
              onRetry={() => void loadMessages()}
            />
          </section>
        )}
      </div>

      <CreateGroupDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={(group) => {
          setCreateOpen(false);
          navigate(`/app/community/groups/${encodeURIComponent(group.id)}`);
        }}
      />
    </main>
  );
}
