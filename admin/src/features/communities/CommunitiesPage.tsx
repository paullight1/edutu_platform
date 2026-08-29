import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";
import {
  Archive,
  ArrowDown,
  ArrowUp,
  Check,
  Clock3,
  Globe2,
  Loader2,
  Lock,
  MessageSquareText,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  ShieldCheck,
  Sparkles,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import { ConfirmDialog } from "../../components/ui/ConfirmDialog";
import {
  approveCreationRequest,
  archiveCommunity,
  createPlatformCommunity,
  listCommunityGroups,
  listCreationRequests,
  listTrendingCommunities,
  rejectCreationRequest,
  replaceTrendingCommunities,
  restoreCommunity,
  updateCommunity,
} from "./api";
import type {
  AdminCommunityCreationRequest,
  AdminCommunityGroup,
  CommunityManagementSummary,
  CommunityProposalInput,
} from "./model";
import "./CommunitiesPage.css";

type Tab = "catalog" | "requests" | "trending";
type Notice = { tone: "success" | "error"; message: string } | null;
type ConfirmTarget = { group: AdminCommunityGroup; action: "archive" | "restore" } | null;

const emptySummary: CommunityManagementSummary = {
  active: 0,
  pending: 0,
  trending: 0,
  creatorsAtLimit: 0,
};

const defaultProposal: CommunityProposalInput = {
  name: "",
  description: "",
  visibility: "public",
  joinPolicy: "open",
  coverEmoji: "💬",
};

const summaryMetrics: Array<{
  label: string;
  value: keyof CommunityManagementSummary;
  icon: LucideIcon;
}> = [
  { label: "Active communities", value: "active", icon: MessageSquareText },
  { label: "Pending requests", value: "pending", icon: Clock3 },
  { label: "Trending now", value: "trending", icon: Sparkles },
  { label: "Creators at limit", value: "creatorsAtLimit", icon: Users },
];

function dateLabel(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown date";
  return new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}

function statusLabel(group: AdminCommunityGroup): string {
  return group.archivedAt ? "Archived" : "Active";
}

export default function CommunitiesPage() {
  const [tab, setTab] = useState<Tab>("catalog");
  const [groups, setGroups] = useState<AdminCommunityGroup[]>([]);
  const [requests, setRequests] = useState<AdminCommunityCreationRequest[]>([]);
  const [trending, setTrending] = useState<AdminCommunityGroup[]>([]);
  const [summary, setSummary] = useState(emptySummary);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"all" | "active" | "archived">("all");
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [proposal, setProposal] = useState(defaultProposal);
  const [selected, setSelected] = useState<AdminCommunityGroup | null>(null);
  const [reviewing, setReviewing] =
    useState<AdminCommunityCreationRequest | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");
  const [confirmTarget, setConfirmTarget] = useState<ConfirmTarget>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [catalog, queue, curated] = await Promise.all([
        listCommunityGroups(),
        listCreationRequests("pending"),
        listTrendingCommunities(),
      ]);
      setGroups(catalog.groups);
      setSummary(catalog.summary);
      setRequests(queue.requests);
      setTrending(curated);
    } catch {
      setNotice({
        tone: "error",
        message: "Community operations could not be loaded. Try again.",
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const visibleGroups = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return groups.filter((group) => {
      const matchesStatus =
        status === "all" ||
        (status === "active" && !group.archivedAt) ||
        (status === "archived" && Boolean(group.archivedAt));
      const matchesQuery =
        !needle ||
        `${group.name} ${group.ownerId} ${group.description ?? ""}`
          .toLowerCase()
          .includes(needle);
      return matchesStatus && matchesQuery;
    });
  }, [groups, query, status]);

  const run = async (key: string, action: () => Promise<void>) => {
    if (busyKey) return;
    setBusyKey(key);
    setNotice(null);
    try {
      await action();
    } catch {
      setNotice({
        tone: "error",
        message: "That community action could not be completed. Refresh and try again.",
      });
    } finally {
      setBusyKey(null);
    }
  };

  const approve = (request: AdminCommunityCreationRequest) =>
    run(`approve:${request.id}`, async () => {
      await approveCreationRequest(request.id);
      setNotice({ tone: "success", message: `${request.name} was approved.` });
      setReviewing(null);
      await load();
    });

  const reject = (request: AdminCommunityCreationRequest) =>
    run(`reject:${request.id}`, async () => {
      const reason = rejectionReason.trim();
      if (reason.length < 8) {
        setNotice({
          tone: "error",
          message: "Give the creator a clear rejection reason of at least 8 characters.",
        });
        return;
      }
      await rejectCreationRequest(request.id, reason);
      setNotice({ tone: "success", message: `${request.name} was rejected.` });
      setReviewing(null);
      setRejectionReason("");
      await load();
    });

  const submitCreate = (event: FormEvent) => {
    event.preventDefault();
    void run("create", async () => {
      await createPlatformCommunity({
        ...proposal,
        name: proposal.name.trim(),
        description: proposal.description?.trim() || undefined,
      });
      setCreateOpen(false);
      setProposal(defaultProposal);
      setNotice({
        tone: "success",
        message: "Platform community published immediately.",
      });
      await load();
    });
  };

  const saveSelected = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selected) return;
    const data = new FormData(event.currentTarget);
    void run(`update:${selected.id}`, async () => {
      await updateCommunity(selected.id, {
        name: String(data.get("name") ?? "").trim(),
        description: String(data.get("description") ?? "").trim(),
        visibility: String(data.get("visibility")) as "public" | "private",
        joinPolicy: String(data.get("joinPolicy")) as "open" | "request",
        coverEmoji: String(data.get("coverEmoji") ?? "💬"),
      });
      setSelected(null);
      setNotice({ tone: "success", message: "Community details updated." });
      await load();
    });
  };

  const confirmLifecycle = async () => {
    if (!confirmTarget) return;
    const { group, action } = confirmTarget;
    await run(`${action}:${group.id}`, async () => {
      if (action === "archive") await archiveCommunity(group.id);
      else await restoreCommunity(group.id);
      setConfirmTarget(null);
      setSelected(null);
      setNotice({
        tone: "success",
        message: `${group.name} was ${action === "archive" ? "archived" : "restored"}.`,
      });
      await load();
    });
  };

  const persistTrending = async (next: AdminCommunityGroup[]) => {
    const previous = trending;
    setTrending(next);
    await run("trending", async () => {
      try {
        const saved = await replaceTrendingCommunities(next.map(({ id }) => id));
        setTrending(saved.length === next.length ? saved : next);
        setNotice({ tone: "success", message: "Trending order updated." });
      } catch (error) {
        setTrending(previous);
        throw error;
      }
    });
  };

  const moveTrending = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= trending.length) return;
    const next = [...trending];
    [next[index], next[target]] = [next[target], next[index]];
    void persistTrending(next);
  };

  const addTrending = (id: string) => {
    const group = groups.find((item) => item.id === id);
    if (!group || trending.some((item) => item.id === id)) return;
    void persistTrending([...trending, group]);
  };

  const eligible = groups.filter(
    (group) =>
      !group.archivedAt &&
      group.visibility === "public" &&
      !trending.some((item) => item.id === group.id),
  );

  return (
    <main className="communities-admin-page">
      <header className="communities-admin-header">
        <div>
          <span className="communities-admin-eyebrow">
            <ShieldCheck size={14} /> Community operations
          </span>
          <h1>Communities</h1>
          <p>
            Review new communities, protect creator limits, and shape what
            members discover first.
          </p>
        </div>
        <div className="communities-admin-header-actions">
          <button type="button" className="ghost" onClick={() => void load()} disabled={loading}>
            <RefreshCw size={16} className={loading ? "spin" : ""} /> Refresh
          </button>
          <button type="button" className="primary" onClick={() => setCreateOpen(true)}>
            <Plus size={17} /> Create community
          </button>
        </div>
      </header>

      <section className="communities-admin-summary" aria-label="Community summary">
        {summaryMetrics.map(({ label, value, icon: Icon }) => (
          <div key={label}>
            <Icon size={17} aria-hidden="true" />
            <strong>{summary[value]}</strong>
            <span>{label}</span>
          </div>
        ))}
      </section>

      <div className="communities-admin-tabs" role="tablist" aria-label="Community workspace">
        {[
          ["catalog", "All communities"],
          ["requests", "Creation requests"],
          ["trending", "Trending"],
        ].map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            className={tab === id ? "active" : ""}
            onClick={() => setTab(id as Tab)}
          >
            {label}
            {id === "requests" && summary.pending > 0 ? <span>{summary.pending}</span> : null}
          </button>
        ))}
      </div>

      {notice ? (
        <div role={notice.tone === "error" ? "alert" : "status"} className={`communities-admin-notice ${notice.tone}`}>
          {notice.message}
        </div>
      ) : null}

      {loading ? (
        <div className="communities-admin-state" role="status">
          <Loader2 className="spin" size={24} /> Loading community operations…
        </div>
      ) : tab === "catalog" ? (
        <section role="tabpanel" aria-label="All communities" className="communities-admin-panel">
          <div className="communities-admin-toolbar">
            <label className="communities-admin-search">
              <Search size={17} aria-hidden="true" />
              <span className="admin-visually-hidden">Search communities</span>
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by community or owner" />
            </label>
            <label>
              <span className="admin-visually-hidden">Community status</span>
              <select value={status} onChange={(event) => setStatus(event.target.value as typeof status)}>
                <option value="all">All statuses</option>
                <option value="active">Active</option>
                <option value="archived">Archived</option>
              </select>
            </label>
          </div>
          {visibleGroups.length ? (
            <div className="communities-admin-table-wrap">
              <table>
                <thead><tr><th>Community</th><th>Ownership</th><th>Access</th><th>Activity</th><th>Status</th><th><span className="admin-visually-hidden">Actions</span></th></tr></thead>
                <tbody>
                  {visibleGroups.map((group) => (
                    <tr key={group.id}>
                      <td><button className="community-identity" type="button" onClick={() => setSelected(group)}><span>{group.coverEmoji}</span><span><strong>{group.name}</strong><small>{group.ownerId}</small></span></button></td>
                      <td><span className={`scope-badge ${group.managementScope}`}>{group.managementScope === "platform" ? "Platform" : "Member"}</span></td>
                      <td>{group.visibility === "public" ? <span className="inline-meta"><Globe2 size={14} /> Public</span> : <span className="inline-meta"><Lock size={14} /> Private</span>}</td>
                      <td>{group.memberCount} members · {group.messageCount} posts</td>
                      <td><span className={`status-badge ${group.archivedAt ? "archived" : "active"}`}>{statusLabel(group)}</span>{group.trendingRank ? <small className="trending-rank">Trending #{group.trendingRank}</small> : null}</td>
                      <td><button type="button" className="row-action" onClick={() => setSelected(group)}>Manage</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <EmptyState title="No communities found" body="Try a broader search or another status." />}
        </section>
      ) : tab === "requests" ? (
        <section role="tabpanel" aria-label="Creation requests" className="communities-admin-panel">
          <div className="panel-intro"><div><h2>Creation requests</h2><p>Approval publishes the community and consumes one of the creator’s two slots.</p></div><span>{requests.length} pending</span></div>
          {requests.length ? <div className="creation-request-list">{requests.map((request) => (
            <article key={request.id} className="creation-request-card">
              <div className="request-avatar">{request.coverEmoji}</div>
              <div className="request-copy"><div className="request-title-line"><h3>{request.name}</h3><span>Pending</span></div><p>{request.description || "No description supplied."}</p><div className="request-meta"><span>{request.requesterId}</span><span>{request.slotsUsed ?? 1} of 2 slots used</span><span>{dateLabel(request.createdAt)}</span></div></div>
              <div className="request-actions"><button type="button" className="approve" onClick={() => void approve(request)} disabled={Boolean(busyKey)}>{busyKey === `approve:${request.id}` ? <Loader2 className="spin" size={15} /> : <Check size={15} />} Approve</button><button type="button" onClick={() => { setReviewing(request); setRejectionReason(""); }}>Review</button></div>
            </article>
          ))}</div> : <EmptyState title="Review queue is clear" body="New member proposals will appear here." />}
        </section>
      ) : (
        <section role="tabpanel" aria-label="Trending" className="communities-admin-panel">
          <div className="panel-intro"><div><h2>Trending order</h2><p>Choose any number of eligible public communities. This exact order appears in Explore.</p></div><label className="trending-add"><span className="admin-visually-hidden">Add a Trending community</span><select value="" onChange={(event) => addTrending(event.target.value)}><option value="">Add community…</option>{eligible.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}</select></label></div>
          {trending.length ? <ol className="trending-list">{trending.map((group, index) => (
            <li key={group.id}><span className="rank-number">{index + 1}</span><span className="trending-emoji">{group.coverEmoji}</span><span className="trending-name"><strong>{group.name}</strong><small>{group.memberCount} members · {group.messageCount} posts</small></span><div className="trending-controls"><button type="button" aria-label={`Move ${group.name} up`} disabled={index === 0 || Boolean(busyKey)} onClick={() => moveTrending(index, -1)}><ArrowUp size={15} /></button><button type="button" aria-label={`Move ${group.name} down`} disabled={index === trending.length - 1 || Boolean(busyKey)} onClick={() => moveTrending(index, 1)}><ArrowDown size={15} /></button><button type="button" aria-label={`Remove ${group.name} from Trending`} disabled={Boolean(busyKey)} onClick={() => void persistTrending(trending.filter((item) => item.id !== group.id))}><X size={15} /></button></div></li>
          ))}</ol> : <EmptyState title="Nothing is curated yet" body="Add public communities to create the Trending rail." />}
        </section>
      )}

      {createOpen ? (
        <Drawer title="Create a platform community" description="Publishes immediately and does not consume a member’s personal slots." onClose={() => setCreateOpen(false)}>
          <CommunityForm value={proposal} onChange={setProposal} onSubmit={submitCreate} submitLabel="Publish community" busy={busyKey === "create"} />
        </Drawer>
      ) : null}

      {selected ? (
        <Drawer title={selected.name} description={`${selected.managementScope === "platform" ? "Platform-managed" : "Member-owned"} · created ${dateLabel(selected.createdAt)}`} onClose={() => setSelected(null)}>
          <form className="community-drawer-form" onSubmit={saveSelected}>
            <Field label="Name"><input name="name" defaultValue={selected.name} minLength={3} maxLength={60} required /></Field>
            <Field label="Description"><textarea name="description" defaultValue={selected.description ?? ""} maxLength={280} rows={4} /></Field>
            <div className="form-grid"><Field label="Visibility"><select name="visibility" defaultValue={selected.visibility}><option value="public">Public</option><option value="private">Private</option></select></Field><Field label="Join policy"><select name="joinPolicy" defaultValue={selected.joinPolicy}><option value="open">Open</option><option value="request">Request approval</option></select></Field></div>
            <Field label="Icon"><input name="coverEmoji" defaultValue={selected.coverEmoji} maxLength={8} /></Field>
            <button type="submit" className="drawer-primary" disabled={Boolean(busyKey)}>Save changes</button>
          </form>
          <div className="drawer-danger-zone"><strong>{selected.archivedAt ? "Restore community" : "Archive community"}</strong><p>{selected.archivedAt ? "Member-owned communities are restored only when the creator has a free slot." : "Archiving removes the community from discovery and releases a member-owned slot."}</p><button type="button" onClick={() => setConfirmTarget({ group: selected, action: selected.archivedAt ? "restore" : "archive" })}>{selected.archivedAt ? <RotateCcw size={15} /> : <Archive size={15} />}{selected.archivedAt ? "Restore" : "Archive"}</button></div>
        </Drawer>
      ) : null}

      {reviewing ? (
        <Drawer title={`Review ${reviewing.name}`} description={`${reviewing.requesterId} · ${reviewing.slotsUsed ?? 1} of 2 slots used`} onClose={() => setReviewing(null)}>
          <div className="review-proposal"><span>{reviewing.coverEmoji}</span><h3>{reviewing.name}</h3><p>{reviewing.description || "No description supplied."}</p></div>
          <button type="button" className="drawer-primary" onClick={() => void approve(reviewing)} disabled={Boolean(busyKey)}><Check size={16} /> Approve and publish</button>
          <Field label="Reason for rejection"><textarea value={rejectionReason} onChange={(event) => setRejectionReason(event.target.value)} rows={4} minLength={8} maxLength={500} placeholder="Tell the creator what needs to change." /></Field>
          <button type="button" className="drawer-reject" onClick={() => void reject(reviewing)} disabled={Boolean(busyKey)}>Reject request</button>
        </Drawer>
      ) : null}

      <ConfirmDialog isOpen={Boolean(confirmTarget)} onCancel={() => setConfirmTarget(null)} onConfirm={confirmLifecycle} loading={Boolean(confirmTarget && busyKey)} title={`${confirmTarget?.action === "restore" ? "Restore" : "Archive"} ${confirmTarget?.group.name ?? "community"}?`} message={confirmTarget?.action === "restore" ? "The community will return to discovery if its creator has a free slot." : "The community will leave discovery and its Trending position will be removed."} confirmLabel={confirmTarget?.action === "restore" ? "Restore community" : "Archive community"} variant={confirmTarget?.action === "restore" ? "info" : "warning"} />
    </main>
  );
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return <div className="communities-admin-state"><MessageSquareText size={24} /><strong>{title}</strong><span>{body}</span></div>;
}

function Drawer({ title, description, onClose, children }: { title: string; description: string; onClose: () => void; children: React.ReactNode }) {
  return <div className="community-drawer-layer"><button type="button" className="community-drawer-backdrop" aria-label="Close panel" onClick={onClose} /><aside role="dialog" aria-modal="true" aria-label={title} className="community-drawer"><header><div><h2>{title}</h2><p>{description}</p></div><button type="button" aria-label="Close panel" onClick={onClose}><X size={18} /></button></header><div className="community-drawer-body">{children}</div></aside></div>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="community-form-field"><span>{label}</span>{children}</label>;
}

function CommunityForm({ value, onChange, onSubmit, submitLabel, busy }: { value: CommunityProposalInput; onChange: (value: CommunityProposalInput) => void; onSubmit: (event: FormEvent) => void; submitLabel: string; busy: boolean }) {
  return <form className="community-drawer-form" onSubmit={onSubmit}><Field label="Name"><input value={value.name} onChange={(event) => onChange({ ...value, name: event.target.value })} minLength={3} maxLength={60} required autoFocus /></Field><Field label="Description"><textarea value={value.description ?? ""} onChange={(event) => onChange({ ...value, description: event.target.value })} maxLength={280} rows={4} /></Field><div className="form-grid"><Field label="Visibility"><select value={value.visibility} onChange={(event) => onChange({ ...value, visibility: event.target.value as "public" | "private" })}><option value="public">Public</option><option value="private">Private</option></select></Field><Field label="Join policy"><select value={value.joinPolicy} onChange={(event) => onChange({ ...value, joinPolicy: event.target.value as "open" | "request" })}><option value="open">Open</option><option value="request">Request approval</option></select></Field></div><Field label="Icon"><input value={value.coverEmoji} onChange={(event) => onChange({ ...value, coverEmoji: event.target.value })} maxLength={8} /></Field><button type="submit" className="drawer-primary" disabled={busy || value.name.trim().length < 3}>{busy ? <Loader2 className="spin" size={16} /> : <Plus size={16} />}{submitLabel}</button></form>;
}
