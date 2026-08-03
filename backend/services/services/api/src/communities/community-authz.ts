/**
 * THE authorization boundary for Group Discussions, in one place.
 *
 * The backend connects as `service_role`, so RLS is bypassed rather than
 * standing behind these checks. Whatever these functions say is what the
 * product enforces; there is no policy underneath to catch a mistake.
 *
 * WHY THIS MODULE EXISTS. Three separate Critical findings in this feature had
 * the identical shape — two methods that must agree, disagreeing:
 *
 *   1. `join` never checked visibility while `get` did, so anyone holding a
 *      leaked group id could self-join a private group.
 *   2. `pending` meant both "invited by an owner" and "applied, unapproved",
 *      and `join` told them apart using `visibility` — a mutable column, so
 *      making a group private converted its applicant queue into a guest list.
 *   3. `MessagesService.list` admitted `pending` and refused `invited` while
 *      `GroupsService.get` did the opposite: unvetted applicants got the whole
 *      message history, and real invitees could not load the invite preview.
 *
 * Finding 3 landed in a service written AFTER 1 and 2 were documented in its
 * own brief. Restating the rule in prose demonstrably does not prevent the
 * drift, so the rule lives here once and both services call it.
 *
 * DEPENDENCY-FREE ON PURPOSE. `MessagesService` cannot import `GroupsService`
 * (the latter posts `kind='system'` messages through the former, so the edge
 * would be circular) — which is the whole reason the copies existed. Pure
 * functions over plain rows have no such constraint: no database, no Nest, no
 * import from either service. The parameters are structural, so a real Drizzle
 * row and a literal in a spec are both accepted.
 */

/**
 * The five membership states. `invited` and `pending` are DIFFERENT states on
 * purpose and the distinction is load-bearing:
 *
 *   invited  an owner/mod put this person here (`invite`). A standing decision
 *            to admit them, so accepting it activates the row whatever the
 *            group's visibility or join policy currently says.
 *   pending  the person put themselves here (`join` on a request-to-join
 *            group). Nobody has approved them; it is never self-activatable.
 *
 * The previous shape used one `pending` status for both and disambiguated by
 * reading `visibility`. `update` can set `visibility: 'private'`, so an owner
 * making a public request-to-join group private converted their entire unvetted
 * applicant queue into a guest list — every one of them could then "accept"
 * their own application. Making the two states distinct in the data model is
 * the only fix that does not depend on a mutable column.
 *
 * Only `active` is membership: `member_count`, `countActiveOwners`, and the RLS
 * helpers in 20260803120000_community_groups.sql all compare against `active`
 * alone, so adding a fifth status changes none of their meanings.
 */
export type MembershipStatus =
  | "active"
  | "invited"
  | "pending"
  | "removed"
  | "banned";

export type MemberRole = "owner" | "mod" | "member";

/**
 * The group columns any authorization decision is allowed to read. Deliberately
 * narrow: `joinPolicy` is absent because no predicate here may consult it (it
 * decides what happens once you are allowed in, not whether you are), and
 * `expiresAt` is absent because expiry is a lifecycle rule the callers raise a
 * BadRequest for, not a permission.
 */
export type AuthzGroup = {
  ownerId: string;
  visibility: string;
  archivedAt?: Date | null;
};

/** The membership columns an authorization decision may read. */
export type AuthzMembership = {
  status: string;
  role: string;
};

/** Absent rows are the common case — everyone who has never touched a group. */
export type MaybeMembership = AuthzMembership | null | undefined;

/**
 * An explicit departure: a decision somebody made about this person, not drift.
 * It is the one thing that beats `community_groups.owner_id`.
 */
export function isDepartedStatus(status: string | undefined): boolean {
  return status === "removed" || status === "banned";
}

/**
 * The three statuses a person can be moved OUT of by `leave` / `removeMember`:
 * in the group, invited to it, or waiting on a decision.
 *
 * A WHITELIST, not "anything but removed". `banned` is a moderator's decision
 * and every other reader treats it as one; on a denylist a banned user could
 * launder their own ban by "leaving" — the row went to `removed`, and `join`
 * then let them straight back in. `removed` is already out. Both are excluded
 * by being absent, so a sixth status added later is refused by default rather
 * than silently accepted.
 */
export function isLiveMembershipStatus(status: string | undefined): boolean {
  return status === "active" || status === "invited" || status === "pending";
}

