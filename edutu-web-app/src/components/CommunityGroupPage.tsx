import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Archive,
  ArrowLeft,
  Ban,
  Check,
  Download,
  FileText,
  Flag,
  Image as ImageIcon,
  Loader2,
  Lock,
  MessageCircle,
  Paperclip,
  Send,
  Settings2,
  Shield,
  Trash2,
  UserMinus,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useClerk } from "../hooks/useAuth";
import {
  COMMUNITY_IMAGE_MAX_BYTES,
  COMMUNITY_PDF_MAX_BYTES,
  COMMUNITY_PDF_MIME_TYPE,
  archiveGroup,
  blockUser,
  createCommunityAttachmentUpload,
  decideJoinRequest,
  deleteMessage,
  fetchGroup,
  fetchGroupForm,
  fetchGroupMembers,
  fetchGroupResources,
  fetchJoinRequests,
  fetchMessages,
  inviteToGroup,
  isCommunityApiError,
  joinGroup,
  removeMember,
  reportTarget,
  resolveCommunityAttachmentUrl,
  sendMessage,
  serializeCommunityAttachment,
  setMemberRole,
  updateGroup,
  uploadCommunityAttachment,
  type CommunityAttachment,
  type CommunityGroupResource,
  type CommunityMemberSummary,
  type CommunityMessage,
  type CommunityResourceCursor,
  type GroupDetail,
  type GroupQuestion,
  type JoinRequest,
  type JoinRequestAnswer,
  type MemberRole,
} from "../services/community";

type RoomTab = "chat" | "resources" | "members" | "admin";
type Notice = { tone: "success" | "error"; text: string } | null;
type ReportTarget = { type: "message" | "group"; id: string; label: string } | null;

const GROUP_PAGE_SIZE = 50;

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Recently";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function initials(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .map((part) => part[0])
      .join("")
      .slice(0, 2)
      .toUpperCase() || "E"
  );
}

