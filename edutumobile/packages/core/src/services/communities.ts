import { getApiBaseUrl, throwIfBillingResponse, type GetAuthToken } from './productApi';

// Mirrors backend src/communities — Group Discussions: a group is a small,
// opt-in room, optionally pinned to one opportunity, that members chat in.
//
// WHY THIS FILE DOES NOT CALL `requestProductApi`
// ----------------------------------------------
// Every other service here goes through `requestProductApi`, which swallows any
// non-ok response and returns `null`. That is the right trade for a feed that
// can degrade to empty. It is the wrong trade for this feature: almost every
// refusal the backend issues is a *sentence the user has to read and act on* —
// "You can run 2 active groups at a time…", "This group is private. Ask an
// owner for an invite.", "You've been banned from this group", and the message
// screener's "…it reads like it's asking for money…". Collapsing all of those
// into `null` leaves the UI with nothing to say but "something went wrong",
// which for the screener in particular is actively harmful (the member retypes
// the same blocked message forever).
//
// So the transport below is the same transport — same base URL, same bearer
// token, same abort budget, same billing-refusal semantics via
// `throwIfBillingResponse` — with exactly one difference: a failure throws a
// `CommunityApiError` carrying the server's sentence instead of returning null.
// `getApiBaseUrl` and `throwIfBillingResponse` are imported rather than
// reimplemented so there is still one source of truth for both.

const DEFAULT_TIMEOUT_MS = 12000;

/**
 * A refusal from the communities API, carrying the server's human sentence.
 *
 * `message` is what the UI shows. `status` is for logic only (404 → "this group
 * is gone", 403 → offer the invite flow) and must never reach a user; the whole
 * point of this class is that the sentence travels with the failure.
 */
export class CommunityApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'CommunityApiError';
    this.status = status;
  }
}

export function isCommunityApiError(error: unknown): error is CommunityApiError {
  return (
    error instanceof CommunityApiError ||
    (typeof error === 'object' && error !== null && (error as { name?: string }).name === 'CommunityApiError')
  );
}

// ---------------------------------------------------------------------------
// Types — the backend's JSON shapes, camelCase as Drizzle serializes them.
// ---------------------------------------------------------------------------

/** Who can see the group at all. Independent of `joinPolicy`. */
export type GroupVisibility = 'public' | 'private';

/**
 * How an *already visible* group is entered. Orthogonal to visibility on
 * purpose: a private group can never be self-joined whatever this says — entry
 * is by invitation only — so `joinPolicy` only ever decides what happens to
 * somebody who is allowed to try.
 */
export type GroupJoinPolicy = 'open' | 'request';

/**
 * The five membership states. `invited` and `pending` are DIFFERENT and the UI
 * must tell them apart:
 *   invited  an owner put this person here. They see a preview and can accept.
 *   pending  the person applied and nobody has approved them. They wait.
 * Only `active` is membership; `removed` and `banned` are departures, and
 * `banned` is a moderator decision the client must never offer to undo.
 */
export type MembershipStatus = 'active' | 'invited' | 'pending' | 'removed' | 'banned';

export type MemberRole = 'owner' | 'mod' | 'member';

export interface CommunityGroup {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  opportunityId: string | null;
  ownerId: string;
  visibility: GroupVisibility;
  joinPolicy: GroupJoinPolicy;
  coverEmoji: string;
  accent: string | null;
  /** Inherited from the linked opportunity's deadline; the group closes with it. */
  expiresAt: string | null;
  /** Archived groups are READ-ONLY and irreversibly so — there is no unarchive. */
  archivedAt: string | null;
  memberCount: number;
  messageCount: number;
  lastMessageAt: string | null;
  createdAt: string;
}

export interface CommunityGroupMember {
  id: string;
  groupId: string;
  userId: string;
  role: MemberRole;
  status: MembershipStatus;
  joinedAt: string;
}

/**
 * Who sent a message, as far as anyone else is allowed to know.
 *
 * A display name and an avatar. The backend selects exactly two columns from
 * `profiles`, so there is nothing else here to render or to leak — no email, no
 * country, no school.
 *
 * `displayName` is NEVER empty: most members in this database have never filled
 * a name in, and the backend substitutes a neutral one rather than sending null.
 * Do not add a client-side fallback on top; two different fallbacks is how the
 * same person ends up named differently in the chat and in the blocked list.
 */