/**
 * Can this person see the group and its messages?
 *
 * Public groups are readable by any signed-in user, joined or not —
 * read-before-join is intended. Private groups admit `active` or `invited` and
 * nothing else.
 *
 * `invited` reads because an `invited` row is an owner's standing decision to
 * admit someone, and an invitation you cannot look at is unusable. `pending`
 * does NOT read: it is an unapproved self-application, and a group that was
 * public+request before an owner flipped it to private carries a queue of them
 * — treating that queue as invited would hand the whole message history to
 * every unvetted applicant the instant the owner asked for MORE privacy.
 *
 * Archived groups stay readable; only posting treats archiving as a wall.
 *
 * KNOWN DIVERGENCE FROM RLS: community_is_active_member() admits 'active' only,
 * so a client reading community_groups directly through Supabase gets nothing
 * for an invitee. That is deliberate — an unaccepted invitation must not hand
 * out a private group's roster over Realtime — and it means the invite-preview
 * screen must call the backend endpoint, not Supabase.
 */
export function canReadGroup(
  group: Pick<AuthzGroup, "visibility">,
  membership: MaybeMembership,
): boolean {
  if (group.visibility !== "private") return true;
  return membership?.status === "active" || membership?.status === "invited";
}

/**
 * The role this person may administer the group with, or null if they may not.
 *
 * Belt and braces, mirroring the `community_is_owner_or_mod` RLS helper:
 * `owner_id` is the canonical record of who made the group, the membership row
 * is the operational one, and either alone is enough — so a drifted or missing
 * row never locks a real owner out of their own group. The one exception is an
 * explicit departure: a `removed` or `banned` row is a decision rather than
 * drift, so it beats `owner_id`.
 *
 * `invited` and `pending` are neither departures nor administration; they fail
 * the `active` test and confer nothing.
 *
 * `group` is nullable because a caller may be resolving rights from a message's
 * group id, which can in principle outlive its group row. A missing group only
 * removes the `owner_id` arm; the membership arm still stands on its own.
 */
export function resolveAdminRole(
  group: Pick<AuthzGroup, "ownerId"> | null | undefined,
  userId: string,
  membership: MaybeMembership,
): MemberRole | null {
  if (group?.ownerId === userId && !isDepartedStatus(membership?.status)) {
    return "owner";
  }
  if (membership?.status !== "active") return null;
  if (membership.role === "owner") return "owner";
  if (membership.role === "mod") return "mod";
  return null;
}

/**
 * Owner or moderator: may change settings, invite, remove members, and delete
 * other people's messages. The boolean face of {@link resolveAdminRole}, for
 * callers that do not need to know which of the two the person is.
 */
export function canModerateGroup(
  group: Pick<AuthzGroup, "ownerId"> | null | undefined,
  userId: string,
  membership: MaybeMembership,
): boolean {
  return resolveAdminRole(group, userId, membership) !== null;
}

/**
 * Owner only: the two irreversible-ish powers, archiving and changing roles.
 */
export function isGroupOwner(
  group: Pick<AuthzGroup, "ownerId"> | null | undefined,
  userId: string,
  membership: MaybeMembership,
): boolean {
  return resolveAdminRole(group, userId, membership) === "owner";
}

/**
 * Can this person post? Only a fully `active` member, and never into an
 * archived group — archiving is one-way and makes the group read-only.
 *
 * Note this is strictly narrower than {@link canReadGroup}: an invitee reads a
 * private group but cannot speak in it until they accept, and any signed-in
 * user reads a public group without being able to post in it.
 */
export function canPostInGroup(
  group: Pick<AuthzGroup, "archivedAt">,
  membership: MaybeMembership,
): boolean {
  if (group.archivedAt) return false;
  return membership?.status === "active";
}

/**
 * Can this person turn their own membership row `active` without anyone else
 * acting? ONLY an `invited` row — an owner's standing decision to admit them,
 * honoured on any group, whatever its visibility or join policy currently says.
 *
 * THE GROUP IS NOT A PARAMETER, and that is the fix for finding #2 expressed
 * structurally rather than in a comment: no property of the group — least of
 * all the mutable `visibility` — may influence this answer, so none is
 * available to read. A `pending` row is NEVER self-activatable, on any group,
 * whatever its history.
 */
export function canSelfActivate(membership: MaybeMembership): boolean {
  return membership?.status === "invited";
}

/**
 * Can this person join without an invitation at all?
 *
 * A private group can never be self-joined, whatever its join policy says:
 * `visibility` and `joinPolicy` are independent enums, so private+open is
 * directly creatable, and group uuids travel in share links. Without this,
 * anyone holding an id could walk straight past the same wall
 * {@link canReadGroup} puts in front of them.
 *
 * This is the join side of the read rule and must stay its mirror image:
 * whatever cannot be READ without an invite cannot be JOINED without one.
 */
export function canSelfJoinWithoutInvite(
  group: Pick<AuthzGroup, "visibility">,
): boolean {
  return group.visibility !== "private";
}