function mergeMessages(
  current: CommunityMessage[],
  incoming: CommunityMessage[],
): CommunityMessage[] {
  const byId = new Map(current.map((message) => [message.id, message]));
  incoming.forEach((message) => byId.set(message.id, message));
  return [...byId.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

function mergeResources(
  current: CommunityGroupResource[],
  incoming: CommunityGroupResource[],
): CommunityGroupResource[] {
  const byId = new Map(current.map((resource) => [resource.id, resource]));
  incoming.forEach((resource) => byId.set(resource.id, resource));
  return [...byId.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

function parseMessageAttachment(message: CommunityMessage): CommunityAttachment | null {
  if (message.kind !== "image" && message.kind !== "file") return null;
  try {
    const parsed = JSON.parse(message.body) as Partial<CommunityAttachment>;
    if (
      typeof parsed.url !== "string" ||
      typeof parsed.name !== "string" ||
      typeof parsed.mime !== "string" ||
      typeof parsed.size !== "number"
    ) {
      return null;
    }
    return parsed as CommunityAttachment;
  } catch {
    return null;
  }
}

function NoticeBanner({ notice, onClose }: { notice: Notice; onClose: () => void }) {
  if (!notice) return null;
  return (
    <div
      role={notice.tone === "error" ? "alert" : "status"}
      className={`mb-4 flex items-start justify-between gap-3 rounded-2xl border px-4 py-3 text-sm font-semibold ${
        notice.tone === "error"
          ? "border-danger/20 bg-danger/10 text-danger"
          : "border-success/20 bg-success/10 text-success"
      }`}
    >
      <span>{notice.text}</span>
      <button type="button" onClick={onClose} aria-label="Dismiss notification" className="rounded-lg p-1 hover:bg-black/5">
        <X size={15} />
      </button>
    </div>
  );
}

function ReportDialog({
  target,
  busy,
  onClose,
  onSubmit,
}: {
  target: ReportTarget;
  busy: boolean;
  onClose: () => void;
  onSubmit: (reason: string) => void;
}) {
  const [reason, setReason] = useState("");
  useEffect(() => setReason(""), [target?.id]);
  if (!target) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center bg-slate-950/50 p-0 backdrop-blur-sm sm:items-center sm:p-6">
      <button type="button" className="absolute inset-0 cursor-default" aria-label="Close report dialog" onClick={onClose} />
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="community-report-title"
        className="relative z-10 w-full rounded-t-[30px] border border-subtle bg-surface-layer p-5 shadow-2xl sm:max-w-lg sm:rounded-[30px] sm:p-6"
        onSubmit={(event) => {
          event.preventDefault();
          if (reason.trim().length >= 5) onSubmit(reason.trim());
        }}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id="community-report-title" className="text-xl font-semibold">Report {target.label}</h2>
            <p className="mt-2 text-sm leading-6 text-text-secondary">
              Tell Edutu what is wrong. Reports are reviewed without exposing your identity to group owners.
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close dialog" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl hover:bg-surface-elevated">
            <X size={18} />
          </button>
        </div>
        <label className="mt-5 block">
          <span className="text-sm font-semibold">Reason</span>
          <textarea
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            minLength={5}
            maxLength={500}
            rows={4}
            required
            className="mt-2 w-full resize-none rounded-2xl border border-subtle bg-surface-body px-4 py-3 text-sm leading-6 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
            placeholder="Describe the safety or conduct issue"
          />
        </label>
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" onClick={onClose} className="min-h-11 rounded-2xl border border-subtle px-5 text-sm font-semibold">Cancel</button>
          <button type="submit" disabled={busy || reason.trim().length < 5} className="min-h-11 rounded-2xl bg-danger px-5 text-sm font-semibold text-white disabled:opacity-50">
            {busy ? "Sending…" : "Send report"}
          </button>
        </div>
      </form>
    </div>
  );
}

function JoinGate({
  detail,
  questions,
  questionsLoading,
  busy,
  onJoin,
}: {
  detail: GroupDetail;
  questions: GroupQuestion[];
  questionsLoading: boolean;
  busy: boolean;
  onJoin: (answers: JoinRequestAnswer[]) => void;
}) {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const { group, membership } = detail;
  const status = membership?.status;

  if (status === "pending") {
    return (
      <div className="rounded-[28px] border border-warning/20 bg-warning/10 p-6">
        <h2 className="text-lg font-semibold">Your request is waiting for review</h2>
        <p className="mt-2 text-sm leading-6 text-text-secondary">
          You will be able to read and post in this group only after an owner or moderator approves you.
        </p>
      </div>
    );
  }

  if (status === "banned" || status === "removed") {
    return (
      <div className="rounded-[28px] border border-danger/20 bg-danger/10 p-6">
        <h2 className="text-lg font-semibold">This group is not available to your account</h2>
        <p className="mt-2 text-sm leading-6 text-text-secondary">
          You cannot rejoin from the browser. Contact Edutu support if you believe this is an error.
        </p>
      </div>
    );
  }

  if (status === "invited") {
    return (
      <div className="rounded-[28px] border border-brand-500/20 bg-brand-500/10 p-6">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-700">Private invitation</p>
        <h2 className="mt-2 text-xl font-semibold">You have been invited to join</h2>
        <p className="mt-2 text-sm leading-6 text-text-secondary">
          Accepting gives you access to this group’s messages, resources, and member list.
        </p>
        <button
          type="button"
          disabled={busy}
          onClick={() => onJoin([])}
          className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-2xl bg-brand-500 px-5 text-sm font-semibold text-white disabled:opacity-60"
        >
          <Check size={17} /> {busy ? "Accepting…" : "Accept invitation"}
        </button>
      </div>
    );
  }

  if (group.visibility === "private") {
    return (
      <div className="rounded-[28px] border border-subtle bg-surface-layer p-6">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-surface-elevated text-text-secondary"><Lock size={19} /></div>
        <h2 className="mt-4 text-lg font-semibold">Invite-only group</h2>
        <p className="mt-2 text-sm leading-6 text-text-secondary">Only members with a valid invitation can enter this private room.</p>
      </div>
    );
  }

  if (group.joinPolicy === "open") {
    return (
      <div className="rounded-[28px] border border-brand-500/20 bg-brand-500/5 p-6">
        <h2 className="text-lg font-semibold">Join the conversation</h2>
        <p className="mt-2 text-sm leading-6 text-text-secondary">This is an open group. Join to read the full discussion, share resources, and meet members.</p>
        <button type="button" disabled={busy} onClick={() => onJoin([])} className="mt-5 min-h-11 rounded-2xl bg-brand-500 px-5 text-sm font-semibold text-white disabled:opacity-60">
          {busy ? "Joining…" : "Join group"}
        </button>
      </div>
    );
  }

  return (
    <form
      className="rounded-[28px] border border-subtle bg-surface-layer p-5 sm:p-6"
      onSubmit={(event) => {
        event.preventDefault();
        const requiredMissing = questions.some((question) => question.required && !answers[question.id]?.trim());
        if (requiredMissing) return;
        onJoin(
          questions
            .filter((question) => answers[question.id]?.trim())
            .map((question) => ({ id: question.id, value: answers[question.id].trim() })),
        );
      }}
    >
      <h2 className="text-xl font-semibold">Request to join</h2>
      <p className="mt-2 text-sm leading-6 text-text-secondary">The group owner reviews requests before private discussion becomes visible.</p>
      {questionsLoading ? (
        <div className="mt-5 flex items-center gap-2 text-sm text-text-muted"><Loader2 size={17} className="animate-spin" /> Loading questions…</div>
      ) : (
        <div className="mt-5 space-y-4">
          {questions.map((question) => (
            <label key={question.id} className="block">
              <span className="text-sm font-semibold">{question.label}{question.required ? " *" : ""}</span>
              {question.type === "single_select" ? (
                <select
                  value={answers[question.id] || ""}
                  onChange={(event) => setAnswers((current) => ({ ...current, [question.id]: event.target.value }))}
                  required={question.required}
                  className="mt-2 h-12 w-full rounded-2xl border border-subtle bg-surface-body px-4 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
                >
                  <option value="">Choose an answer</option>
                  {question.options.map((option) => <option key={option} value={option}>{option}</option>)}
                </select>
              ) : question.type === "long_text" ? (
                <textarea
                  value={answers[question.id] || ""}
                  onChange={(event) => setAnswers((current) => ({ ...current, [question.id]: event.target.value }))}
                  required={question.required}
                  rows={4}
                  maxLength={500}
                  className="mt-2 w-full resize-none rounded-2xl border border-subtle bg-surface-body px-4 py-3 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
                />
              ) : (
                <input
                  value={answers[question.id] || ""}
                  onChange={(event) => setAnswers((current) => ({ ...current, [question.id]: event.target.value }))}
                  required={question.required}
                  maxLength={200}
                  className="mt-2 h-12 w-full rounded-2xl border border-subtle bg-surface-body px-4 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
                />
              )}
            </label>
          ))}
          {!questions.length ? <p className="text-sm text-text-muted">No questions are required. Send your request when ready.</p> : null}
        </div>
      )}
      <button type="submit" disabled={busy || questionsLoading} className="mt-5 min-h-11 rounded-2xl bg-brand-500 px-5 text-sm font-semibold text-white disabled:opacity-60">
        {busy ? "Sending request…" : "Send join request"}
      </button>
    </form>
  );
}

function AdminPanel({
  detail,
  members,
  onDetailChange,
  onMembersChange,
  onNotice,
}: {
  detail: GroupDetail;
  members: CommunityMemberSummary[];
  onDetailChange: (detail: GroupDetail) => void;
  onMembersChange: (members: CommunityMemberSummary[]) => void;
  onNotice: (notice: Notice) => void;
}) {
  const { getToken } = useClerk();
  const navigate = useNavigate();
  const [requests, setRequests] = useState<JoinRequest[]>([]);
  const [loadingRequests, setLoadingRequests] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [inviteeId, setInviteeId] = useState("");
  const [name, setName] = useState(detail.group.name);
  const [description, setDescription] = useState(detail.group.description || "");
  const [visibility, setVisibility] = useState(detail.group.visibility);
  const [joinPolicy, setJoinPolicy] = useState(detail.group.joinPolicy);

  useEffect(() => {
    let cancelled = false;
    setLoadingRequests(true);
    fetchJoinRequests(detail.group.id, getToken)
      .then((rows) => {
        if (!cancelled) setRequests(rows.filter((row) => row.status === "pending"));
      })
      .catch((cause) => {
        if (!cancelled) onNotice({ tone: "error", text: isCommunityApiError(cause) ? cause.message : "Join requests could not load." });
      })
      .finally(() => {
        if (!cancelled) setLoadingRequests(false);
      });
    return () => { cancelled = true; };
  }, [detail.group.id, getToken, onNotice]);

  const decide = async (request: JoinRequest, decision: "approved" | "rejected") => {
    setBusyId(request.id);
    try {
      await decideJoinRequest(detail.group.id, request.id, decision, getToken);
      setRequests((current) => current.filter((row) => row.id !== request.id));
      onNotice({ tone: "success", text: decision === "approved" ? "Member approved." : "Request declined." });
    } catch (cause) {
      onNotice({ tone: "error", text: isCommunityApiError(cause) ? cause.message : "Request could not be updated." });
    } finally {
      setBusyId(null);
    }
  };

  const changeRole = async (member: CommunityMemberSummary, role: MemberRole) => {
    setBusyId(member.membership.id);
    try {
      const updated = await setMemberRole(detail.group.id, member.membership.userId, role, getToken);
      onMembersChange(members.map((row) => row.membership.id === member.membership.id ? { ...row, membership: updated } : row));
      onNotice({ tone: "success", text: "Member role updated." });
    } catch (cause) {
      onNotice({ tone: "error", text: isCommunityApiError(cause) ? cause.message : "Role could not be updated." });
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (member: CommunityMemberSummary) => {
    setBusyId(member.membership.id);
    try {
      await removeMember(detail.group.id, member.membership.userId, getToken);
      onMembersChange(members.filter((row) => row.membership.id !== member.membership.id));
      onNotice({ tone: "success", text: "Member removed." });
    } catch (cause) {
      onNotice({ tone: "error", text: isCommunityApiError(cause) ? cause.message : "Member could not be removed." });
    } finally {
      setBusyId(null);
    }
  };

  const saveSettings = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusyId("settings");
    try {
      const group = await updateGroup(detail.group.id, {
        name: name.trim(),
        description: description.trim(),
        visibility,
        joinPolicy: visibility === "private" ? "open" : joinPolicy,
      }, getToken);
      onDetailChange({ ...detail, group });
      onNotice({ tone: "success", text: "Group settings saved." });
    } catch (cause) {
      onNotice({ tone: "error", text: isCommunityApiError(cause) ? cause.message : "Group settings could not be saved." });
    } finally {
      setBusyId(null);
    }
  };

  const invite = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!inviteeId.trim()) return;
    setBusyId("invite");
    try {
      await inviteToGroup(detail.group.id, inviteeId.trim(), getToken);
      setInviteeId("");
      onNotice({ tone: "success", text: "Invitation sent." });
    } catch (cause) {
      onNotice({ tone: "error", text: isCommunityApiError(cause) ? cause.message : "Invitation could not be sent." });
    } finally {
      setBusyId(null);
    }
  };

  const archive = async () => {
    setBusyId("archive");
    try {
      const group = await archiveGroup(detail.group.id, getToken);
      onDetailChange({ ...detail, group });
      onNotice({ tone: "success", text: "Group archived." });
      navigate("/app/community");
    } catch (cause) {
      onNotice({ tone: "error", text: isCommunityApiError(cause) ? cause.message : "Group could not be archived." });
      setBusyId(null);
    }
  };

  return (
    <div className="grid gap-5 xl:grid-cols-2">
      <form onSubmit={saveSettings} className="rounded-[28px] border border-subtle bg-surface-layer p-5 sm:p-6">
        <h2 className="flex items-center gap-2 text-lg font-semibold"><Settings2 size={19} className="text-brand-500" /> Group settings</h2>
        <label className="mt-5 block text-sm font-semibold">Name
          <input value={name} onChange={(event) => setName(event.target.value)} minLength={3} maxLength={80} required className="mt-2 h-12 w-full rounded-2xl border border-subtle bg-surface-body px-4 font-normal outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20" />
        </label>
        <label className="mt-4 block text-sm font-semibold">Description
          <textarea value={description} onChange={(event) => setDescription(event.target.value)} maxLength={500} rows={4} className="mt-2 w-full resize-none rounded-2xl border border-subtle bg-surface-body px-4 py-3 font-normal outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20" />
        </label>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="text-sm font-semibold">Visibility
            <select value={visibility} onChange={(event) => setVisibility(event.target.value as "public" | "private")} className="mt-2 h-12 w-full rounded-2xl border border-subtle bg-surface-body px-4 font-normal">
              <option value="public">Public</option><option value="private">Private</option>
            </select>
          </label>
          <label className="text-sm font-semibold">Joining
            <select value={joinPolicy} disabled={visibility === "private"} onChange={(event) => setJoinPolicy(event.target.value as "open" | "request")} className="mt-2 h-12 w-full rounded-2xl border border-subtle bg-surface-body px-4 font-normal disabled:opacity-60">
              <option value="open">Open</option><option value="request">Request approval</option>
            </select>
          </label>
        </div>
        <button type="submit" disabled={busyId === "settings"} className="mt-5 min-h-11 rounded-2xl bg-brand-500 px-5 text-sm font-semibold text-white disabled:opacity-60">{busyId === "settings" ? "Saving…" : "Save settings"}</button>
      </form>

      <div className="space-y-5">
        <form onSubmit={invite} className="rounded-[28px] border border-subtle bg-surface-layer p-5 sm:p-6">
          <h2 className="flex items-center gap-2 text-lg font-semibold"><UserPlus size={19} className="text-brand-500" /> Invite member</h2>
          <p className="mt-2 text-sm leading-6 text-text-secondary">Invite using the member’s Edutu user ID. The backend validates whether the invitation is allowed.</p>
          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <input value={inviteeId} onChange={(event) => setInviteeId(event.target.value)} className="h-12 min-w-0 flex-1 rounded-2xl border border-subtle bg-surface-body px-4 text-sm outline-none focus:border-brand-500" placeholder="Edutu user ID" />
            <button type="submit" disabled={busyId === "invite" || !inviteeId.trim()} className="min-h-12 rounded-2xl bg-brand-500 px-5 text-sm font-semibold text-white disabled:opacity-50">{busyId === "invite" ? "Sending…" : "Invite"}</button>
          </div>
        </form>

        {detail.membership?.role === "owner" ? (
          <div className="rounded-[28px] border border-danger/20 bg-danger/5 p-5 sm:p-6">
            <h2 className="flex items-center gap-2 text-lg font-semibold"><Archive size={19} className="text-danger" /> Archive group</h2>
            <p className="mt-2 text-sm leading-6 text-text-secondary">Archiving stops new activity and removes the group from active discovery without deleting its audit history.</p>
            <button type="button" disabled={busyId === "archive"} onClick={() => void archive()} className="mt-4 min-h-11 rounded-2xl border border-danger/30 px-5 text-sm font-semibold text-danger disabled:opacity-60">{busyId === "archive" ? "Archiving…" : "Archive group"}</button>
          </div>
        ) : null}
      </div>

      <section className="rounded-[28px] border border-subtle bg-surface-layer p-5 sm:p-6 xl:col-span-2">
        <div className="flex items-center justify-between gap-3"><h2 className="text-lg font-semibold">Join requests</h2><span className="rounded-full bg-brand-500/10 px-2.5 py-1 text-xs font-semibold text-brand-700">{requests.length}</span></div>
        {loadingRequests ? <p className="mt-4 text-sm text-text-muted">Loading requests…</p> : requests.length ? (
          <div className="mt-4 divide-y divide-subtle">
            {requests.map((request) => (
              <div key={request.id} className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0"><p className="truncate text-sm font-semibold">{request.userId}</p><p className="mt-1 text-xs text-text-muted">Requested {formatDate(request.createdAt)}</p></div>
                <div className="flex gap-2"><button type="button" disabled={busyId === request.id} onClick={() => void decide(request, "rejected")} className="min-h-10 rounded-xl border border-subtle px-4 text-xs font-semibold">Decline</button><button type="button" disabled={busyId === request.id} onClick={() => void decide(request, "approved")} className="min-h-10 rounded-xl bg-brand-500 px-4 text-xs font-semibold text-white">Approve</button></div>
              </div>
            ))}
          </div>
        ) : <p className="mt-4 text-sm text-text-muted">No pending requests.</p>}
      </section>

      <section className="rounded-[28px] border border-subtle bg-surface-layer p-5 sm:p-6 xl:col-span-2">
        <h2 className="text-lg font-semibold">Member controls</h2>
        <div className="mt-4 divide-y divide-subtle">
          {members.filter((row) => row.membership.status === "active").map((member) => (
            <div key={member.membership.id} className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0 lg:flex-row lg:items-center lg:justify-between">
              <div className="min-w-0"><p className="truncate text-sm font-semibold">{member.profile.displayName}</p><p className="mt-1 text-xs text-text-muted">{member.membership.userId}</p></div>
              <div className="flex flex-wrap gap-2">
                {member.membership.role !== "owner" ? <select value={member.membership.role} disabled={busyId === member.membership.id} onChange={(event) => void changeRole(member, event.target.value as MemberRole)} className="h-10 rounded-xl border border-subtle bg-surface-body px-3 text-xs font-semibold"><option value="member">Member</option><option value="mod">Moderator</option></select> : <span className="inline-flex h-10 items-center rounded-xl bg-brand-500/10 px-3 text-xs font-semibold text-brand-700">Owner</span>}
                {member.membership.role !== "owner" ? <button type="button" disabled={busyId === member.membership.id} onClick={() => void remove(member)} className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-danger/20 px-3 text-xs font-semibold text-danger"><UserMinus size={14} /> Remove</button> : null}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

export default function CommunityGroupPage() {
  const { groupId = "" } = useParams();
  const { getToken, userId } = useClerk();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [detail, setDetail] = useState<GroupDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<RoomTab>("chat");
  const [messages, setMessages] = useState<CommunityMessage[]>([]);
  const [resources, setResources] = useState<CommunityGroupResource[]>([]);
  const [members, setMembers] = useState<CommunityMemberSummary[]>([]);
  const [contentLoading, setContentLoading] = useState(false);
  const [messagesHasMore, setMessagesHasMore] = useState(false);
  const [loadingOlderMessages, setLoadingOlderMessages] = useState(false);
  const [resourceCursor, setResourceCursor] = useState<CommunityResourceCursor | null>(null);
  const [loadingOlderResources, setLoadingOlderResources] = useState(false);
  const [composer, setComposer] = useState("");
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [joinBusy, setJoinBusy] = useState(false);
  const [questions, setQuestions] = useState<GroupQuestion[]>([]);
  const [questionsLoading, setQuestionsLoading] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const [reportTargetState, setReportTargetState] = useState<ReportTarget>(null);
  const [reportBusy, setReportBusy] = useState(false);

  const loadDetail = useCallback(async () => {
    if (!groupId) return;
    setLoading(true);
    setError(null);
    try {
      const result = await fetchGroup(groupId, getToken);
      setDetail(result);
    } catch (cause) {
      setError(isCommunityApiError(cause) ? cause.message : "This Community group could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [getToken, groupId]);

  useEffect(() => { void loadDetail(); }, [loadDetail]);

  useEffect(() => {
    if (!detail || detail.membership?.status === "active" || detail.group.joinPolicy !== "request" || detail.group.visibility !== "public") return;
    let cancelled = false;
    setQuestionsLoading(true);
    fetchGroupForm(detail.group.id, getToken)
      .then((form) => { if (!cancelled) setQuestions(form.questions); })
      .catch(() => { if (!cancelled) setQuestions([]); })
      .finally(() => { if (!cancelled) setQuestionsLoading(false); });
    return () => { cancelled = true; };
  }, [detail, getToken]);

  const isActive = detail?.membership?.status === "active";
  const isAdmin = detail?.membership?.role === "owner" || detail?.membership?.role === "mod";

  const loadContent = useCallback(async (showLoader = true) => {
    if (!detail || detail.membership?.status !== "active") return;
    if (showLoader) setContentLoading(true);
    try {
      const [messageRows, resourcePage, memberPage] = await Promise.all([
        fetchMessages(detail.group.id, { limit: GROUP_PAGE_SIZE }, getToken),
        fetchGroupResources(detail.group.id, { limit: GROUP_PAGE_SIZE }, getToken),
        fetchGroupMembers(detail.group.id, getToken, 100),
      ]);
      if (showLoader) {
        setMessages(mergeMessages([], messageRows));
        setResources(mergeResources([], resourcePage.resources));
        setMessagesHasMore(messageRows.length === GROUP_PAGE_SIZE);
        setResourceCursor(resourcePage.nextCursor);
      } else {
        setMessages((current) => mergeMessages(current, messageRows));
        setResources((current) => mergeResources(current, resourcePage.resources));
      }
      setMembers(memberPage.members.filter((member) => member.membership.status === "active"));
    } catch (cause) {
      if (showLoader) {
        setNotice({ tone: "error", text: isCommunityApiError(cause) ? cause.message : "Group activity could not load." });
      } else if (isCommunityApiError(cause) && (cause.status === 403 || cause.status === 404)) {
        void loadDetail();
      }
    } finally {
      if (showLoader) setContentLoading(false);
    }
  }, [detail, getToken, loadDetail]);

  useEffect(() => { void loadContent(true); }, [loadContent]);

  useEffect(() => {
    if (!isActive) return;
    const interval = window.setInterval(() => {
      if (typeof document === "undefined" || document.visibilityState === "visible") {
        void loadContent(false);
      }
    }, 15_000);
    return () => window.clearInterval(interval);
  }, [isActive, loadContent]);

  const loadEarlierMessages = async () => {
    if (!detail || !messages.length || loadingOlderMessages) return;
    const oldest = messages[0];
    setLoadingOlderMessages(true);
    try {
      const rows = await fetchMessages(
        detail.group.id,
        { before: oldest.createdAt, beforeId: oldest.id, limit: GROUP_PAGE_SIZE },
        getToken,
      );
      setMessages((current) => mergeMessages(current, rows));
      setMessagesHasMore(rows.length === GROUP_PAGE_SIZE);
    } catch (cause) {
      setNotice({ tone: "error", text: isCommunityApiError(cause) ? cause.message : "Earlier messages could not load." });
    } finally {
      setLoadingOlderMessages(false);
    }
  };

  const loadOlderResources = async () => {
    if (!detail || !resourceCursor || loadingOlderResources) return;
    setLoadingOlderResources(true);
    try {
      const page = await fetchGroupResources(
        detail.group.id,
        { ...resourceCursor, limit: GROUP_PAGE_SIZE },
        getToken,
      );
      setResources((current) => mergeResources(current, page.resources));
      setResourceCursor(page.nextCursor);
    } catch (cause) {
      setNotice({ tone: "error", text: isCommunityApiError(cause) ? cause.message : "More resources could not load." });
    } finally {
      setLoadingOlderResources(false);
    }
  };

  const handleJoin = async (answers: JoinRequestAnswer[]) => {
    if (!detail) return;
    setJoinBusy(true);
    setNotice(null);
    try {
      const result = await joinGroup(detail.group.id, answers, getToken);
      setDetail({ ...detail, membership: result.membership });
      setNotice({ tone: "success", text: result.status === "pending" ? "Join request sent." : "Welcome to the group." });
    } catch (cause) {
      setNotice({ tone: "error", text: isCommunityApiError(cause) ? cause.message : "Your membership could not be updated." });
    } finally {
      setJoinBusy(false);
    }
  };

  const handleSend = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!detail || !composer.trim() || sending) return;
    const body = composer.trim();
    setSending(true);
    setNotice(null);
    try {
      const message = await sendMessage(detail.group.id, { body }, getToken);
      setMessages((current) => mergeMessages(current, [message]));
      setComposer("");
    } catch (cause) {
      setNotice({ tone: "error", text: isCommunityApiError(cause) ? cause.message : "Your message could not be sent." });
    } finally {
      setSending(false);
    }
  };

  const handleFile = async (file: File) => {
    if (!detail || uploading) return;
    const isImage = ["image/jpeg", "image/png", "image/webp"].includes(file.type);
    const isPdf = file.type === COMMUNITY_PDF_MIME_TYPE;
    if ((!isImage && !isPdf) || (isImage && file.size > COMMUNITY_IMAGE_MAX_BYTES) || (isPdf && file.size > COMMUNITY_PDF_MAX_BYTES)) {
      setNotice({ tone: "error", text: "Choose a JPEG, PNG, or WebP image up to 5 MB, or a PDF up to 10 MB." });
      return;
    }
    const kind = isImage ? "image" as const : "file" as const;
    setUploading(true);
    setNotice(null);
    try {
      const reservation = await createCommunityAttachmentUpload(detail.group.id, { kind, name: file.name, mime: file.type as CommunityAttachment["mime"], size: file.size }, getToken);
      await uploadCommunityAttachment(reservation, file);
      const body = serializeCommunityAttachment(kind, { url: reservation.resourceUrl, name: file.name, mime: file.type as CommunityAttachment["mime"], size: file.size });
      const message = await sendMessage(detail.group.id, { kind, body }, getToken);
      setMessages((current) => mergeMessages(current, [message]));
      const resourcePage = await fetchGroupResources(detail.group.id, { limit: GROUP_PAGE_SIZE }, getToken);
      setResources((current) => mergeResources(current, resourcePage.resources));
      setNotice({ tone: "success", text: "Resource shared." });
    } catch (cause) {
      setNotice({ tone: "error", text: isCommunityApiError(cause) ? cause.message : cause instanceof Error ? cause.message : "The resource could not be shared." });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const openAttachment = async (resourceUrl: string) => {
    try {
      const resolved = await resolveCommunityAttachmentUrl(resourceUrl, getToken);
      window.open(resolved.url, "_blank", "noopener,noreferrer");
    } catch (cause) {
      setNotice({ tone: "error", text: cause instanceof Error ? cause.message : "The resource could not be opened." });
    }
  };

  const removeMessage = async (message: CommunityMessage) => {
    try {
      const updated = await deleteMessage(message.id, getToken);
      setMessages((current) => current.map((row) => row.id === updated.id ? updated : row));
      setNotice({ tone: "success", text: "Message removed." });
    } catch (cause) {
      setNotice({ tone: "error", text: isCommunityApiError(cause) ? cause.message : "Message could not be removed." });
    }
  };

  const submitReport = async (reason: string) => {
    if (!reportTargetState) return;
    setReportBusy(true);
    try {
      await reportTarget({ targetType: reportTargetState.type, targetId: reportTargetState.id, reason }, getToken);
      setReportTargetState(null);
      setNotice({ tone: "success", text: "Report sent to Edutu for review." });
    } catch (cause) {
      setNotice({ tone: "error", text: isCommunityApiError(cause) ? cause.message : "The report could not be sent." });
    } finally {
      setReportBusy(false);
    }
  };

  const handleBlock = async (member: CommunityMemberSummary) => {
    try {
      await blockUser(member.membership.userId, getToken);
      setMembers((current) => current.filter((row) => row.membership.userId !== member.membership.userId));
      setMessages((current) => current.filter((row) => row.userId !== member.membership.userId));
      setNotice({ tone: "success", text: `${member.profile.displayName} is blocked.` });
    } catch (cause) {
      setNotice({ tone: "error", text: isCommunityApiError(cause) ? cause.message : "The member could not be blocked." });
    }
  };

  const tabs = useMemo(() => {
    const base: Array<{ value: RoomTab; label: string; icon: typeof MessageCircle }> = [
      { value: "chat", label: "Chat", icon: MessageCircle },
      { value: "resources", label: "Resources", icon: FileText },
      { value: "members", label: "Members", icon: Users },
    ];
    if (isAdmin) base.push({ value: "admin", label: "Admin", icon: Shield });
    return base;
  }, [isAdmin]);

  if (loading) {
    return <main className="min-h-[70dvh] bg-surface-body px-4 py-8"><div className="mx-auto max-w-7xl animate-pulse space-y-4"><div className="h-48 rounded-[32px] bg-surface-elevated" /><div className="h-96 rounded-[28px] bg-surface-elevated" /></div></main>;
  }

  if (error || !detail) {
    return (
      <main className="min-h-[70dvh] bg-surface-body px-4 py-8"><div className="mx-auto max-w-2xl rounded-[28px] border border-danger/20 bg-surface-layer p-7"><h1 className="text-2xl font-semibold">Group unavailable</h1><p className="mt-3 text-sm leading-6 text-text-secondary">{error || "This group could not be found."}</p><div className="mt-5 flex gap-2"><Link to="/app/community" className="min-h-11 rounded-2xl border border-subtle px-5 py-3 text-sm font-semibold">Back to Community</Link><button type="button" onClick={() => void loadDetail()} className="min-h-11 rounded-2xl bg-brand-500 px-5 text-sm font-semibold text-white">Try again</button></div></div></main>
    );
  }

  const group = detail.group;

  return (
    <main className="min-h-[calc(100dvh-4rem)] bg-surface-body px-4 py-5 sm:px-6 lg:px-8 lg:py-8">
      <div className="mx-auto max-w-7xl">
        <Link to="/app/community" className="mb-4 inline-flex min-h-10 items-center gap-2 rounded-xl px-2 text-sm font-semibold text-text-secondary transition hover:bg-surface-elevated hover:text-text-primary"><ArrowLeft size={17} /> Community</Link>
        <section className="relative overflow-hidden rounded-[32px] border border-subtle bg-surface-layer shadow-sm">
          <div className="relative min-h-[190px] overflow-hidden bg-gradient-to-br from-brand-600 via-brand-500 to-brand-800 p-6 text-white sm:p-8">
            {group.coverImageResourceUrl ? <img src={group.coverImageResourceUrl} alt="" className="absolute inset-0 h-full w-full object-cover" /> : null}
            <div className="absolute inset-0 bg-gradient-to-r from-slate-950/75 via-slate-950/40 to-slate-950/15" />
            <div className="relative flex h-full flex-col justify-between gap-8">
              <div className="flex items-start justify-between gap-4">
                <span className="flex h-14 w-14 items-center justify-center rounded-[20px] border border-white/20 bg-white/15 text-3xl backdrop-blur">{group.coverEmoji || "💬"}</span>
                <div className="flex gap-2">
                  {group.visibility === "private" ? <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-950/50 px-3 py-1.5 text-xs font-semibold"><Lock size={12} /> Private</span> : null}
                  {group.archivedAt ? <span className="rounded-full bg-white/15 px-3 py-1.5 text-xs font-semibold backdrop-blur">Archived</span> : null}
                  <button type="button" aria-label="Report group" onClick={() => setReportTargetState({ type: "group", id: group.id, label: "group" })} className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-950/45 text-white transition hover:bg-slate-950/70"><Flag size={15} /></button>
                </div>
              </div>
              <div className="max-w-3xl"><h1 className="text-3xl font-semibold tracking-[-0.035em] sm:text-4xl lg:text-5xl">{group.name}</h1><p className="mt-3 max-w-2xl text-sm leading-6 text-white/85 sm:text-base">{group.description || "A focused Edutu group for learning, progress, and useful peer support."}</p><div className="mt-4 flex flex-wrap gap-4 text-xs font-semibold text-white/80"><span className="inline-flex items-center gap-1.5"><Users size={14} /> {group.memberCount} members</span><span className="inline-flex items-center gap-1.5"><MessageCircle size={14} /> {group.messageCount} posts</span>{detail.membership?.status === "active" ? <span className="inline-flex items-center gap-1.5"><Shield size={14} /> {detail.membership.role === "owner" ? "Owner" : detail.membership.role === "mod" ? "Moderator" : "Member"}</span> : null}</div></div>
            </div>
          </div>
        </section>

        <div className="mt-5"><NoticeBanner notice={notice} onClose={() => setNotice(null)} /></div>

        {!isActive ? (
          <div className="mt-5 max-w-3xl"><JoinGate detail={detail} questions={questions} questionsLoading={questionsLoading} busy={joinBusy} onJoin={(answers) => void handleJoin(answers)} /></div>
        ) : (
          <>
            <div className="mt-5 border-b border-subtle"><div role="tablist" aria-label="Group sections" className="flex gap-1 overflow-x-auto">{tabs.map(({ value, label, icon: Icon }) => <button key={value} type="button" role="tab" aria-selected={tab === value} onClick={() => setTab(value)} className={`relative flex min-h-12 shrink-0 items-center gap-2 px-4 text-sm font-semibold transition ${tab === value ? "text-brand-700" : "text-text-muted hover:text-text-primary"}`}><Icon size={17} /> {label}<span className={`absolute inset-x-3 bottom-0 h-0.5 rounded-full bg-brand-500 ${tab === value ? "opacity-100" : "opacity-0"}`} /></button>)}</div></div>

            {contentLoading ? <div className="mt-6 flex min-h-60 items-center justify-center rounded-[28px] border border-subtle bg-surface-layer"><Loader2 size={24} className="animate-spin text-brand-500" aria-label="Loading group activity" /></div> : null}

            {!contentLoading && tab === "chat" ? (
              <section className="mt-6 grid gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
                <div className="overflow-hidden rounded-[28px] border border-subtle bg-surface-layer shadow-sm">
                  <div className="border-b border-subtle px-4 py-4 sm:px-5"><h2 className="font-semibold">Group chat</h2><p className="mt-1 text-xs text-text-muted">Keep conversation useful, respectful, and relevant to the group. New activity refreshes while this tab is visible.</p></div>
                  <div className="max-h-[58dvh] min-h-[340px] overflow-y-auto px-4 py-5 sm:px-5" aria-live="polite">
                    {messages.length ? <div className="space-y-5">
                      {messagesHasMore ? <div className="flex justify-center"><button type="button" disabled={loadingOlderMessages} onClick={() => void loadEarlierMessages()} className="inline-flex min-h-11 items-center gap-2 rounded-2xl border border-subtle bg-surface-body px-4 text-xs font-semibold text-text-secondary transition hover:bg-surface-elevated disabled:opacity-60">{loadingOlderMessages ? <Loader2 size={15} className="animate-spin" /> : null}Load earlier messages</button></div> : null}
                      {messages.map((message) => {
                      const mine = message.userId === userId;
                      const attachment = parseMessageAttachment(message);
                      const deleted = Boolean(message.deletedAt);
                      return <article key={message.id} className={`flex gap-3 ${mine ? "flex-row-reverse" : ""}`}><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-surface-elevated text-xs font-semibold">{initials(message.author?.displayName || (mine ? "You" : "Member"))}</span><div className={`min-w-0 max-w-[82%] ${mine ? "text-right" : ""}`}><div className={`flex flex-wrap items-center gap-2 ${mine ? "justify-end" : ""}`}><span className="text-xs font-semibold">{mine ? "You" : message.author?.displayName || "Member"}</span><span className="text-2xs text-text-muted">{formatDate(message.createdAt)}</span></div><div className={`mt-1 rounded-[20px] px-4 py-3 text-left text-sm leading-6 ${mine ? "bg-brand-500 text-white" : "bg-surface-elevated text-text-primary"}`}>{deleted ? <span className="italic opacity-70">Message removed</span> : attachment ? <div><div className="flex items-center gap-2 font-semibold">{message.kind === "image" ? <ImageIcon size={16} /> : <FileText size={16} />}<span className="truncate">{attachment.name}</span></div>{attachment.caption ? <p className="mt-2 opacity-90">{attachment.caption}</p> : null}<button type="button" onClick={() => void openAttachment(attachment.url)} className={`mt-3 inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold ${mine ? "bg-white/15 text-white" : "bg-surface-layer text-brand-700"}`}><Download size={14} /> Open resource</button></div> : message.body}</div>{!deleted ? <div className={`mt-1 flex gap-2 ${mine ? "justify-end" : ""}`}>{mine ? <button type="button" onClick={() => void removeMessage(message)} className="inline-flex items-center gap-1 text-2xs font-semibold text-text-muted hover:text-danger"><Trash2 size={12} /> Delete</button> : <button type="button" onClick={() => setReportTargetState({ type: "message", id: message.id, label: "message" })} className="inline-flex items-center gap-1 text-2xs font-semibold text-text-muted hover:text-danger"><Flag size={12} /> Report</button>}</div> : null}</div></article>;
                    })}</div> : <div className="flex min-h-[300px] flex-col items-center justify-center text-center"><MessageCircle size={28} className="text-brand-500" /><h3 className="mt-4 font-semibold">Start a useful conversation</h3><p className="mt-2 max-w-sm text-sm leading-6 text-text-secondary">Share progress, ask a focused question, or add a resource that helps the group move forward.</p></div>}
                  </div>
                  <form onSubmit={handleSend} className="border-t border-subtle bg-surface-layer p-3 sm:p-4"><div className="flex items-end gap-2"><input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp,application/pdf" className="sr-only" onChange={(event) => { const file = event.target.files?.[0]; if (file) void handleFile(file); }} /><button type="button" disabled={uploading || Boolean(group.archivedAt)} onClick={() => fileInputRef.current?.click()} aria-label="Attach image or PDF" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-subtle text-text-secondary transition hover:bg-surface-elevated disabled:opacity-50">{uploading ? <Loader2 size={18} className="animate-spin" /> : <Paperclip size={18} />}</button><label className="min-w-0 flex-1"><span className="sr-only">Message {group.name}</span><textarea aria-label={`Message ${group.name}`} value={composer} onChange={(event) => setComposer(event.target.value.slice(0, 4000))} rows={1} disabled={Boolean(group.archivedAt)} placeholder={group.archivedAt ? "This group is archived" : "Write a message"} className="max-h-36 min-h-11 w-full resize-none rounded-2xl border border-subtle bg-surface-body px-4 py-3 text-sm leading-5 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 disabled:opacity-60" /></label><button type="submit" aria-label="Send message" disabled={sending || !composer.trim() || Boolean(group.archivedAt)} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-brand-500 text-white transition hover:bg-brand-600 disabled:opacity-50">{sending ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}</button></div></form>
                </div>
                <aside className="space-y-4"><div className="rounded-[24px] border border-subtle bg-surface-layer p-5"><h2 className="text-sm font-semibold">Room guide</h2><div className="mt-3 space-y-3 text-sm leading-6 text-text-secondary"><p>Keep personal information private.</p><p>Share resources you trust and explain why they are useful.</p><p>Use report and block controls when something feels unsafe.</p></div></div><div className="rounded-[24px] border border-brand-500/15 bg-brand-500/5 p-5"><p className="text-xs font-semibold uppercase tracking-[0.15em] text-brand-700">Resources loaded</p><p className="mt-2 text-2xl font-semibold">{resources.length}</p><button type="button" onClick={() => setTab("resources")} className="mt-3 text-sm font-semibold text-brand-700">Browse shared files →</button></div></aside>
              </section>
            ) : null}

            {!contentLoading && tab === "resources" ? (
              <section className="mt-6"><div className="mb-4"><h2 className="text-xl font-semibold">Shared resources</h2><p className="mt-1 text-sm text-text-secondary">Images and PDFs shared by active group members.</p></div>{resources.length ? <><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{resources.map((resource) => <article key={resource.id} className="rounded-[24px] border border-subtle bg-surface-layer p-5 shadow-sm"><div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-brand-500/10 text-brand-600">{resource.kind === "image" ? <ImageIcon size={20} /> : <FileText size={20} />}</div><h3 className="mt-4 truncate text-sm font-semibold">{resource.attachment.name}</h3><p className="mt-1 text-xs text-text-muted">Shared by {resource.sender.displayName} · {formatDate(resource.createdAt)}</p><button type="button" onClick={() => void openAttachment(resource.attachment.url)} className="mt-4 inline-flex min-h-10 items-center gap-2 rounded-xl border border-subtle px-4 text-xs font-semibold"><Download size={14} /> Open resource</button></article>)}</div>{resourceCursor ? <div className="mt-5 flex justify-center"><button type="button" disabled={loadingOlderResources} onClick={() => void loadOlderResources()} className="inline-flex min-h-11 items-center gap-2 rounded-2xl border border-subtle bg-surface-layer px-5 text-sm font-semibold text-text-secondary transition hover:bg-surface-elevated disabled:opacity-60">{loadingOlderResources ? <Loader2 size={16} className="animate-spin" /> : null}Load more resources</button></div> : null}</> : <div className="rounded-[28px] border border-dashed border-subtle bg-surface-layer p-10 text-center"><FileText size={26} className="mx-auto text-brand-500" /><h3 className="mt-4 font-semibold">No resources yet</h3><p className="mt-2 text-sm text-text-secondary">Share a useful image or PDF from the Chat tab.</p></div>}</section>
            ) : null}

            {!contentLoading && tab === "members" ? (
              <section className="mt-6"><div className="mb-4"><h2 className="text-xl font-semibold">Members</h2><p className="mt-1 text-sm text-text-secondary">People with active access to this room.</p></div><div className="grid gap-3 lg:grid-cols-2">{members.map((member) => <article key={member.membership.id} className="flex items-center gap-3 rounded-[24px] border border-subtle bg-surface-layer p-4 shadow-sm"><span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-surface-elevated text-sm font-semibold">{initials(member.profile.displayName)}</span><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{member.profile.displayName}</p><p className="mt-1 text-xs capitalize text-text-muted">{member.membership.role}</p></div>{member.membership.userId !== userId ? <div className="flex gap-1"><Link to={`/app/community/messages?user=${encodeURIComponent(member.membership.userId)}`} className="inline-flex min-h-10 items-center rounded-xl border border-subtle px-3 text-xs font-semibold">Message</Link><button type="button" onClick={() => void handleBlock(member)} aria-label={`Block ${member.profile.displayName}`} className="flex h-10 w-10 items-center justify-center rounded-xl border border-subtle text-text-muted hover:text-danger"><Ban size={15} /></button></div> : <span className="rounded-full bg-brand-500/10 px-2.5 py-1 text-xs font-semibold text-brand-700">You</span>}</article>)}</div></section>
            ) : null}

            {!contentLoading && tab === "admin" && isAdmin ? <section className="mt-6"><AdminPanel detail={detail} members={members} onDetailChange={setDetail} onMembersChange={setMembers} onNotice={setNotice} /></section> : null}
          </>
        )}
      </div>

      <ReportDialog target={reportTargetState} busy={reportBusy} onClose={() => setReportTargetState(null)} onSubmit={(reason) => void submitReport(reason)} />
    </main>
  );
}
