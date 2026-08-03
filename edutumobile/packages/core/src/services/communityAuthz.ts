import type {
  CommunityGroup,
  CommunityGroupMember,
  MemberRole,
  MembershipStatus,
} from './communities';

/**
 * WHO MAY ADMINISTER A GROUP — the client half of the ONE rule.
 *
 * This is the client-side counterpart of
 * `backend/services/services/api/src/communities/community-authz.ts`, which is
 * the authority: same arms, same precedence, same treatment of departures.
 *
 * WHY IT LIVES HERE AND NOT IN A SCREEN. It used to be a hand-copied function
 * inside `app/(app)/discussions/[id].tsx`. Three separate Critical findings in
 * this feature had the identical shape — two places that must agree,
 * disagreeing — and a hand-copied mirror of an authorization rule is that bug
 * with a fuse in it. Anything on the client that needs to know whether somebody
 * may moderate imports from here; nobody restates it.
 *
 * It is NOT a new rule and must never become one:
 *   • `owner_id` alone is enough, so a drifted or missing membership row never
 *     locks a real owner out of their own group;
 *   • an explicit departure (`removed`/`banned`) is a decision, not drift, and
 *     beats `owner_id` — a removed ex-owner and a banned ex-mod administer
 *     nothing;
 *   • only an `active` membership confers a role — `invited` and `pending` are
 *     neither departures nor administration and confer nothing.
 *
 * THE CLIENT ADDS EXACTLY ONE THING the backend does not need: a null `userId`.
 * The server always knows who is asking; the client can be mid-auth-load, and
 * `undefined === undefined` would otherwise make a signed-out reader the owner
 * of a group whose `ownerId` failed to parse. Absent identity resolves to no
 * rights, always.
 */

/** Only the group fields an authorization decision may read. */
export type AuthzGroup = Pick<CommunityGroup, 'ownerId'>;

/** Only the membership fields an authorization decision may read. */
export type AuthzMembership = Pick<CommunityGroupMember, 'status' | 'role'>;

/** Absent rows are the common case — everyone who has never touched a group. */
export type MaybeMembership = AuthzMembership | null | undefined;

/**
 * An explicit departure: a decision somebody made about this person, not drift.
 * It is the one thing that beats `community_groups.owner_id`.
 */
export function isDepartedStatus(
  status: MembershipStatus | string | null | undefined,
): boolean {
  return status === 'removed' || status === 'banned';
}

/**
 * The role this person may administer the group with, or `null` if they may
 * not. `group` is nullable because a caller may be resolving rights before the
 * group has loaded, or from a message that outlived its group row; a missing
 * group only removes the `owner_id` arm.
 */
export function resolveAdminRole(
  group: AuthzGroup | null | undefined,
  userId: string | null | undefined,
  membership: MaybeMembership,
): MemberRole | null {
  if (!userId) return null;
  const status = membership?.status;
  if (group?.ownerId === userId && !isDepartedStatus(status)) return 'owner';
  if (status !== 'active') return null;
  if (membership?.role === 'owner') return 'owner';
  if (membership?.role === 'mod') return 'mod';
  return null;
}

/**
 * Owner or moderator: may remove members and delete other people's messages.
 * The boolean face of {@link resolveAdminRole}, for callers that do not need to
 * know which of the two the person is.
 */
export function canModerateGroup(
  group: AuthzGroup | null | undefined,
  userId: string | null | undefined,
  membership: MaybeMembership,
): boolean {
  return resolveAdminRole(group, userId, membership) !== null;
}

/** Owner only: group settings and the screening form. */
export function isGroupOwner(
  group: AuthzGroup | null | undefined,
  userId: string | null | undefined,
  membership: MaybeMembership,
): boolean {
  return resolveAdminRole(group, userId, membership) === 'owner';
}
