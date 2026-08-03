import {
  canModerateGroup,
  canPostInGroup,
  canReadGroup,
  canSelfActivate,
  canSelfJoinWithoutInvite,
  isDepartedStatus,
  isGroupOwner,
  isLiveMembershipStatus,
  resolveAdminRole,
  type AuthzGroup,
  type MaybeMembership,
  type MemberRole,
  type MembershipStatus,
} from "./community-authz";

/**
 * THE authorization matrix, stated once and checked exhaustively.
 *
 * Three Critical findings in this feature were all the same bug — two methods
 * that must agree, disagreeing — and prose restating the rule did not stop the
 * third from being written after the first two were documented. This file is
 * the defence against the fourth: every predicate is checked over the full
 * cross-product of visibility x status x role, with the expected answer written
 * as data rather than recomputed from the implementation. A test that mirrors
 * the code's own logic passes against a broken implementation; a table does not.
 *
 * Read the tables, not the assertions.
 */

const VISIBILITIES = ["public", "private"] as const;
type Visibility = (typeof VISIBILITIES)[number];

/** The five real statuses plus "no row at all", which is the common case. */
const STATUSES = [
  "active",
  "invited",
  "pending",
  "removed",
  "banned",
  "none",
] as const;
type StatusKey = (typeof STATUSES)[number];

const ROLES: MemberRole[] = ["owner", "mod", "member"];

const OWNER = "user_creator";
const OTHER = "user_other";

function group(
  visibility: Visibility,
  overrides: Partial<AuthzGroup> = {},
): AuthzGroup {
  return { ownerId: OWNER, visibility, archivedAt: null, ...overrides };
}

function membership(status: StatusKey, role: MemberRole): MaybeMembership {
  if (status === "none") return null;
  return { status: status satisfies MembershipStatus, role };
}

/** Every (visibility, status, role) triple, as a flat list of named cases. */
function everyCase(): Array<{
  name: string;
  visibility: Visibility;
  status: StatusKey;
  role: MemberRole;
}> {
  const cases: Array<{
    name: string;
    visibility: Visibility;
    status: StatusKey;
    role: MemberRole;
  }> = [];
  for (const visibility of VISIBILITIES) {
    for (const status of STATUSES) {
      for (const role of ROLES) {
        cases.push({
          name: `${visibility} / ${status} / ${role}`,
          visibility,
          status,
          role,
        });
      }
    }
  }
  return cases;
}

const ALL_CASES = everyCase();