export interface MessageAuthor {
  displayName: string;
  avatarUrl: string | null;
}

export interface CommunityMessage {
  id: string;
  groupId: string;
  userId: string;
  /** Blank when `deletedAt` is set — a moderator tombstone keeps the row, not the text. */
  body: string;
  kind: string;
  opportunityId: string | null;
  createdAt: string;
  deletedAt: string | null;
  deletedBy: string | null;
  /**
   * OPTIONAL, and the reason is worth reading: every message from the REST API
   * carries one, but a message delivered over Supabase Realtime is the raw
   * `community_group_messages` row and has no author attached — the join lives
   * in the backend, not in the table. Render the fallback for an absent author
   * rather than assuming it is there.
   */
  author?: MessageAuthor;
}

/**
 * One screening question on a request-to-join form. A discriminated union, not
 * a flat object with an optional `options`: only `single_select` carries
 * options, and encoding that in the type means a renderer never has to guard
 * `options` before mapping it.
 */
export type GroupQuestion =
  | {
      id: string;
      type: 'short_text' | 'long_text';
      label: string;
      required: boolean;
      options?: undefined;
    }
  | {
      id: string;
      type: 'single_select';
      label: string;
      required: boolean;
      /** 2–6 options, enforced by the backend schema. */
      options: string[];
    };

export interface GroupForm {
  /** At most 5. A form builder, not a form engine. */
  questions: GroupQuestion[];
}

export interface JoinRequestAnswer {
  id: string;
  value: string;
}

export interface JoinRequest {
  id: string;
  groupId: string;
  userId: string;
  answers: JoinRequestAnswer[];
  status: 'pending' | 'approved' | 'rejected';
  decidedBy: string | null;
  decidedAt: string | null;
  createdAt: string;
}

export type JoinRequestDecision = 'approved' | 'rejected';

/**
 * A group as THIS caller sees it: the group, plus their own membership row or
 * `null` if they have none.
 *
 * ONE shape for the list and the detail, because the backend returns one shape
 * from `list` and `get`. A browse row that could not carry a membership was why
 * an invitation had nowhere to appear: a private group cannot be self-joined,
 * so entry is always via an `invited` row, and a bare group gave the invitee
 * nothing to render.
 *
 * The membership is present whatever its status, `removed`/`banned` included,
 * on groups that are visible for another reason (they are public) — so a browse
 * row shows "banned" rather than offering "Join" to somebody who cannot.
 */
export interface GroupWithMembership {
  group: CommunityGroup;
  membership: CommunityGroupMember | null;
}

/** The same shape, named for the detail screen that consumed it first. */
export type GroupDetail = GroupWithMembership;

/**
 * The outcome of `join`. `status: 'pending'` is not a failure — it means the
 * application was filed and the caller is waiting on an owner.
 */
export interface JoinResult {
  status: 'active' | 'pending';
  groupId: string;
  membership: CommunityGroupMember;
  request: JoinRequest | null;
}

export interface CommunityReport {
  id: string;
  targetType: 'message' | 'group';
  targetId: string;
  reporterId: string;
  reason: string;
  status: string;
  createdAt: string;
}

export interface CreateGroupInput {
  name: string;
  description?: string;
  opportunityId?: string;
  visibility?: GroupVisibility;
  joinPolicy?: GroupJoinPolicy;
  coverEmoji?: string;
}

/** `opportunityId` is omitted: a group's opportunity link is fixed at creation. */
export type UpdateGroupInput = Omit<Partial<CreateGroupInput>, 'opportunityId'>;

export interface GroupListFilter {
  /**
   * Only groups the caller has a LIVE relationship with — joined (`active`),
   * invited to, or applied to (`pending`). Not `active` alone: an invitation
   * has to appear somewhere, and each row carries its `membership` so the
   * screen labels it rather than implying membership. `removed`/`banned` never
   * appear.
   */
  mine?: boolean;
  opportunityId?: string;
  query?: string;
  limit?: number;
}

