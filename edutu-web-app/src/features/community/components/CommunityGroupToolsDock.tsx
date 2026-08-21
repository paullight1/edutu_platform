import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@clerk/clerk-react";
import { Link, useParams } from "react-router-dom";
import {
  FileUp,
  Loader2,
  MessageCircle,
  Settings,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { CommunityApi } from "../api";
import {
  classifyCommunityAttachmentFile,
  sendCommunityAttachment,
} from "../attachmentWorkflow";
import { buildCommunityDmHref } from "../membershipActions";
import { canManageCommunityGroup } from "../settingsModel";
import type {
  CommunityMemberSummary,
  GroupDetail,
} from "../types";

type View = "menu" | "members" | "attachment";

export default function CommunityGroupToolsDock() {
  const { id = "" } = useParams<{ id: string }>();
  const { getToken, userId } = useAuth();
  const api = useMemo(() => new CommunityApi(getToken), [getToken]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [detail, setDetail] = useState<GroupDetail | null>(null);
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<View>("menu");
  const [members, setMembers] = useState<CommunityMemberSummary[]>([]);
  const [membersLoaded, setMembersLoaded] = useState(false);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [caption, setCaption] = useState("");
  const [sharing, setSharing] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    if (!id) return;
    void api
      .getGroup(id)
      .then((next) => {
        if (active) setDetail(next);
      })
      .catch(() => {
        if (active) setDetail(null);
      });
    return () => {
      active = false;
    };
  }, [api, id]);

  if (!detail) return null;
  const activeMember = detail.membership?.status === "active";
  const manager = canManageCommunityGroup(detail, userId);
  if (!activeMember && !manager) return null;

  const loadMembers = async () => {
    setView("members");
    if (membersLoaded || loadingMembers) return;
    setLoadingMembers(true);
    setError(null);
    try {
      const result = await api.getMembers(id, 100);
      setMembers(result.members);
      setMembersLoaded(true);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Members could not be loaded right now.",
      );
    } finally {
      setLoadingMembers(false);
    }
  };

  const chooseFile = (selected: File | null) => {
    if (!selected || !activeMember) return;
    try {
      classifyCommunityAttachmentFile(selected);
      setFile(selected);
      setCaption("");
      setError(null);
      setView("attachment");
      setOpen(true);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "That file cannot be shared.",
      );
      setOpen(true);
      setView("menu");
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const share = async () => {
    if (!file || sharing || !activeMember) return;
    setSharing(true);
    setError(null);
    setNotice(null);
    try {
      await sendCommunityAttachment(api, id, file, caption);
      setNotice("Resource shared. It will appear in Posts and Resources.");
      setFile(null);
      setCaption("");
      setView("menu");
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "That resource could not be shared.",
      );
    } finally {
      setSharing(false);
    }
  };

  const contacts = members
    .map((member) => ({
      member,
      href: buildCommunityDmHref(member, userId),
    }))
    .filter(
      (row): row is { member: CommunityMemberSummary; href: string } =>
        Boolean(row.href),
    );

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(4.85rem+env(safe-area-inset-bottom))] z-[60] px-3 lg:bottom-6 lg:left-auto lg:right-6 lg:w-[360px] lg:px-0">
      <input
        ref={fileInputRef}
        type="file"
        className="sr-only"
        accept=".jpg,.jpeg,.png,.webp,.pdf,image/jpeg,image/png,image/webp,application/pdf"
        onChange={(event) => chooseFile(event.target.files?.[0] ?? null)}
      />

      {open ? (
        <section className="pointer-events-auto ml-auto w-full max-w-md overflow-hidden rounded-[24px] border border-[#f4dcc9] bg-white shadow-[0_24px_70px_-35px_rgba(74,23,13,.7)] dark:border-subtle dark:bg-surface-layer lg:max-w-none">
          <header className="flex items-center justify-between gap-3 border-b border-[#f4dcc9] px-4 py-3 dark:border-subtle">
            <div>
              <p className="text-sm font-extrabold text-[#4a170d] dark:text-text-primary">
                {view === "members"
                  ? "Message a member"
                  : view === "attachment"
                    ? "Share a resource"
                    : "Community tools"}
              </p>
              <p className="mt-0.5 text-xs text-[#796f6b] dark:text-text-secondary">
                {view === "members"
                  ? "First DMs still require the recipient to accept."
                  : view === "attachment"
                    ? "Images up to 5 MB or PDF files up to 10 MB."
                    : "Useful actions for this room."}
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setView("menu");
                setError(null);
              }}
              aria-label="Close community tools"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-[#796f6b] hover:bg-[#fff9f1] dark:text-text-secondary dark:hover:bg-surface-elevated"
            >
              <X size={18} />
            </button>
          </header>

          <div className="max-h-[min(62dvh,440px)] overflow-y-auto p-3">
            {error ? (
              <p role="alert" className="mb-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold leading-5 text-red-700 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-200">
                {error}
              </p>
            ) : null}
            {notice ? (
              <p role="status" className="mb-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold leading-5 text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-200">
                {notice}
              </p>
            ) : null}

            {view === "menu" ? (
              <div className="grid gap-2">
                {activeMember ? (
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="flex min-h-14 items-center gap-3 rounded-2xl border border-[#f4dcc9] px-3 text-left transition hover:border-[#f45b16]/35 hover:bg-[#fff9f1] dark:border-subtle dark:hover:bg-surface-elevated"
                  >
                    <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#fcead5] text-[#f45b16] dark:bg-brand/10 dark:text-brand"><FileUp size={18} /></span>
                    <span><span className="block text-sm font-bold">Share resource</span><span className="mt-0.5 block text-xs text-[#796f6b] dark:text-text-secondary">Add an image or PDF to the room.</span></span>
                  </button>
                ) : null}
                {activeMember ? (
                  <button
                    type="button"
                    onClick={() => void loadMembers()}
                    className="flex min-h-14 items-center gap-3 rounded-2xl border border-[#f4dcc9] px-3 text-left transition hover:border-[#f45b16]/35 hover:bg-[#fff9f1] dark:border-subtle dark:hover:bg-surface-elevated"
                  >
                    <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#fcead5] text-[#f45b16] dark:bg-brand/10 dark:text-brand"><MessageCircle size={18} /></span>
                    <span><span className="block text-sm font-bold">Message member</span><span className="mt-0.5 block text-xs text-[#796f6b] dark:text-text-secondary">Start a private request from the active roster.</span></span>
                  </button>
                ) : null}
                {manager ? (
                  <Link
                    to={`/app/community/groups/${id}/settings`}
                    onClick={() => setOpen(false)}
                    className="flex min-h-14 items-center gap-3 rounded-2xl border border-[#f4dcc9] px-3 text-left transition hover:border-[#f45b16]/35 hover:bg-[#fff9f1] dark:border-subtle dark:hover:bg-surface-elevated"
                  >
                    <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#fcead5] text-[#f45b16] dark:bg-brand/10 dark:text-brand"><Settings size={18} /></span>
                    <span><span className="block text-sm font-bold">Group settings</span><span className="mt-0.5 block text-xs text-[#796f6b] dark:text-text-secondary">Edit access, screening and members.</span></span>
                  </Link>
                ) : null}
              </div>
            ) : null}

            {view === "members" ? (
              <div>
                <button type="button" onClick={() => setView("menu")} className="mb-2 min-h-9 rounded-lg px-2 text-xs font-bold text-[#f45b16]">← Back</button>
                {loadingMembers ? (
                  <div className="flex min-h-28 items-center justify-center gap-2 text-sm text-[#796f6b]"><Loader2 size={18} className="animate-spin text-[#f45b16]" /> Loading members…</div>
                ) : contacts.length === 0 ? (
                  <p className="p-4 text-center text-sm leading-6 text-[#796f6b] dark:text-text-secondary">No other active members are available to message yet.</p>
                ) : (
                  <div className="divide-y divide-[#f4dcc9] dark:divide-subtle">
                    {contacts.map(({ member, href }) => (
                      <Link key={member.membership.id} to={href} onClick={() => setOpen(false)} className="flex min-h-14 items-center gap-3 rounded-xl px-2 py-2 hover:bg-[#fff9f1] dark:hover:bg-surface-elevated">
                        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#fcead5] text-xs font-extrabold text-[#8f3f1b] dark:bg-surface-elevated">{member.profile.displayName.slice(0, 1).toUpperCase()}</span>
                        <span className="min-w-0 flex-1"><span className="block truncate text-sm font-bold">{member.profile.displayName}</span><span className="block text-xs capitalize text-[#8d7b74] dark:text-text-muted">{member.membership.role === "mod" ? "Moderator" : member.membership.role}</span></span>
                        <MessageCircle size={16} className="text-[#f45b16]" />
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            ) : null}

            {view === "attachment" && file ? (
              <div>
                <button type="button" disabled={sharing} onClick={() => { setView("menu"); setFile(null); setCaption(""); }} className="mb-2 min-h-9 rounded-lg px-2 text-xs font-bold text-[#f45b16] disabled:opacity-50">← Back</button>
                <div className="rounded-2xl bg-[#fff9f1] p-3 dark:bg-surface-elevated">
                  <p className="truncate text-sm font-bold">{file.name}</p>
                  <p className="mt-1 text-xs text-[#796f6b] dark:text-text-secondary">{Math.max(0.1, file.size / 1024 / 1024).toFixed(1)} MB</p>
                </div>
                <label className="mt-3 block">
                  <span className="mb-1.5 block text-xs font-bold">Caption <span className="font-normal text-[#9a8278]">optional</span></span>
                  <textarea value={caption} maxLength={500} onChange={(event) => setCaption(event.target.value)} rows={3} placeholder="What should members know about this file?" className="w-full resize-none rounded-xl border border-[#f4dcc9] bg-white px-3 py-2 text-sm outline-none focus:border-[#f45b16]/60 dark:border-subtle dark:bg-surface-body" />
                  <span className="mt-1 block text-right text-[11px] text-[#9a8278]">{caption.length}/500</span>
                </label>
                <button type="button" disabled={sharing} onClick={() => void share()} className="mt-3 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#f45b16] px-4 text-sm font-bold text-white disabled:opacity-60">
                  {sharing ? <Loader2 size={16} className="animate-spin" /> : <FileUp size={16} />}
                  {sharing ? "Sharing…" : "Share resource"}
                </button>
              </div>
            ) : null}
          </div>
        </section>
      ) : (
        <button
          type="button"
          onClick={() => {
            setOpen(true);
            setView("menu");
            setNotice(null);
            setError(null);
          }}
          className="pointer-events-auto ml-auto flex min-h-12 items-center gap-2 rounded-2xl bg-[#4a170d] px-4 text-sm font-extrabold text-white shadow-[0_16px_38px_-22px_rgba(74,23,13,.9)] transition hover:-translate-y-0.5 dark:bg-brand"
        >
          <SlidersHorizontal size={17} />
          Group tools
        </button>
      )}
    </div>
  );
}
