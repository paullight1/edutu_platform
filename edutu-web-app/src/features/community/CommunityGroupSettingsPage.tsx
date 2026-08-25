import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@clerk/clerk-react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  Archive,
  Camera,
  Check,
  ChevronLeft,
  Loader2,
  Plus,
  Save,
  Trash2,
  UserMinus,
  UserPlus,
  X,
} from "lucide-react";
import Seo from "../../components/Seo";
import { CommunityApi, uploadCommunityAttachment } from "./api";
import { classifyCommunityAttachmentFile } from "./attachmentWorkflow";
import { removeLocalBlockedAuthor } from "./blockState";
import CommunityProductShell from "./components/CommunityProductShell";
import CommunityState from "./components/CommunityState";
import {
  buildGroupSettingsSubmission,
  canManageCommunityGroup,
  type GroupSettingsQuestionDraft,
} from "./settingsModel";
import type {
  BlockedUser,
  CommunityMemberSummary,
  GroupDetail,
  GroupJoinPolicy,
  GroupVisibility,
  MemberRole,
} from "./types";

const COVER_EMOJIS = ["💬", "🎓", "🚀", "💼", "📚", "🌍", "🏆", "🤝"];

export default function CommunityGroupSettingsPage() {
  const { id = "" } = useParams<{ id: string }>();
  const { getToken, userId } = useAuth();
  const api = useMemo(() => new CommunityApi(getToken), [getToken]);
  const navigate = useNavigate();
  const [detail, setDetail] = useState<GroupDetail | null>(null);
  const [members, setMembers] = useState<CommunityMemberSummary[]>([]);
  const [blocks, setBlocks] = useState<BlockedUser[]>([]);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [visibility, setVisibility] = useState<GroupVisibility>("public");
  const [joinPolicy, setJoinPolicy] = useState<GroupJoinPolicy>("open");
  const [coverEmoji, setCoverEmoji] = useState("💬");
  const [questions, setQuestions] = useState<GroupSettingsQuestionDraft[]>([]);
  const [inviteUserId, setInviteUserId] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [working, setWorking] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    if (!id) return;
    void (async () => {
      try {
        const next = await api.getGroup(id);
        if (!active) return;
        setDetail(next);
        setName(next.group.name);
        setDescription(next.group.description ?? "");
        setVisibility(next.group.visibility);
        setJoinPolicy(next.group.joinPolicy);
        setCoverEmoji(next.group.coverEmoji);
        if (!canManageCommunityGroup(next, userId)) return;

        const [formResult, memberResult, blockResult] = await Promise.allSettled([
          api.getForm(id),
          api.getMembers(id, 100),
          api.listBlocks(),
        ]);
        if (!active) return;
        if (formResult.status === "fulfilled") {
          setQuestions(
            formResult.value.questions.map((question) => ({
              id: question.id,
              type: question.type,
              label: question.label,
              required: question.required,
              ...(question.type === "single_select"
                ? { options: question.options }
                : {}),
            })),
          );
        }
        if (memberResult.status === "fulfilled") {
          setMembers(memberResult.value.members);
        }
        if (blockResult.status === "fulfilled") {
          setBlocks(blockResult.value);
        }
      } catch (caught) {
        if (active) {
          setError(
            caught instanceof Error
              ? caught.message
              : "Community settings could not be loaded.",
          );
        }
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [api, id, userId]);

  if (loading) {
    return (
      <CommunityProductShell title="Community settings">
        <CommunityState kind="loading" />
      </CommunityProductShell>
    );
  }

  if (!detail) {
    return (
      <CommunityProductShell title="Community settings">
        <CommunityState
          kind="error"
          body={error || "This community could not be opened."}
          actionLabel="Back to groups"
          onAction={() => navigate("/app/community/groups")}
        />
      </CommunityProductShell>
    );
  }

  if (!canManageCommunityGroup(detail, userId)) {
    return (
      <CommunityProductShell title="Community settings">
        <CommunityState
          kind="error"
          title="Settings are for owners and moderators"
          body="You need an active owner or moderator role to manage this community."
          actionLabel="Back to community"
          onAction={() => navigate(`/app/community/groups/${id}`)}
        />
      </CommunityProductShell>
    );
  }

  const group = detail.group;
  const actorRole = detail.membership?.role ?? "member";
  const isOwner = actorRole === "owner";

  const save = async () => {
    if (saving) return;
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const submission = buildGroupSettingsSubmission({
        name,
        description,
        visibility,
        joinPolicy,
        coverEmoji,
        questions,
      });
      const updated = await api.updateGroup(id, submission.patch);
      if (submission.form) {
        await api.setForm(id, submission.form);
      }
      setDetail((current) =>
        current ? { ...current, group: updated } : current,
      );
      setNotice("Community settings saved.");
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Settings could not be saved.",
      );
    } finally {
      setSaving(false);
    }
  };

  const uploadCover = async (file: File | null) => {
    if (!file) return;
    setWorking("cover");
    setError(null);
    setNotice(null);
    try {
      const classification = classifyCommunityAttachmentFile(file);
      if (classification.kind !== "image") {
        throw new Error("Community cover photos must be JPEG, PNG, or WebP images up to 5 MB.");
      }
      const reservation = await api.createGroupCoverImageUpload(id, {
        kind: "image",
        name: file.name.trim(),
        mime: classification.mime,
        size: file.size,
      });
      await uploadCommunityAttachment(reservation.uploadUrl, file);
      const updated = await api.updateGroup(id, {
        coverImageResourceUrl: reservation.resourceUrl,
      });
      setDetail((current) =>
        current ? { ...current, group: updated } : current,
      );
      setNotice("Cover photo updated securely.");
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Cover photo could not be updated.",
      );
    } finally {
      setWorking(null);
    }
  };

  const invite = async () => {
    const target = inviteUserId.trim();
    if (!target || working) return;
    setWorking("invite");
    setError(null);
    try {
      await api.invite(id, target);
      setInviteUserId("");
      setNotice("Invitation sent.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Invitation failed.");
    } finally {
      setWorking(null);
    }
  };

  const changeRole = async (
    member: CommunityMemberSummary,
    role: MemberRole,
  ) => {
    setWorking(`role:${member.membership.userId}`);
    setError(null);
    try {
      const updated = await api.setMemberRole(
        id,
        member.membership.userId,
        role,
      );
      setMembers((current) =>
        current.map((row) =>
          row.membership.userId === updated.userId
            ? { ...row, membership: updated }
            : row,
        ),
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Role could not be changed.");
    } finally {
      setWorking(null);
    }
  };

  const removeMember = async (member: CommunityMemberSummary) => {
    if (
      !window.confirm(
        `Remove ${member.profile.displayName} from this community?`,
      )
    ) {
      return;
    }
    setWorking(`remove:${member.membership.userId}`);
    setError(null);
    try {
      await api.removeMember(id, member.membership.userId);
      setMembers((current) =>
        current.filter(
          (row) => row.membership.userId !== member.membership.userId,
        ),
      );
      setDetail((current) =>
        current
          ? {
              ...current,
              group: {
                ...current.group,
                memberCount: Math.max(0, current.group.memberCount - 1),
              },
            }
          : current,
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Member could not be removed.");
    } finally {
      setWorking(null);
    }
  };

  const archive = async () => {
    if (
      !window.confirm(
        "Archive this community permanently? This cannot be undone and makes the room read-only.",
      )
    ) {
      return;
    }
    setWorking("archive");
    setError(null);
    try {
      await api.archiveGroup(id);
      navigate("/app/community/groups", { replace: true });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Community could not be archived.");
    } finally {
      setWorking(null);
    }
  };

  return (
    <>
      <Seo
        title={`Manage ${group.name} | Edutu Community`}
        description="Manage community access, screening, members and moderation."
        path={`/app/community/groups/${id}/settings`}
        noindex
      />
      <CommunityProductShell
        title="Community settings"
        description="Control who can enter, what new members answer, and who can manage this room."
        action={
          <Link
            to={`/app/community/groups/${id}`}
            className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-[#f4dcc9] bg-white px-3 text-sm font-bold text-[#6b4538] dark:border-subtle dark:bg-surface-layer dark:text-text-secondary"
          >
            <ChevronLeft size={16} className="rtl:rotate-180" /> Back
          </Link>
        }
      >
        <div className="mx-auto max-w-4xl space-y-5">
          {error ? <Alert kind="error">{error}</Alert> : null}
          {notice ? <Alert kind="success">{notice}</Alert> : null}

          <SettingsSection
            title="Identity"
            description="Keep the name and description specific enough that people know exactly what this room is for."
          >
            <div className="grid gap-4 sm:grid-cols-[110px_minmax(0,1fr)]">
              <div>
                <p className="mb-2 text-xs font-bold text-[#6b4538] dark:text-text-secondary">Cover</p>
                <div className="grid grid-cols-4 gap-1.5">
                  {COVER_EMOJIS.map((emoji) => (
                    <button
                      key={emoji}
                      type="button"
                      onClick={() => setCoverEmoji(emoji)}
                      aria-pressed={coverEmoji === emoji}
                      className={`flex h-11 items-center justify-center rounded-xl border text-lg ${
                        coverEmoji === emoji
                          ? "border-[#f45b16] bg-[#fcead5]"
                          : "border-[#f4dcc9] bg-white dark:border-subtle dark:bg-surface-body"
                      }`}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
                <label className="mt-2 flex min-h-10 cursor-pointer items-center justify-center gap-1.5 rounded-xl border border-[#f4dcc9] bg-white px-2 text-xs font-bold text-[#796f6b] dark:border-subtle dark:bg-surface-body">
                  {working === "cover" ? <Loader2 size={14} className="animate-spin" /> : <Camera size={14} />}
                  Photo
                  <input
                    type="file"
                    className="sr-only"
                    accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
                    disabled={working === "cover"}
                    onChange={(event) => void uploadCover(event.target.files?.[0] ?? null)}
                  />
                </label>
              </div>
              <div className="space-y-4">
                <Field label="Community name" hint={`${name.trim().length}/60`}>
                  <input value={name} maxLength={60} onChange={(event) => setName(event.target.value)} className="community-input" />
                </Field>
                <Field label="Description" hint={`${description.length}/280`}>
                  <textarea value={description} maxLength={280} rows={4} onChange={(event) => setDescription(event.target.value)} className="community-input resize-none" />
                </Field>
                {group.opportunityId ? (
                  <p className="rounded-xl bg-[#fff9f1] px-3 py-2 text-xs leading-5 text-[#796f6b] dark:bg-surface-elevated dark:text-text-secondary">
                    This community is linked to opportunity <strong>{group.opportunityId}</strong>. The link is fixed after creation so history cannot silently move to a different opportunity.
                  </p>
                ) : null}
              </div>
            </div>
          </SettingsSection>

          <SettingsSection
            title="Access"
            description="Visibility and joining are separate. A private room is invitation-only even if its join policy says open."
          >
            <ChoiceRow
              label="Visibility"
              value={visibility}
              onChange={(value) => setVisibility(value as GroupVisibility)}
              options={[
                { value: "public", label: "Public", body: "Discoverable to signed-in members." },
                { value: "private", label: "Private", body: "Only active members and invitees can open it." },
              ]}
            />
            <div className="mt-4">
              <ChoiceRow
                label="Joining"
                value={joinPolicy}
                onChange={(value) => setJoinPolicy(value as GroupJoinPolicy)}
                options={[
                  { value: "open", label: "Open", body: "Visible users join immediately." },
                  { value: "request", label: "Approval required", body: "Applicants wait for an owner/mod decision." },
                ]}
              />
            </div>
          </SettingsSection>

          <SettingsSection
            title="Screening questions"
            description="Used only when approval is required. Keep it short: at most five questions."
            action={
              joinPolicy === "request" && questions.length < 5 ? (
                <button type="button" onClick={() => setQuestions((current) => [...current, newQuestion(current.length)])} className="inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-[#fcead5] px-3 text-xs font-bold text-[#d94b0f] dark:bg-brand/10 dark:text-brand">
                  <Plus size={14} /> Add question
                </button>
              ) : null
            }
          >
            {joinPolicy !== "request" ? (
              <p className="text-sm leading-6 text-[#796f6b] dark:text-text-secondary">Questions are dormant while joining is open. Switching back to approval-required keeps the form available for editing.</p>
            ) : questions.length === 0 ? (
              <p className="text-sm leading-6 text-[#796f6b] dark:text-text-secondary">No screening questions. Applicants will still enter the pending queue for review.</p>
            ) : (
              <div className="space-y-3">
                {questions.map((question, index) => (
                  <QuestionEditor
                    key={`${question.id}:${index}`}
                    question={question}
                    index={index}
                    onChange={(next) => setQuestions((current) => current.map((row, rowIndex) => rowIndex === index ? next : row))}
                    onRemove={() => setQuestions((current) => current.filter((_, rowIndex) => rowIndex !== index))}
                  />
                ))}
              </div>
            )}
          </SettingsSection>

          <SettingsSection
            title="Members and invitations"
            description="Owners can change roles. Moderators can remove members; the backend still enforces owner/mod boundaries."
            action={
              <Link to={`/app/community/groups/${id}/requests`} className="inline-flex min-h-10 items-center rounded-xl border border-[#f4dcc9] px-3 text-xs font-bold dark:border-subtle">Review requests</Link>
            }
          >
            <div className="mb-4 flex gap-2">
              <input value={inviteUserId} onChange={(event) => setInviteUserId(event.target.value)} placeholder="Edutu user ID (user_…)" className="community-input min-w-0 flex-1" />
              <button type="button" disabled={!inviteUserId.trim() || working === "invite"} onClick={() => void invite()} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#f45b16] text-white disabled:opacity-50" aria-label="Invite member">
                {working === "invite" ? <Loader2 size={16} className="animate-spin" /> : <UserPlus size={16} />}
              </button>
            </div>
            <div className="divide-y divide-[#f4dcc9] dark:divide-subtle">
              {members.map((member) => {
                const creator = member.membership.userId === group.ownerId;
                const self = member.membership.userId === userId;
                const canRemove = !creator && !self && (isOwner || member.membership.role === "member");
                return (
                  <div key={member.membership.id} className="flex min-h-16 items-center gap-3 py-2">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#fcead5] text-xs font-extrabold text-[#8f3f1b] dark:bg-surface-elevated">{member.profile.displayName.slice(0, 1).toUpperCase()}</span>
                    <div className="min-w-0 flex-1"><p className="truncate text-sm font-bold">{member.profile.displayName}{self ? " (you)" : ""}</p><p className="text-xs text-[#8d7b74] dark:text-text-muted">{creator ? "Creator · owner" : member.membership.role === "mod" ? "Moderator" : member.membership.role}</p></div>
                    {isOwner && !creator && !self ? (
                      <select value={member.membership.role} disabled={working === `role:${member.membership.userId}`} onChange={(event) => void changeRole(member, event.target.value as MemberRole)} className="h-10 rounded-xl border border-[#f4dcc9] bg-white px-2 text-xs font-bold dark:border-subtle dark:bg-surface-body">
                        <option value="member">Member</option>
                        <option value="mod">Moderator</option>
                        <option value="owner">Owner</option>
                      </select>
                    ) : null}
                    {canRemove ? (
                      <button type="button" disabled={working === `remove:${member.membership.userId}`} onClick={() => void removeMember(member)} aria-label={`Remove ${member.profile.displayName}`} className="flex h-10 w-10 items-center justify-center rounded-xl text-[#a18c83] hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-500/10"><UserMinus size={16} /></button>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </SettingsSection>

          <SettingsSection
            title="Blocked members"
            description="Blocks apply across Community and other shared social surfaces. Unblocking is reversible and also restores Realtime visibility on this browser."
          >
            {blocks.length === 0 ? (
              <p className="text-sm text-[#796f6b] dark:text-text-secondary">You have not blocked anyone.</p>
            ) : (
              <div className="divide-y divide-[#f4dcc9] dark:divide-subtle">
                {blocks.map((blocked) => (
                  <div key={blocked.userId} className="flex min-h-14 items-center gap-3 py-2">
                    <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#fcead5] text-xs font-extrabold text-[#8f3f1b] dark:bg-surface-elevated">{blocked.displayName.slice(0, 1).toUpperCase()}</span>
                    <div className="min-w-0 flex-1"><p className="truncate text-sm font-bold">{blocked.displayName}</p><p className="truncate text-xs text-[#8d7b74] dark:text-text-muted">{blocked.userId}</p></div>
                    <button type="button" disabled={working === `unblock:${blocked.userId}`} onClick={async () => {
                      setWorking(`unblock:${blocked.userId}`);
                      setError(null);
                      try {
                        await api.unblockUser(blocked.userId);
                        removeLocalBlockedAuthor(blocked.userId);
                        setBlocks((current) => current.filter((row) => row.userId !== blocked.userId));
                      } catch (caught) {
                        setError(caught instanceof Error ? caught.message : "That member could not be unblocked.");
                      } finally {
                        setWorking(null);
                      }
                    }} className="min-h-10 rounded-xl border border-[#f4dcc9] px-3 text-xs font-bold text-[#6b4538] dark:border-subtle dark:text-text-secondary">Unblock</button>
                  </div>
                ))}
              </div>
            )}
          </SettingsSection>

          <div className="sticky bottom-[calc(4.6rem+env(safe-area-inset-bottom))] z-20 flex items-center justify-between gap-3 rounded-[20px] border border-[#f4dcc9] bg-white/95 p-3 shadow-lg backdrop-blur dark:border-subtle dark:bg-surface-layer/95 lg:bottom-4">
            <p className="hidden text-xs leading-5 text-[#796f6b] dark:text-text-secondary sm:block">Changes to access and screening take effect after you save.</p>
            <button type="button" disabled={saving} onClick={() => void save()} className="ms-auto inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#f45b16] px-5 text-sm font-bold text-white disabled:opacity-60">
              {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
              {saving ? "Saving…" : "Save settings"}
            </button>
          </div>

          {isOwner ? (
            <section className="rounded-[24px] border border-red-200 bg-red-50 p-5 dark:border-red-500/20 dark:bg-red-500/10">
              <div className="flex items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300"><Archive size={18} /></span>
                <div className="min-w-0 flex-1"><h2 className="text-sm font-extrabold text-red-900 dark:text-red-200">Archive permanently</h2><p className="mt-1 text-xs leading-5 text-red-700 dark:text-red-300">Archiving is irreversible. The room becomes read-only and frees one of your active group slots.</p></div>
              </div>
              <button type="button" disabled={working === "archive"} onClick={() => void archive()} className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-xl bg-red-700 px-4 text-sm font-bold text-white disabled:opacity-60"><Trash2 size={15} /> Archive community</button>
            </section>
          ) : null}
        </div>
      </CommunityProductShell>
    </>
  );
}

function SettingsSection({
  title,
  description,
  action,
  children,
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-[24px] border border-[#f4dcc9] bg-white p-5 shadow-sm dark:border-subtle dark:bg-surface-layer sm:p-6">
      <div className="mb-5 flex items-start justify-between gap-3">
        <div><h2 className="font-display text-xl font-semibold tracking-[-0.02em]">{title}</h2><p className="mt-1 max-w-2xl text-sm leading-6 text-[#796f6b] dark:text-text-secondary">{description}</p></div>
        {action}
      </div>
      {children}
    </section>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return <label className="block"><span className="mb-1.5 flex items-center justify-between gap-2 text-xs font-bold"><span>{label}</span>{hint ? <span className="font-normal text-[#9a8278]">{hint}</span> : null}</span>{children}</label>;
}

function ChoiceRow({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: Array<{ value: string; label: string; body: string }> }) {
  return <fieldset><legend className="mb-2 text-xs font-bold">{label}</legend><div className="grid gap-2 sm:grid-cols-2">{options.map((option) => <button key={option.value} type="button" onClick={() => onChange(option.value)} aria-pressed={value === option.value} className={`rounded-2xl border p-3 text-start ${value === option.value ? "border-[#f45b16] bg-[#fff4e9] dark:bg-brand/10" : "border-[#f4dcc9] bg-white dark:border-subtle dark:bg-surface-body"}`}><span className="flex items-center gap-2 text-sm font-bold">{value === option.value ? <Check size={15} className="text-[#f45b16]" /> : null}{option.label}</span><span className="mt-1 block text-xs leading-5 text-[#796f6b] dark:text-text-secondary">{option.body}</span></button>)}</div></fieldset>;
}

function QuestionEditor({ question, index, onChange, onRemove }: { question: GroupSettingsQuestionDraft; index: number; onChange: (question: GroupSettingsQuestionDraft) => void; onRemove: () => void }) {
  const setType = (type: GroupSettingsQuestionDraft["type"]) => {
    onChange({
      id: question.id,
      label: question.label,
      required: question.required,
      type,
      ...(type === "single_select"
        ? { options: question.options?.length ? question.options : ["Option 1", "Option 2"] }
        : {}),
    });
  };
  return (
    <div className="rounded-2xl border border-[#f4dcc9] bg-[#fffdf9] p-4 dark:border-subtle dark:bg-surface-body">
      <div className="flex items-start justify-between gap-3"><p className="text-xs font-extrabold uppercase tracking-[0.12em] text-[#9a8278]">Question {index + 1}</p><button type="button" onClick={onRemove} aria-label={`Remove question ${index + 1}`} className="flex h-9 w-9 items-center justify-center rounded-xl text-[#a18c83] hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-500/10"><X size={15} /></button></div>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <Field label="Label"><input value={question.label} maxLength={60} onChange={(event) => onChange({ ...question, label: event.target.value })} className="community-input" /></Field>
        <Field label="Type"><select value={question.type} onChange={(event) => setType(event.target.value as GroupSettingsQuestionDraft["type"])} className="community-input"><option value="short_text">Short text</option><option value="long_text">Long text</option><option value="single_select">Single select</option></select></Field>
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
        <Field label="Question ID"><input value={question.id} maxLength={40} onChange={(event) => onChange({ ...question, id: event.target.value.replace(/\s+/g, "-").toLowerCase() })} className="community-input" /></Field>
        <label className="flex min-h-11 items-center gap-2 rounded-xl border border-[#f4dcc9] px-3 text-xs font-bold dark:border-subtle"><input type="checkbox" checked={question.required} onChange={(event) => onChange({ ...question, required: event.target.checked })} /> Required</label>
      </div>
      {question.type === "single_select" ? (
        <Field label="Options (one per line)" hint="2–6 options"><textarea value={(question.options ?? []).join("\n")} rows={4} onChange={(event) => onChange({ ...question, options: event.target.value.split("\n") })} className="community-input mt-3 resize-none" /></Field>
      ) : null}
    </div>
  );
}

function newQuestion(index: number): GroupSettingsQuestionDraft {
  return {
    id: `question-${index + 1}`,
    type: "short_text",
    label: "",
    required: false,
  };
}

function Alert({ kind, children }: { kind: "error" | "success"; children: React.ReactNode }) {
  const success = kind === "success";
  return <div role={success ? "status" : "alert"} className={`rounded-2xl border px-4 py-3 text-sm font-semibold ${success ? "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-200" : "border-red-200 bg-red-50 text-red-700 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-200"}`}>{children}</div>;
}