export interface MessagePageOptions {
  /**
   * Page boundary — messages strictly older than this instant.
   * Pass the oldest loaded message's `createdAt`.
   */
  before?: string | Date;
  /**
   * The boundary message's id, and NOT optional in practice: `created_at` is
   * transaction time, so any transaction writing two rows (a `kind='system'`
   * post beside another write) gives them an identical timestamp. Paging on the
   * instant alone skips every row that shares the boundary. Always pass the
   * same message's `id` alongside `before`.
   */
  beforeId?: string;
  /** Capped at 50 by the backend. */
  limit?: number;
}

export interface SendMessageInput {
  body: string;
  opportunityId?: string;
}

export interface ReportInput {
  targetType: 'message' | 'group';
  targetId: string;
  reason: string;
}

// ---------------------------------------------------------------------------
// Transport
// ---------------------------------------------------------------------------

type QueryValue = string | number | boolean | undefined | null;

/**
 * Built by hand rather than with `URLSearchParams` for two reasons: React
 * Native's polyfill has historically differed from Node's on encoding, and a
 * hand-built string has a stable, assertable key order.
 */
function toQuery(params: Record<string, QueryValue>): string {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
  }
  return parts.length ? `?${parts.join('&')}` : '';
}

/**
 * Pull the human sentence out of a Nest error body.
 *
 * Nest serializes `new BadRequestException("…")` as `{ statusCode, message,
 * error }` where `message` is the string; a `ZodValidationPipe` failure puts an
 * array of issue strings there instead. Both are read here so the caller never
 * has to, and a body with neither falls back to a plain sentence rather than
 * leaking `[object Object]` or a bare number into the UI.
 */
function extractMessage(body: unknown, status: number): string {
  const message = (body as { message?: unknown } | null)?.message;
  if (typeof message === 'string' && message.trim()) return message;
  if (Array.isArray(message)) {
    const first = message.find((entry) => typeof entry === 'string' && entry.trim());
    if (typeof first === 'string') return first;
  }
  const error = (body as { error?: unknown } | null)?.error;
  if (typeof error === 'string' && error.trim() && status !== 400) return error;
  return "That didn't work. Please try again.";
}

/**
 * The one request function for this feature. Same transport as
 * `requestProductApi`; the difference is that it throws the server's sentence
 * instead of returning `null`. See the file header for why.
 */
async function requestCommunityApi<T>(
  path: string,
  options: RequestInit,
  getAuthToken: GetAuthToken,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<T> {
  const apiBaseUrl = getApiBaseUrl();

  // Clerk's getToken can stall indefinitely on a flaky connection (it may
  // refresh the session over the network) — cap it so callers never hang.
  const token = await Promise.race([
    getAuthToken(),
    new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs)),
  ]);
  if (!token) {
    // Thrown, not returned as null: an anonymous request would come back 401
    // and the caller would show a generic failure for a fixable state.
    throw new CommunityApiError('You need to be signed in to use group discussions.', 401);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  const hasBody = options.body !== undefined && options.body !== null;
  const headers = {
    Accept: 'application/json',
    ...(hasBody ? { 'Content-Type': 'application/json' } : {}),
    ...(options.headers || {}),
    Authorization: `Bearer ${token}`,
  };

  let response: Response;
  try {
    response = await fetch(`${apiBaseUrl}${path.startsWith('/') ? path : `/${path}`}`, {
      ...options,
      headers,
      signal: options.signal || controller.signal,
    });
  } catch {
    throw new CommunityApiError("We couldn't reach Edutu. Check your connection and try again.", 0);
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    // Billing refusals keep the shared AiBillingError shape so the existing
    // paywall handling still recognises them.
    await throwIfBillingResponse(response);
    const body = await response.json().catch(() => null);
    throw new CommunityApiError(extractMessage(body, response.status), response.status);
  }

  if (response.status === 204) return {} as T;
  try {
    return (await response.json()) as T;
  } catch {
    return {} as T;
  }
}

/** Strips undefined keys so an optional field is absent, not `null`. */
function compact<T extends Record<string, unknown>>(input: T): Partial<T> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (value !== undefined) out[key] = value;
  }
  return out as Partial<T>;
}

// ---------------------------------------------------------------------------
// Groups
// ---------------------------------------------------------------------------

