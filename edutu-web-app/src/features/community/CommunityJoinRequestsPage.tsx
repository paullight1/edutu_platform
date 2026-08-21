import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@clerk/clerk-react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Check, Loader2, X } from "lucide-react";
import Seo from "../../components/Seo";
import { CommunityApi } from "./api";
import type { JoinRequest } from "./types";
import CommunityProductShell from "./components/CommunityProductShell";
import CommunityState from "./components/CommunityState";

export default function CommunityJoinRequestsPage() {
  const { id = "" } = useParams<{ id: string }>();
  const { getToken } = useAuth();
  const api = useMemo(() => new CommunityApi(getToken), [getToken]);
  const [requests, setRequests] = useState<JoinRequest[]>([]);
  const [groupName, setGroupName] = useState("Community");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [detail, pending] = await Promise.all([
        api.getGroup(id),
        api.listJoinRequests(id, "pending"),
      ]);
      setGroupName(detail.group.name);
      setRequests(pending);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Join requests could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [api, id]);

  useEffect(() => { void load(); }, [load]);

  const decide = async (request: JoinRequest, decision: "approved" | "rejected") => {
    if (busy) return;
    setBusy(request.id);
    setError(null);
    try {
      await api.decideJoinRequest(id, request.id, decision);
      setRequests((current) => current.filter((row) => row.id !== request.id));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "That request could not be updated.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <Seo
        title={`Join requests — ${groupName} | Edutu`}
        description="Review Edutu community join requests."
        path={`/app/community/groups/${id}/requests`}
        noindex
      />
      <CommunityProductShell
        title="Join requests"
        description={`Review people waiting to join ${groupName}.`}
        action={
          <Link to={`/app/community/groups/${id}?tab=about`} className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-[#f4dcc9] bg-white text-[#796f6b] dark:border-subtle dark:bg-surface-layer" aria-label="Back to group">
            <ArrowLeft size={18} />
          </Link>
        }
      >
        {error ? <div role="alert" className="mb-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-200">{error}</div> : null}
        {loading ? (
          <CommunityState kind="loading" />
        ) : requests.length === 0 ? (
          <CommunityState kind="empty" title="No requests waiting" body="When someone requests access, their answers will appear here for an owner or moderator to review." />
        ) : (
          <div className="space-y-3">
            {requests.map((request) => (
              <article key={request.id} className="rounded-[22px] border border-[#f4dcc9] bg-white p-4 shadow-sm dark:border-subtle dark:bg-surface-layer sm:p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-bold text-[#4a170d] dark:text-text-primary">Member request</p>
                    <p className="mt-1 text-xs text-[#796f6b] dark:text-text-secondary">Submitted {new Date(request.createdAt).toLocaleDateString()}</p>
                  </div>
                  <span className="rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-bold text-amber-700 dark:bg-amber-500/10 dark:text-amber-300">Pending</span>
                </div>
                {request.answers.length > 0 ? (
                  <dl className="mt-4 space-y-3 rounded-2xl bg-[#fff9f1] p-3 dark:bg-surface-elevated">
                    {request.answers.map((answer, index) => (
                      <div key={`${answer.id}-${index}`}>
                        <dt className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#9a8278] dark:text-text-muted">Answer {index + 1}</dt>
                        <dd className="mt-1 whitespace-pre-wrap text-sm leading-6 text-[#4a170d] dark:text-text-primary">{answer.value}</dd>
                      </div>
                    ))}
                  </dl>
                ) : <p className="mt-4 text-sm text-[#796f6b] dark:text-text-secondary">This group did not require screening answers.</p>}
                <div className="mt-4 flex gap-2 sm:justify-end">
                  <button type="button" disabled={busy === request.id} onClick={() => void decide(request, "rejected")} className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl border border-red-200 px-4 text-sm font-bold text-red-700 disabled:opacity-50 sm:flex-none"><X size={16} /> Decline</button>
                  <button type="button" disabled={busy === request.id} onClick={() => void decide(request, "approved")} className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-[#f45b16] px-4 text-sm font-bold text-white disabled:opacity-50 sm:flex-none">{busy === request.id ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />} Approve</button>
                </div>
              </article>
            ))}
          </div>
        )}
      </CommunityProductShell>
    </>
  );
}
