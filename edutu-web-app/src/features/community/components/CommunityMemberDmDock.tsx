import { useMemo, useState } from "react";
import { useAuth } from "@clerk/clerk-react";
import { Link, useParams } from "react-router-dom";
import { Loader2, MessageCircle, X } from "lucide-react";
import { CommunityApi } from "../api";
import { buildCommunityDmHref } from "../membershipActions";
import type { CommunityMemberSummary } from "../types";

export default function CommunityMemberDmDock() {
  const { id = "" } = useParams<{ id: string }>();
  const { getToken, userId } = useAuth();
  const api = useMemo(() => new CommunityApi(getToken), [getToken]);
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [members, setMembers] = useState<CommunityMemberSummary[]>([]);
  const [error, setError] = useState<string | null>(null);

  const openDirectory = async () => {
    setOpen(true);
    if (loaded || loading || !id) return;
    setLoading(true);
    setError(null);
    try {
      const result = await api.getMembers(id, 100);
      setMembers(result.members);
      setLoaded(true);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Members could not be loaded right now.",
      );
    } finally {
      setLoading(false);
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
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(4.9rem+env(safe-area-inset-bottom))] z-[60] px-3 lg:bottom-6 lg:left-auto lg:right-6 lg:w-[340px] lg:px-0">
      {open ? (
        <section className="pointer-events-auto ml-auto max-h-[min(66dvh,520px)] w-full max-w-md overflow-hidden rounded-[24px] border border-[#f4dcc9] bg-white shadow-[0_24px_70px_-35px_rgba(74,23,13,.7)] dark:border-subtle dark:bg-surface-layer lg:max-w-none">
          <header className="flex items-center justify-between gap-3 border-b border-[#f4dcc9] px-4 py-3 dark:border-subtle">
            <div>
              <p className="text-sm font-extrabold text-[#4a170d] dark:text-text-primary">
                Message a member
              </p>
              <p className="mt-0.5 text-xs text-[#796f6b] dark:text-text-secondary">
                Private chats still require the recipient to accept your first message.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close member directory"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-[#796f6b] hover:bg-[#fff9f1] dark:text-text-secondary dark:hover:bg-surface-elevated"
            >
              <X size={18} />
            </button>
          </header>

          <div className="max-h-[420px] overflow-y-auto p-2">
            {loading ? (
              <div className="flex min-h-32 items-center justify-center gap-2 text-sm text-[#796f6b] dark:text-text-secondary">
                <Loader2 size={18} className="animate-spin text-[#f45b16]" />
                Loading members…
              </div>
            ) : error ? (
              <div className="p-4 text-sm leading-6 text-red-600 dark:text-red-300">
                {error}
                <button
                  type="button"
                  onClick={() => {
                    setLoaded(false);
                    void openDirectory();
                  }}
                  className="mt-3 block min-h-10 rounded-xl border border-red-200 px-3 text-xs font-bold dark:border-red-500/20"
                >
                  Try again
                </button>
              </div>
            ) : contacts.length === 0 ? (
              <div className="p-5 text-center text-sm leading-6 text-[#796f6b] dark:text-text-secondary">
                No other active members are available to message yet.
              </div>
            ) : (
              <div className="divide-y divide-[#f4dcc9] dark:divide-subtle">
                {contacts.map(({ member, href }) => (
                  <Link
                    key={member.membership.id}
                    to={href}
                    onClick={() => setOpen(false)}
                    className="flex min-h-14 items-center gap-3 rounded-xl px-2 py-2 transition hover:bg-[#fff9f1] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f45b16]/35 dark:hover:bg-surface-elevated"
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#fcead5] text-xs font-extrabold text-[#8f3f1b] dark:bg-surface-elevated dark:text-text-secondary">
                      {member.profile.displayName.slice(0, 1).toUpperCase()}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-bold text-[#4a170d] dark:text-text-primary">
                        {member.profile.displayName}
                      </span>
                      <span className="block text-xs capitalize text-[#8d7b74] dark:text-text-muted">
                        {member.membership.role === "mod"
                          ? "Moderator"
                          : member.membership.role}
                      </span>
                    </span>
                    <MessageCircle size={16} className="shrink-0 text-[#f45b16]" />
                  </Link>
                ))}
              </div>
            )}
          </div>
        </section>
      ) : (
        <button
          type="button"
          onClick={() => void openDirectory()}
          className="pointer-events-auto ml-auto flex min-h-12 items-center gap-2 rounded-2xl bg-[#4a170d] px-4 text-sm font-extrabold text-white shadow-[0_16px_38px_-22px_rgba(74,23,13,.9)] transition hover:-translate-y-0.5 dark:bg-brand dark:text-white"
        >
          <MessageCircle size={17} />
          Message member
        </button>
      )}
    </div>
  );
}