/**
 * Each row is `{ group, membership }` — the SAME shape `fetchGroup` returns for
 * one group, so a browse row and the screen it opens cannot describe the same
 * group differently.
 *
 * The membership is the whole reason the endpoint was widened: an `invited` row
 * is the only way into a private group, and a list of bare groups left it with
 * nowhere to be seen.
 */
export async function fetchGroups(
  filter: GroupListFilter,
  getAuthToken: GetAuthToken,
): Promise<GroupWithMembership[]> {
  const query = toQuery({
    mine: filter.mine ? true : undefined,
    opportunityId: filter.opportunityId,
    query: filter.query,
    limit: filter.limit,
  });
  const result = await requestCommunityApi<GroupWithMembership[]>(
    `/communities/groups${query}`,
    { method: 'GET' },
    getAuthToken,
  );
  if (!Array.isArray(result)) return [];
  // Defensive against an older backend still serving bare groups: a row with no
  // `group` key is one of those, and rendering `undefined.name` would blank the
  // whole screen over a deploy-order skew.
  return result.filter(
    (row): row is GroupWithMembership =>
      !!row && typeof row === 'object' && 'group' in row && !!row.group,
  );
}

export async function fetchGroup(
  groupId: string,
  getAuthToken: GetAuthToken,
): Promise<GroupDetail> {
  return requestCommunityApi<GroupDetail>(
    `/communities/groups/${encodeURIComponent(groupId)}`,
    { method: 'GET' },
    getAuthToken,
  );
}

export async function createGroup(
  input: CreateGroupInput,
  getAuthToken: GetAuthToken,
): Promise<CommunityGroup> {
  // `compact` matters here: CreateGroupSchema uses `.optional()` with defaults,
  // and an explicit `null` fails the parse — a valid group would 400 on a field
  // the user never filled in.
  return requestCommunityApi<CommunityGroup>(
    '/communities/groups',
    { method: 'POST', body: JSON.stringify(compact({ ...input })) },
    getAuthToken,
  );
}

export async function updateGroup(
  groupId: string,
  patch: UpdateGroupInput,
  getAuthToken: GetAuthToken,
): Promise<CommunityGroup> {
  return requestCommunityApi<CommunityGroup>(
    `/communities/groups/${encodeURIComponent(groupId)}`,
    { method: 'PATCH', body: JSON.stringify(compact({ ...patch })) },
    getAuthToken,
  );
}

/**
 * Retire a group. Owner-only and **irreversible** — there is no unarchive, and
 * an archived group is read-only. Any confirmation UI must say so.
 */
export async function archiveGroup(
  groupId: string,
  getAuthToken: GetAuthToken,
): Promise<CommunityGroup> {
  return requestCommunityApi<CommunityGroup>(
    `/communities/groups/${encodeURIComponent(groupId)}/archive`,
    { method: 'POST' },
    getAuthToken,
  );
}

// ---------------------------------------------------------------------------
// Membership
// ---------------------------------------------------------------------------

/**
 * Ask to join, or accept a standing invitation — one route for both, because
 * the server decides which it is from the membership row. `answers` are the
 * request-form replies and are sent even when empty so a request-to-join group
 * with no form still files a request.
 *
 * A `status: 'pending'` result is a success: the application is filed.
 */
export async function joinGroup(
  groupId: string,
  answers: JoinRequestAnswer[],
  getAuthToken: GetAuthToken,
): Promise<JoinResult> {
  return requestCommunityApi<JoinResult>(
    `/communities/groups/${encodeURIComponent(groupId)}/join`,
    { method: 'POST', body: JSON.stringify({ answers }) },
    getAuthToken,
  );
}

/**
 * Leaving is removing yourself, so it is the same route `removeMember` uses —
 * the backend routes `actor === target` to `leave`, including its "the creator
 * cannot leave, they archive instead" rule. `userId` is the caller's raw Clerk
 * subject, the value these columns actually hold.
 */
export async function leaveGroup(
  groupId: string,
  userId: string,
  getAuthToken: GetAuthToken,
): Promise<{ success: boolean }> {
  return removeMember(groupId, userId, getAuthToken);
}

export async function removeMember(
  groupId: string,
  userId: string,
  getAuthToken: GetAuthToken,
): Promise<{ success: boolean }> {
  return requestCommunityApi<{ success: boolean }>(
    `/communities/groups/${encodeURIComponent(groupId)}/members/${encodeURIComponent(userId)}`,
    { method: 'DELETE' },
    getAuthToken,
  );
}

