import { type ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@clerk/clerk-react";
import { Link } from "react-router-dom";
import { Plus, RefreshCw, X } from "lucide-react";
import Seo from "../../components/Seo";
import { CommunityApi, isCommunityApiError } from "./api";
import { declineCommunityInvitation } from "./membershipActions";
import type { GroupWithMembership } from "./types";
import CommunityProductShell from "./components/CommunityProductShell";
import CommunityState from "./components/CommunityState";
import GroupCard from "./components/GroupCard";

export default function CommunityGroupsPage() {
  const { getToken, userId } = useAuth();
  const api = useMemo(() => new CommunityApi(getToken), [getToken]);
  const [rows, setRows] = useState<GroupWithMembership[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [decliningId, setDecliningId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setRows(await api.listGroups({ mine: true, limit: 50 }));
    } catch (caught) {
      setError(
        isCommunityApiError(caught)
          ? caught.message
          : "We couldn't load your groups right now.",
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [api]);

  useEffect(() => {
    void load();
  }, [load]);

  const declineInvitation = async (row: GroupWithMembership) => {
    if (!userId || decliningId) return;
    if (
      !window.confirm(
        `Decline the invitation to ${row.group.name}? You can only return later if the group remains reachable or an owner invites you again.`,
      )
    ) {
      return;
    }

    setDecliningId(row.group.id);
    setError(null);
    try {
      await declineCommunityInvitation(api, row.group.id, userId);
      setRows((current) =>
        current.filter((item) => item.group.id !== row.group.id),
      );
    } catch (caught) {
      setError(
        isCommunityApiError(caught)
          ? caught.message
          : "That invitation could not be declined.",
      );
    } finally {
      setDecliningId(null);
    }
  };

  const active = rows.filter((row) => row.membership?.status === "active");
  const invited = rows.filter((row) => row.membership?.status === "invited");
  const pending = rows.filter((row) => row.membership?.status === "pending");

  const createAction = (
    <Link
      to="/app/community/groups/new"
      className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#f45b16] px-3.5 text-sm font-bold text-white shadow-sm transition hover:bg-[#d94b0f] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f45b16]/40"
    >
      <Plus size={17} />
      <span className="hidden sm:inline">Create community</span>
      <span className="sm:hidden">Create</span>
    </Link>
  );

  return (
    <>
      <Seo
        title="Your communities | Edutu"
        description="Your joined Edutu communities, invitations and pending requests."
        path="/app/community/groups"
        noindex
      />
      <CommunityProductShell
        title="Your groups"
        description="Rooms you are in, invitations waiting for you, and communities awaiting approval."
        action={createAction}
      >
        {loading ? (
          <CommunityState kind="loading" />
        ) : error && rows.length === 0 ? (
          <CommunityState
            kind="error"
            body={error}
            actionLabel="Try again"
            onAction={() => void load()}
          />
        ) : rows.length === 0 ? (
          <CommunityState
            kind="empty"
            title="You have not joined a community yet"
            body="Explore communities around scholarships, applications and career goals — or create one for people working toward the same next step."
            actionLabel="Explore communities"
            onAction={() => {
              window.location.assign("/app/community/explore");
            }}
          />
        ) : (
          <div className="space-y-8">
            {error ? (
              <div
                role="status"
                className="flex items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-200"
              >
                <span>{error}</span>
                <button
                  type="button"
                  onClick={() => {
                    setRefreshing(true);
                    void load();
                  }}
                  className="inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-xl px-3 font-bold"
                >
                  <RefreshCw
                    size={15}
                    className={refreshing ? "animate-spin" : ""}
                  />{" "}
                  Retry
                </button>
              </div>
            ) : null}

            {invited.length > 0 ? (
              <GroupSection
                eyebrow="Needs your answer"
                title="Invitations"
                body="An owner invited you. Preview the room, accept it there, or decline the invitation without joining."
                rows={invited}
                renderCard={(row) => (
                  <div className="space-y-2">
                    <GroupCard row={row} />
                    <button
                      type="button"
                      disabled={decliningId === row.group.id}
                      onClick={() => void declineInvitation(row)}
                      className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-xl border border-[#f4dcc9] bg-white px-3 text-xs font-bold text-[#796f6b] transition hover:border-red-200 hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-60 dark:border-subtle dark:bg-surface-layer dark:text-text-secondary dark:hover:bg-red-500/10 dark:hover:text-red-300"
                    >
                      <X size={14} />
                      {decliningId === row.group.id
                        ? "Declining…"
                        : "Decline invitation"}
                    </button>
                  </div>
                )}
              />
            ) : null}

            {pending.length > 0 ? (
              <GroupSection
                eyebrow="Waiting"
                title="Awaiting approval"
                body="You asked to join these communities. Their owners still need to review your request."
                rows={pending}
              />
            ) : null}

            {active.length > 0 ? (
              <GroupSection
                eyebrow="Your rooms"
                title="Joined communities"
                body="Open a room to catch up, share a resource or continue the conversation."
                rows={active}
              />
            ) : null}
          </div>
        )}
      </CommunityProductShell>
    </>
  );
}

function GroupSection({
  eyebrow,
  title,
  body,
  rows,
  renderCard,
}: {
  eyebrow: string;
  title: string;
  body: string;
  rows: GroupWithMembership[];
  renderCard?: (row: GroupWithMembership) => ReactNode;
}) {
  return (
    <section>
      <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#f45b16] dark:text-brand">
        {eyebrow}
      </p>
      <div className="mt-1 flex flex-col justify-between gap-2 sm:flex-row sm:items-end">
        <div>
          <h2 className="font-display text-xl font-semibold tracking-[-0.02em] text-[#4a170d] dark:text-text-primary">
            {title}
          </h2>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-[#796f6b] dark:text-text-secondary">
            {body}
          </p>
        </div>
        <span className="text-xs font-bold text-[#9a8278] dark:text-text-muted">
          {rows.length}
        </span>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {rows.map((row) => (
          <div key={row.group.id}>
            {renderCard ? renderCard(row) : <GroupCard row={row} />}
          </div>
        ))}
      </div>
    </section>
  );
}
