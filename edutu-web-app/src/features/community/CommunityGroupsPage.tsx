import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useAuth } from "@clerk/clerk-react";
import { Link } from "react-router-dom";
import { CheckCircle2, Clock3, Plus, RefreshCw, X } from "lucide-react";
import Seo from "../../components/Seo";
import { CommunityApi, isCommunityApiError } from "./api";
import { declineCommunityInvitation } from "./membershipActions";
import type {
  CommunityCreationRequest,
  CommunityCreationSlots,
  GroupWithMembership,
} from "./types";
import CommunityProductShell from "./components/CommunityProductShell";
import CommunityState from "./components/CommunityState";
import GroupCard from "./components/GroupCard";
import CommunityActionSheet from "./components/CommunityActionSheet";

export default function CommunityGroupsPage() {
  const { getToken, userId } = useAuth();
  const api = useMemo(() => new CommunityApi(getToken), [getToken]);
  const [rows, setRows] = useState<GroupWithMembership[]>([]);
  const [creationRequests, setCreationRequests] = useState<
    CommunityCreationRequest[]
  >([]);
  const [creationSlots, setCreationSlots] = useState<CommunityCreationSlots>({
    used: 0,
    limit: 2,
  });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [decliningId, setDecliningId] = useState<string | null>(null);
  const [declineTarget, setDeclineTarget] =
    useState<GroupWithMembership | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [groups, proposals] = await Promise.all([
        api.listGroups({ mine: true, limit: 50 }),
        api.listMyCreationRequests(),
      ]);
      setRows(groups);
      setCreationRequests(proposals.requests);
      setCreationSlots(proposals.slots);
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
      setDeclineTarget(null);
    }
  };

  const active = rows.filter((row) => row.membership?.status === "active");
  const invited = rows.filter((row) => row.membership?.status === "invited");
  const pending = rows.filter((row) => row.membership?.status === "pending");

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
      >
        {loading ? (
          <CommunityState kind="loading" />
        ) : error && rows.length === 0 && creationRequests.length === 0 ? (
          <CommunityState
            kind="error"
            body={error}
            actionLabel="Try again"
            onAction={() => void load()}
          />
        ) : rows.length === 0 && creationRequests.length === 0 ? (
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
          <div className="space-y-9 pb-16">
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

            {creationRequests.length > 0 ? (
              <CreationRequestSection
                requests={creationRequests}
                slots={creationSlots}
              />
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
                      onClick={() => setDeclineTarget(row)}
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
                title="Joined"
                body="Open a room to catch up, share a resource or continue the conversation."
                rows={active}
              />
            ) : null}
          </div>
        )}
      </CommunityProductShell>
      <aside
        aria-label="Create a community"
        className="fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-30 border-t border-subtle bg-surface-layer"
      >
        <div className="mx-auto flex h-16 max-w-3xl items-center justify-between gap-4 px-4 sm:px-5">
          <p className="font-display text-base font-semibold tracking-[-0.015em] text-text-primary">
            Create community
          </p>
          <Link
            to="/app/community/groups/new"
            aria-label="Create community"
            className="inline-flex h-[3.25rem] w-[3.25rem] shrink-0 items-center justify-center rounded-full bg-brand text-white transition duration-200 hover:bg-brand-600 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/45 focus-visible:ring-offset-2 focus-visible:ring-offset-surface-layer"
          >
            <Plus size={25} strokeWidth={2.25} />
          </Link>
        </div>
      </aside>
      <CommunityActionSheet
        open={declineTarget !== null}
        title="Decline invitation"
        description={
          declineTarget
            ? `You will not join ${declineTarget.group.name}. You may need another invitation to return.`
            : "You may need another invitation to return."
        }
        confirmLabel="Decline"
        busy={decliningId !== null}
        onClose={() => setDeclineTarget(null)}
        onConfirm={() => {
          if (declineTarget) void declineInvitation(declineTarget);
        }}
      />
    </>
  );
}

function CreationRequestSection({
  requests,
  slots,
}: {
  requests: CommunityCreationRequest[];
  slots: CommunityCreationSlots;
}) {
  const statusCopy: Record<CommunityCreationRequest["status"], string> = {
    pending: "Pending admin review",
    approved: "Approved",
    rejected: "Changes needed",
    cancelled: "Cancelled",
  };

  return (
    <section aria-labelledby="community-proposals-heading">
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-[#f45b16] dark:text-brand">
            Community proposals
          </p>
          <h2
            id="community-proposals-heading"
            className="mt-1 font-display text-xl font-bold tracking-[-0.025em] text-[#17120f] dark:text-text-primary sm:text-2xl"
          >
            Under review
          </h2>
        </div>
        <span className="rounded-full bg-[#fff1e6] px-3 py-1.5 text-xs font-bold text-[#b63c0d] dark:bg-brand/10 dark:text-brand">
          {slots.used} of {slots.limit} creation slots used
        </span>
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {requests.map((request) => {
          const pending = request.status === "pending";
          const approved = request.status === "approved";
          const StatusIcon = approved ? CheckCircle2 : pending ? Clock3 : X;
          return (
            <article
              key={request.id}
              className="rounded-[22px] border border-[#ece8e5] bg-[#fffaf6] p-4 dark:border-subtle dark:bg-surface-layer"
            >
              <div className="flex items-start gap-3">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white text-[#f45b16] shadow-sm dark:bg-surface-elevated dark:text-brand">
                  <StatusIcon size={20} />
                </span>
                <div className="min-w-0 flex-1">
                  <h3 className="truncate font-display text-base font-bold text-[#17120f] dark:text-text-primary">
                    {request.name}
                  </h3>
                  <p className="mt-1 text-xs font-bold text-[#a54a20] dark:text-brand">
                    {statusCopy[request.status]}
                  </p>
                </div>
              </div>
              {request.status === "rejected" && request.rejectionReason ? (
                <p className="mt-3 rounded-xl bg-white px-3 py-2 text-xs leading-5 text-[#796f6b] dark:bg-surface-elevated dark:text-text-secondary">
                  {request.rejectionReason}
                </p>
              ) : null}
            </article>
          );
        })}
      </div>
    </section>
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
      <p className="hidden text-sm font-semibold text-[#f45b16] dark:text-brand sm:block">
        {eyebrow}
      </p>
      <div className="flex flex-col justify-between gap-2 sm:mt-1 sm:flex-row sm:items-end">
        <div>
          <h2 className="font-display text-xl font-bold tracking-[-0.025em] text-[#17120f] dark:text-text-primary sm:text-2xl sm:tracking-[-0.03em]">
            {title} {rows.length}
          </h2>
          <p className="mt-1 hidden max-w-2xl text-sm leading-6 text-[#6f6864] dark:text-text-secondary sm:block">
            {body}
          </p>
        </div>
        <span className="hidden text-sm font-semibold tabular-nums text-[#817a76] dark:text-text-muted sm:block">
          {rows.length}
        </span>
      </div>
      <ul
        aria-label={`${title} communities`}
        className="-mx-4 mt-3 flex list-none flex-col gap-1 sm:mx-0 sm:mt-4 sm:grid sm:grid-cols-2 sm:gap-3 lg:grid-cols-3"
      >
        {rows.map((row) => (
          <li key={row.group.id}>
            {renderCard ? renderCard(row) : <GroupCard row={row} />}
          </li>
        ))}
      </ul>
    </section>
  );
}