/**
 * Owner/mod action. Writes an `invited` row the invitee converts by calling
 * `joinGroup`; it is the ONLY way into a private group, and on a public
 * request-to-join group it is what lets the invitee skip the approval queue.
 */
export async function inviteToGroup(
  groupId: string,
  inviteeId: string,
  getAuthToken: GetAuthToken,
): Promise<CommunityGroupMember> {
  return requestCommunityApi<CommunityGroupMember>(
    `/communities/groups/${encodeURIComponent(groupId)}/invite`,
    { method: 'POST', body: JSON.stringify({ userId: inviteeId }) },
    getAuthToken,
  );
}

/** Owner-only. The backend refuses any change that would leave zero owners. */
export async function setMemberRole(
  groupId: string,
  userId: string,
  role: MemberRole,
  getAuthToken: GetAuthToken,
): Promise<CommunityGroupMember> {
  return requestCommunityApi<CommunityGroupMember>(
    `/communities/groups/${encodeURIComponent(groupId)}/members/${encodeURIComponent(userId)}/role`,
    { method: 'PATCH', body: JSON.stringify({ role }) },
    getAuthToken,
  );
}

// ---------------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------------

/**
 * One page of messages, newest first.
 *
 * KEYSET, NOT OFFSET. Both `before` and `beforeId` are forwarded: see
 * `MessagePageOptions.beforeId` for why sending the timestamp alone silently
 * drops rows.
 */
export async function fetchMessages(
  groupId: string,
  options: MessagePageOptions,
  getAuthToken: GetAuthToken,
): Promise<CommunityMessage[]> {
  const before =
    options.before instanceof Date ? options.before.toISOString() : options.before;
  const query = toQuery({
    before,
    beforeId: options.beforeId,
    limit: options.limit,
  });
  const result = await requestCommunityApi<CommunityMessage[]>(
    `/communities/groups/${encodeURIComponent(groupId)}/messages${query}`,
    { method: 'GET' },
    getAuthToken,
  );
  return Array.isArray(result) ? result : [];
}

/**
 * Post a message.
 *
 * The scam screener can refuse this with a 400 whose body is a sentence written
 * for the member ("…it reads like it's asking for money…"). That sentence
 * arrives as `CommunityApiError.message` and is the ONLY thing the composer
 * should show — never the status, and never a generic failure, or the member
 * retypes the same blocked text indefinitely.
 */
export async function sendMessage(
  groupId: string,
  input: SendMessageInput,
  getAuthToken: GetAuthToken,
): Promise<CommunityMessage> {
  return requestCommunityApi<CommunityMessage>(
    `/communities/groups/${encodeURIComponent(groupId)}/messages`,
    { method: 'POST', body: JSON.stringify(compact({ ...input })) },
    getAuthToken,
  );
}

/**
 * Soft-delete. The row survives with a blank `body` and a `deletedAt` stamp, so
 * the returned message is a tombstone, not an absence — render it as one.
 * Message ids are globally unique, so this route is not group-scoped.
 */
export async function deleteMessage(
  messageId: string,
  getAuthToken: GetAuthToken,
): Promise<CommunityMessage> {
  return requestCommunityApi<CommunityMessage>(
    `/communities/messages/${encodeURIComponent(messageId)}`,
    { method: 'DELETE' },
    getAuthToken,
  );
}

// ---------------------------------------------------------------------------
// Join forms and requests
// ---------------------------------------------------------------------------

export async function fetchGroupForm(
  groupId: string,
  getAuthToken: GetAuthToken,
): Promise<GroupForm> {
  const result = await requestCommunityApi<GroupForm>(
    `/communities/groups/${encodeURIComponent(groupId)}/form`,
    { method: 'GET' },
    getAuthToken,
  );
  return { questions: Array.isArray(result?.questions) ? result.questions : [] };
}

/** Owner-only. At most 5 questions; the backend rejects a 6th. */
export async function saveGroupForm(
  groupId: string,
  questions: GroupQuestion[],
  getAuthToken: GetAuthToken,
): Promise<GroupForm> {
  return requestCommunityApi<GroupForm>(
    `/communities/groups/${encodeURIComponent(groupId)}/form`,
    { method: 'POST', body: JSON.stringify({ questions }) },
    getAuthToken,
  );
}