describe("community-authz truth table", () => {
  it("covers the whole cross-product", () => {
    // 2 visibilities x 6 statuses x 3 roles. If this number changes, a state was
    // added and every table below needs a row for it.
    expect(ALL_CASES).toHaveLength(36);
  });

  // -------------------------------------------------------------------------
  // canReadGroup — the rule `GroupsService.get` and `MessagesService.list` both
  // call. Finding #3 was these two disagreeing: list admitted `pending` and
  // refused `invited`; get did the opposite.
  // -------------------------------------------------------------------------
  describe("canReadGroup", () => {
    // Role is irrelevant to reading, so the table is keyed on visibility+status.
    const EXPECTED: Record<Visibility, Record<StatusKey, boolean>> = {
      // A public group is readable by anyone signed in, joined or not:
      // read-before-join is the intended flow. Even a banned user still reads a
      // public group — the ban stops them posting, and hiding a public group
      // from them buys nothing they could not get by signing out.
      public: {
        active: true,
        invited: true,
        pending: true,
        removed: true,
        banned: true,
        none: true,
      },
      // A private group admits `active` and `invited` and NOTHING else.
      // `invited` reads because an invitation you cannot look at is unusable.
      // `pending` does not: it is an unapproved self-application, and a group
      // that was public+request before an owner made it private carries a queue
      // of them — admitting that queue would hand out the whole message history
      // the instant the owner asked for MORE privacy.
      private: {
        active: true,
        invited: true,
        pending: false,
        removed: false,
        banned: false,
        none: false,
      },
    };

    it.each(ALL_CASES)("$name", ({ visibility, status, role }) => {
      expect(canReadGroup(group(visibility), membership(status, role))).toBe(
        EXPECTED[visibility][status],
      );
    });

    it("stays readable once the group is archived", () => {
      // Archiving is a wall for posting only; the record must stay legible.
      expect(
        canReadGroup(
          group("private", { archivedAt: new Date() }),
          membership("active", "member"),
        ),
      ).toBe(true);
    });

    it("treats an unknown visibility as public, not private", () => {
      // Documenting the fall-through deliberately: `visibility` is a text
      // column, and the check is `!== 'private'`. A sixth visibility added
      // later is READABLE by default, so anything more restrictive than public
      // must be added to this predicate at the same time as the column value.
      expect(canReadGroup({ visibility: "unlisted" }, null)).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // resolveAdminRole / canModerateGroup / isGroupOwner — the rule
  // `GroupsService.assertCanAdminister` and `MessagesService.assertCanModerate`
  // both call. Mirrors the `community_is_owner_or_mod` RLS helper.
  // -------------------------------------------------------------------------
  describe("resolveAdminRole", () => {
    // For a NON-creator (group.ownerId is somebody else): only an `active` row
    // carrying owner/mod confers anything. Visibility is irrelevant — a public
    // group is not more moderatable than a private one.
    const NON_CREATOR: Record<
      StatusKey,
      Record<MemberRole, MemberRole | null>
    > = {
      active: { owner: "owner", mod: "mod", member: null },
      // An invitation is not a job. Neither is an application.
      invited: { owner: null, mod: null, member: null },
      pending: { owner: null, mod: null, member: null },
      removed: { owner: null, mod: null, member: null },
      banned: { owner: null, mod: null, member: null },
      none: { owner: null, mod: null, member: null },
    };

    it.each(ALL_CASES)("non-creator: $name", ({ visibility, status, role }) => {
      expect(
        resolveAdminRole(group(visibility), OTHER, membership(status, role)),
      ).toBe(NON_CREATOR[status][role]);
    });

    // For the CREATOR (group.ownerId === userId): `owner_id` is the canonical
    // record and the membership row the operational one, and either alone is
    // enough — so a drifted or MISSING row never locks a real owner out of the
    // group they made. The one exception is an explicit departure: `removed`
    // and `banned` are decisions rather than drift, so they beat `owner_id`.
    const CREATOR: Record<StatusKey, Record<MemberRole, MemberRole | null>> = {
      active: { owner: "owner", mod: "owner", member: "owner" },
      invited: { owner: "owner", mod: "owner", member: "owner" },
      pending: { owner: "owner", mod: "owner", member: "owner" },
      removed: { owner: null, mod: null, member: null },
      banned: { owner: null, mod: null, member: null },
      none: { owner: "owner", mod: "owner", member: "owner" },
    };

    it.each(ALL_CASES)("creator: $name", ({ visibility, status, role }) => {
      expect(
        resolveAdminRole(group(visibility), OWNER, membership(status, role)),
      ).toBe(CREATOR[status][role]);
    });

    it("falls back to the membership row when the group is missing", () => {
      // Reachable from a message whose group row is gone; the `owner_id` arm
      // simply drops out and the membership arm stands on its own.
      expect(resolveAdminRole(null, OWNER, membership("active", "mod"))).toBe(
        "mod",
      );
      expect(
        resolveAdminRole(null, OWNER, membership("active", "member")),
      ).toBe(null);
      expect(resolveAdminRole(undefined, OWNER, null)).toBe(null);
    });

    it("does not let an unknown role in through the owner/mod test", () => {
      // Whitelist, not denylist: a role added later confers nothing until it is
      // named here.
      expect(
        resolveAdminRole(group("public"), OTHER, {
          status: "active",
          role: "curator",
        }),
      ).toBe(null);
    });
  });

  describe("canModerateGroup", () => {
    it.each(ALL_CASES)(
      "is resolveAdminRole !== null — $name",
      ({ visibility, status, role }) => {
        for (const actor of [OWNER, OTHER]) {
          const member = membership(status, role);
          expect(canModerateGroup(group(visibility), actor, member)).toBe(
            resolveAdminRole(group(visibility), actor, member) !== null,
          );
        }
      },
    );

    it("lets an active mod moderate and an active member not", () => {
      expect(
        canModerateGroup(group("public"), OTHER, membership("active", "mod")),
      ).toBe(true);
      expect(
        canModerateGroup(
          group("public"),
          OTHER,
          membership("active", "member"),
        ),
      ).toBe(false);
    });
  });

  describe("isGroupOwner", () => {
    it("admits owners and refuses mods", () => {
      expect(
        isGroupOwner(group("public"), OTHER, membership("active", "owner")),
      ).toBe(true);
      expect(
        isGroupOwner(group("public"), OTHER, membership("active", "mod")),
      ).toBe(false);
      // The creator with no row at all is still an owner.
      expect(isGroupOwner(group("public"), OWNER, null)).toBe(true);
      // ...unless they were removed or banned.
      expect(
        isGroupOwner(group("public"), OWNER, membership("banned", "owner")),
      ).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // canPostInGroup — `MessagesService.send`.
  // -------------------------------------------------------------------------
  describe("canPostInGroup", () => {
    // Only `active`. Strictly narrower than canReadGroup in both directions
    // that matter: an invitee to a private group READS it but cannot speak
    // until they accept, and any signed-in user reads a public group without
    // being able to post in it.
    const EXPECTED: Record<StatusKey, boolean> = {
      active: true,
      invited: false,
      pending: false,
      removed: false,
      banned: false,
      none: false,
    };

    it.each(ALL_CASES)("$name", ({ visibility, status, role }) => {
      expect(canPostInGroup(group(visibility), membership(status, role))).toBe(
        EXPECTED[status],
      );
    });

    it.each(ALL_CASES)(
      "archived refuses everyone — $name",
      ({ visibility, status, role }) => {
        // Archiving is one-way and makes the group read-only. Nobody posts into
        // an archived group, not even an active owner.
        expect(
          canPostInGroup(
            group(visibility, { archivedAt: new Date() }),
            membership(status, role),
          ),
        ).toBe(false);
      },
    );

    it("never admits anyone canReadGroup refuses", () => {
      // The one invariant tying the two together: posting must not be a way
      // around reading.
      for (const { visibility, status, role } of ALL_CASES) {
        const g = group(visibility);
        const m = membership(status, role);
        if (canPostInGroup(g, m)) expect(canReadGroup(g, m)).toBe(true);
      }
    });
  });

  // -------------------------------------------------------------------------
  // canSelfActivate — finding #2. ONLY an `invited` row, on ANY group.
  // -------------------------------------------------------------------------
  describe("canSelfActivate", () => {
    const EXPECTED: Record<StatusKey, boolean> = {
      // Somebody else's standing decision to admit this person.
      invited: true,
      // Everything else is either already settled or nobody's decision at all.
      // `pending` is the load-bearing `false`: an unapproved self-application
      // is NEVER self-activatable, on any group, whatever its history.
      active: false,
      pending: false,
      removed: false,
      banned: false,
      none: false,
    };

    it.each(ALL_CASES)("$name", ({ status, role }) => {
      expect(canSelfActivate(membership(status, role))).toBe(EXPECTED[status]);
    });

    it("gives the same answer whatever the group is", () => {
      // Finding #2 was `join` disambiguating invited-vs-pending by reading
      // `visibility` — a MUTABLE column, so an owner flipping a public
      // request-to-join group to private converted its unvetted applicant queue
      // into a guest list. The fix is structural: the function takes no group,
      // so there is nothing group-shaped to read. This test exists to fail
      // loudly at the type level if a group parameter is ever added back.
      expect(canSelfActivate.length).toBe(1);
    });
  });

  // -------------------------------------------------------------------------
  // canSelfJoinWithoutInvite — finding #1. The mirror of canReadGroup.
  // -------------------------------------------------------------------------
  describe("canSelfJoinWithoutInvite", () => {
    it("allows public and refuses private", () => {
      // Finding #1: `get` refused a private group to non-members while `join`
      // never checked visibility, so anyone holding a leaked group id could
      // self-join. `visibility` and `joinPolicy` are independent enums, so
      // private+open is directly creatable and this cannot be inferred from the
      // policy.
      expect(canSelfJoinWithoutInvite(group("public"))).toBe(true);
      expect(canSelfJoinWithoutInvite(group("private"))).toBe(false);
    });

    it("refuses to join exactly what canReadGroup refuses to show", () => {
      // The invariant behind finding #1: a stranger who cannot READ a group
      // must not be able to JOIN it. Checked for the stranger case (no row),
      // which is the one an id-holder is in.
      for (const visibility of VISIBILITIES) {
        expect(canSelfJoinWithoutInvite(group(visibility))).toBe(
          canReadGroup(group(visibility), null),
        );
      }
    });
  });

  // -------------------------------------------------------------------------
  // Status whitelists.
  // -------------------------------------------------------------------------
  describe("isLiveMembershipStatus", () => {
    // The statuses `leave` / `removeMember` may move a person OUT of. A
    // WHITELIST: `banned` is absent so a banned user cannot launder their ban
    // into `removed` by "leaving" and then rejoin, and a mod cannot undo an
    // owner's ban by "removing" them.
    const EXPECTED: Record<StatusKey, boolean> = {
      active: true,
      invited: true,
      pending: true,
      removed: false,
      banned: false,
      none: false,
    };

    it.each(STATUSES)("%s", (status) => {
      expect(
        isLiveMembershipStatus(status === "none" ? undefined : status),
      ).toBe(EXPECTED[status]);
    });

    it("refuses a status nobody has heard of", () => {
      // A sixth status added later is refused by default rather than silently
      // accepted — the whole point of the whitelist.
      expect(isLiveMembershipStatus("suspended")).toBe(false);
    });
  });

  describe("isDepartedStatus", () => {
    const EXPECTED: Record<StatusKey, boolean> = {
      active: false,
      invited: false,
      pending: false,
      removed: true,
      banned: true,
      none: false,
    };

    it.each(STATUSES)("%s", (status) => {
      expect(isDepartedStatus(status === "none" ? undefined : status)).toBe(
        EXPECTED[status],
      );
    });

    it("is exactly the complement of isLiveMembershipStatus over real statuses", () => {
      // The two whitelists must partition the five real statuses with no gap
      // and no overlap: a status that is neither live nor departed would be
      // invisible to `leave` and to the owner-drift rule at the same time.
      for (const status of STATUSES) {
        if (status === "none") continue;
        expect(isDepartedStatus(status)).toBe(!isLiveMembershipStatus(status));
      }
    });
  });
});