/** Owner-only: the queue of `pending` applicants and their answers. */
export async function fetchJoinRequests(
  groupId: string,
  getAuthToken: GetAuthToken,
): Promise<JoinRequest[]> {
  const result = await requestCommunityApi<JoinRequest[]>(
    `/communities/groups/${encodeURIComponent(groupId)}/requests`,
    { method: 'GET' },
    getAuthToken,
  );
  return Array.isArray(result) ? result : [];
}

/** Approving flips the applicant's membership row to `active`. */
export async function decideJoinRequest(
  groupId: string,
  requestId: string,
  decision: JoinRequestDecision,
  getAuthToken: GetAuthToken,
): Promise<JoinRequest> {
  return requestCommunityApi<JoinRequest>(
    `/communities/groups/${encodeURIComponent(groupId)}/requests/${encodeURIComponent(requestId)}`,
    { method: 'POST', body: JSON.stringify({ decision }) },
    getAuthToken,
  );
}

// ---------------------------------------------------------------------------
// Moderation
// ---------------------------------------------------------------------------

export async function reportTarget(
  input: ReportInput,
  getAuthToken: GetAuthToken,
): Promise<CommunityReport> {
  return requestCommunityApi<CommunityReport>(
    '/communities/reports',
    { method: 'POST', body: JSON.stringify(input) },
    getAuthToken,
  );
}

/**
 * Someone the caller has blocked.
 *
 * `userId` is what you compare against `message.userId` to hide their messages
 * — but ONLY when `resolved` is true. `user_blocks` is uuid-keyed while
 * messages carry the raw Clerk subject, and the backend maps back through
 * `profiles`; a member with no profile row cannot be mapped, so `userId` is the
 * stored uuid instead and will match no message. It is still listed, and still
 * unblockable, because a block the user cannot see is a block they cannot undo.
 */
export interface BlockedUser {
  userId: string;
  /** Never empty — the backend substitutes a neutral name. */
  displayName: string;
  avatarUrl: string | null;
  blockedAt: string | null;
  /** False when `userId` is a stored uuid rather than a subject. See above. */
  resolved: boolean;
}

/**
 * Stop seeing someone — **on the server**, not on this phone.
 *
 * This replaces the AsyncStorage list the chat screen used to keep. That list
 * died on reinstall, never reached the member's other device, and the backend
 * knew nothing about it. This writes the shared `user_blocks` table, so a block
 * made in a group also applies to that person's roadmap comments.
 *
 * Idempotent: blocking somebody already blocked succeeds and changes nothing.
 */
export async function blockUser(
  userId: string,
  getAuthToken: GetAuthToken,
): Promise<{ success: boolean; blockedUserId: string }> {
  return requestCommunityApi<{ success: boolean; blockedUserId: string }>(
    '/communities/blocks',
    { method: 'POST', body: JSON.stringify({ userId }) },
    getAuthToken,
  );
}

/**
 * The caller's OWN block list. There is deliberately no endpoint that tells
 * somebody who has blocked them.
 */
export async function fetchBlockedUsers(
  getAuthToken: GetAuthToken,
): Promise<BlockedUser[]> {
  const result = await requestCommunityApi<BlockedUser[]>(
    '/communities/blocks',
    { method: 'GET' },
    getAuthToken,
  );
  return Array.isArray(result) ? result : [];
}

/**
 * Undo a block. **Supported on purpose** — Block sits in a row action sheet on
 * a target the width of a message bubble, right beside Report and Delete, and
 * people mis-tap it. Offer it wherever Block is offered.
 *
 * `wasBlocked: false` is not a failure: it means there was nothing to undo,
 * which is the state the caller asked for.
 */
export async function unblockUser(
  userId: string,
  getAuthToken: GetAuthToken,
): Promise<{ success: boolean; blockedUserId: string; wasBlocked: boolean }> {
  return requestCommunityApi<{
    success: boolean;
    blockedUserId: string;
    wasBlocked: boolean;
  }>(
    `/communities/blocks/${encodeURIComponent(userId)}`,
    { method: 'DELETE' },
    getAuthToken,
  );
}
