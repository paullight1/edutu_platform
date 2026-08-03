import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
} from "@nestjs/common";
import { and, asc, eq, sql } from "drizzle-orm";
import { db } from "../db";
import {
  communityGroupForms,
  communityGroupMembers,
  communityGroups,
  communityJoinRequests,
  type CommunityGroup,
  type CommunityGroupMember,
} from "../db/schema";
import {
  canReadGroup,
  resolveAdminRole,
  type MemberRole,
} from "./community-authz";
import type { GroupFormDto, GroupQuestionDto } from "./dto/community.dto";

export type { CommunityGroup, CommunityGroupMember };
export type CommunityGroupForm = typeof communityGroupForms.$inferSelect;
export type CommunityJoinRequest = typeof communityJoinRequests.$inferSelect;

/**
 * `community_join_requests.status`. **A DIFFERENT ENUM** from
 * `community_group_members.status` (`active|invited|pending|removed|banned`),
 * and the two are easy to confuse because both spell `pending`. A request's
 * `pending` is "nobody has looked at this yet"; a member row's `pending` is
 * "this person applied and is unapproved". Approving moves BOTH: the request to
 * `approved`, and the member row to `active`.
 */
export type JoinRequestStatus = "pending" | "approved" | "rejected";

/** What `listRequests` may be asked for. `all` is the decided history too. */
export type JoinRequestFilter = JoinRequestStatus | "all";

const JOIN_REQUEST_STATUSES: readonly JoinRequestStatus[] = [
  "pending",
  "approved",
  "rejected",
];

/**
 * What `setForm` writes. The SERVICE decides these values and the store only
 * applies them — the same rule `MessagePatch` follows in messages.service.ts.
 * A rule that lives in the adapter can only ever be tested against a
 * reimplementation of itself in the spec's double.
 */
export type FormPatch = {
  questions: unknown[];
  updatedAt: Date;
};

/** The three columns a decision writes onto the request row. */
export type JoinRequestDecision = {
  status: "approved" | "rejected";
  decidedBy: string;
  decidedAt: Date;
};

/**
 * The member row an approval activates, decided in full by the service: which
 * group, which person, which role they keep, and the `active` status itself.
 * `null` on a rejection — a rejected applicant's membership is not touched.
 */
export type MemberActivation = {
  groupId: string;
  userId: string;
  role: string;
  status: "active";
};

export type DecideRequestInput = {
  requestId: string;
  decision: JoinRequestDecision;
  activate: MemberActivation | null;
};

export type DecideRequestResult = {
  request: CommunityJoinRequest;
  membership: CommunityGroupMember | null;
};

/**
 * The persistence boundary, mirroring `GroupsStore` and `MessagesStore`: the
 * service depends on this, not on Drizzle, so the spec can hand it a plain
 * in-memory double instead of mocking a query-builder chain call by call.
 * Every method is a dumb applier — none of them decides *what* to write.
 */
export interface FormsStore {
  findGroup(groupId: string): Promise<CommunityGroup | null>;
  findMembership(
    groupId: string,
    userId: string,
  ): Promise<CommunityGroupMember | null>;
  findForm(groupId: string): Promise<CommunityGroupForm | null>;
  upsertForm(groupId: string, patch: FormPatch): Promise<CommunityGroupForm>;
  /** `null` status means every request, whatever it was decided as. */
  listRequests(
    groupId: string,
    status: JoinRequestStatus | null,
  ): Promise<CommunityJoinRequest[]>;
  findRequest(requestId: string): Promise<CommunityJoinRequest | null>;
  /**
   * Decides the request and, when `activate` is present, moves the member row
   * to `active` — in ONE transaction. Split in two, an approval whose second
   * half failed would leave an "approved" request behind an applicant who still
   * cannot post, and nothing would ever reconcile them: the request is no
   * longer `pending`, so it has left the only queue anybody looks at.
   */
  decideRequest(input: DecideRequestInput): Promise<DecideRequestResult>;
}

/** Token so the module can swap the store without touching the service. */
export const FORMS_STORE = Symbol("FORMS_STORE");

// ---------------------------------------------------------------------------
// Drizzle-backed store
// ---------------------------------------------------------------------------

export class DrizzleFormsStore implements FormsStore {
  async findGroup(groupId: string): Promise<CommunityGroup | null> {
    const [row] = await db
      .select()
      .from(communityGroups)
      .where(eq(communityGroups.id, groupId))
      .limit(1);
    return row ?? null;
  }

  async findMembership(
    groupId: string,
    userId: string,
  ): Promise<CommunityGroupMember | null> {
    const [row] = await db
      .select()
      .from(communityGroupMembers)
      .where(
        and(
          eq(communityGroupMembers.groupId, groupId),
          eq(communityGroupMembers.userId, userId),
        ),
      )
      .limit(1);
    return row ?? null;
  }

  async findForm(groupId: string): Promise<CommunityGroupForm | null> {
    const [row] = await db
      .select()
      .from(communityGroupForms)
      .where(eq(communityGroupForms.groupId, groupId))
      .limit(1);
    return row ?? null;
  }

  /** Applies exactly the patch it is handed; it decides nothing itself. */
  async upsertForm(
    groupId: string,
    patch: FormPatch,
  ): Promise<CommunityGroupForm> {
    const [row] = await db
      .insert(communityGroupForms)
      .values({
        groupId,
        questions: patch.questions,
        updatedAt: patch.updatedAt,
      })
      .onConflictDoUpdate({
        target: communityGroupForms.groupId,
        set: { questions: patch.questions, updatedAt: patch.updatedAt },
      })
      .returning();
    return row;
  }

  async listRequests(
    groupId: string,
    status: JoinRequestStatus | null,
  ): Promise<CommunityJoinRequest[]> {
    const conditions = [eq(communityJoinRequests.groupId, groupId)];
    if (status) conditions.push(eq(communityJoinRequests.status, status));
    return db
      .select()
      .from(communityJoinRequests)
      .where(and(...conditions))
      .orderBy(asc(communityJoinRequests.createdAt));
  }

  async findRequest(requestId: string): Promise<CommunityJoinRequest | null> {
    const [row] = await db
      .select()
      .from(communityJoinRequests)
      .where(eq(communityJoinRequests.id, requestId))
      .limit(1);
    return row ?? null;
  }

  async decideRequest(input: DecideRequestInput): Promise<DecideRequestResult> {
    return db.transaction(async (tx) => {
      const [request] = await tx
        .update(communityJoinRequests)
        .set({
          status: input.decision.status,
          decidedBy: input.decision.decidedBy,
          decidedAt: input.decision.decidedAt,
        })
        .where(eq(communityJoinRequests.id, input.requestId))
        .returning();
      if (!request) throw new NotFoundException("That request was not found.");
      if (!input.activate) return { request, membership: null };

      const activate = input.activate;
      // The same group-scoped advisory lock `GroupsStore.transitionMembership`
      // takes, for the same reason: member_count is a check-then-write over a
      // row this transaction is about to change, and two approvals racing on
      // one applicant would otherwise both read "not active" and both
      // increment.
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtext(${`community_group_members:${activate.groupId}`}))`,
      );
      const [existing] = await tx
        .select()
        .from(communityGroupMembers)
        .where(
          and(
            eq(communityGroupMembers.groupId, activate.groupId),
            eq(communityGroupMembers.userId, activate.userId),
          ),
        )
        .limit(1)
        .for("update");
      const wasActive = existing?.status === "active";

      const [membership] = await tx
        .insert(communityGroupMembers)
        .values({
          groupId: activate.groupId,
          userId: activate.userId,
          role: activate.role,
          status: activate.status,
        })
        .onConflictDoUpdate({
          target: [communityGroupMembers.groupId, communityGroupMembers.userId],
          set: { role: activate.role, status: activate.status },
        })
        .returning();

      if (!wasActive) {
        await tx
          .update(communityGroups)
          .set({ memberCount: sql`${communityGroups.memberCount} + 1` })
          .where(eq(communityGroups.id, activate.groupId));
      }
      return { request, membership };
    });
  }
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** What `getForm` hands back for a group that has never set one. */
export type ResolvedForm = {
  groupId: string;
  questions: unknown[];
  updatedAt: Date | null;
};

/**
 * The screening form and the queue it feeds.
 *
 * Deliberately does NOT import `GroupsService` or `MessagesService` — the
 * former posts `kind='system'` messages through the latter, so any edge into
 * that pair risks a cycle. The tables are read directly and every
 * authorization question is asked of `community-authz.ts`, which is the point
 * of that module: this service and `GroupsService` cannot drift about who may
 * read a group, because they call the same function to find out.
 */
@Injectable()
export class FormsService {
  private readonly store: FormsStore;

  constructor(@Optional() @Inject(FORMS_STORE) store?: FormsStore) {
    this.store = store ?? new DrizzleFormsStore();
  }

  /**
   * The group's custom questions.
   *
   * Readable exactly when the GROUP is readable, via the shared `canReadGroup`
   * — a prospective joiner must be able to read the questions in order to
   * answer them, and gating this on membership would make every
   * request-to-join form unanswerable by the only people who need it.
   */
  async getForm(userId: string, groupId: string): Promise<ResolvedForm> {
    const readerId = this.requireUserId(userId);
    const group = await this.requireGroup(groupId);
    const membership = await this.store.findMembership(groupId, readerId);
    if (!canReadGroup(group, membership)) {
      throw new ForbiddenException(
        "This group is private. Ask an owner for an invite.",
      );
    }

    const form = await this.store.findForm(groupId);
    // A group with no row has no questions — that is not a 404. Returning the
    // empty form means the join screen renders "no questions, just tap join"
    // instead of an error for the overwhelmingly common case.
    if (!form) return { groupId, questions: [], updatedAt: null };
    return {
      groupId,
      questions: this.asQuestionArray(form.questions),
      updatedAt: form.updatedAt,
    };
  }

  /**
   * Replace the group's questions. Owner only: the form decides who gets into
   * the group, so it sits with archiving and role changes rather than with the
   * day-to-day moderation a mod does.
   */
  async setForm(
    actorId: string,
    groupId: string,
    dto: GroupFormDto,
  ): Promise<ResolvedForm> {
    const acting = this.requireUserId(actorId);
    const group = await this.requireGroup(groupId);
    await this.assertIsOwner(
      acting,
      group,
      "Only an owner can change this group's questions.",
    );
    if (group.archivedAt) {
      throw new BadRequestException(
        "This group has been archived, so its questions can't be changed.",
      );
    }

    const questions = dto?.questions ?? [];
    // Zod caps the list at 5 and validates each question, but it cannot see
    // across them: two questions sharing an id makes every answer ambiguous,
    // because `JoinRequestSchema` keys answers on exactly this id.
    const ids = new Set(questions.map((question) => question.id));
    if (ids.size !== questions.length) {
      throw new BadRequestException("Each question needs its own id.");
    }

    const row = await this.store.upsertForm(groupId, {
      questions,
      // The timestamp is the service's decision, not the column default's, so
      // the store stays a dumb applier and the spec can observe the value.
      updatedAt: new Date(),
    });
    return {
      groupId,
      questions: this.asQuestionArray(row.questions),
      updatedAt: row.updatedAt,
    };
  }

  /**
   * The applicant queue. **Owner OR MOD** — an earlier review found the `mod`
   * role was cosmetic precisely because the queue it exists to review was
   * owner-only, so a moderator could delete messages but never decide who was
   * allowed to post them.
   *
   * Defaults to `pending`, which is what a queue means; `all` is available for
   * a history view.
   */
  async listRequests(
    actorId: string,
    groupId: string,
    status: JoinRequestFilter = "pending",
  ): Promise<CommunityJoinRequest[]> {
    const acting = this.requireUserId(actorId);
    const group = await this.requireGroup(groupId);
    await this.assertCanAdminister(
      acting,
      group,
      "You're not allowed to review who joins this group.",
    );
    if (status !== "all" && !JOIN_REQUEST_STATUSES.includes(status)) {
      throw new BadRequestException(
        "Ask for pending, approved, rejected, or all requests.",
      );
    }
    return this.store.listRequests(groupId, status === "all" ? null : status);
  }

  /**
   * Approve or reject one application. Owner or mod.
   *
   * **On approval the MEMBER row becomes `active`.** This is the only
   * sanctioned path from a `pending` member row to `active`: `canSelfActivate`
   * admits `invited` alone, precisely so an unvetted applicant can never
   * activate themselves, which leaves this method as the single door and this
   * line as the whole of it.
   */
  async decide(
    actorId: string,
    requestId: string,
    decision: "approved" | "rejected",
  ): Promise<DecideRequestResult> {
    const acting = this.requireUserId(actorId);
    this.assertUuid(requestId, "request");
    if (decision !== "approved" && decision !== "rejected") {
      throw new BadRequestException("You can approve or reject a request.");
    }

    const request = await this.store.findRequest(requestId);
    if (!request) throw new NotFoundException("That request was not found.");

    const group = await this.requireGroup(request.groupId);
    await this.assertCanAdminister(
      acting,
      group,
      "You're not allowed to review who joins this group.",
    );

    if (request.status !== "pending") {
      throw new BadRequestException(
        "That request has already been reviewed. Refresh the queue to see the decision.",
      );
    }

    let activate: MemberActivation | null = null;
    if (decision === "approved") {
      // Lifecycle gates on the ADMISSION only — a rejection stays available so
      // an owner can still clear the queue of a group that has closed.
      if (group.archivedAt) {
        throw new BadRequestException(
          "This group has been archived, so nobody else can be let into it.",
        );
      }
      if (group.expiresAt && group.expiresAt.getTime() < Date.now()) {
        throw new BadRequestException(
          "This group has closed because its deadline has passed, so nobody else can be let into it.",
        );
      }

      const target = await this.store.findMembership(
        request.groupId,
        request.userId,
      );
      // A ban is a moderator's decision and outranks a stale application. Left
      // out, approving an old queue entry would silently readmit a banned
      // member — the same laundering `leave` and `removeMember` refuse.
      if (target?.status === "banned") {
        throw new BadRequestException(
          "That person is banned from this group. Unban them before letting them in.",
        );
      }

      activate = {
        groupId: request.groupId,
        userId: request.userId,
        role: this.roleOnActivation(target),
        status: "active",
      };
    }

    // Rejection deliberately leaves the member row alone. A `pending` member
    // row confers nothing — it cannot read a private group, cannot post, and is
    // not counted — and rewriting it to `removed` would only make the person's
    // re-application (an UPSERT back to `pending`) look like a returning
    // ex-member rather than the second attempt it is.
    return this.store.decideRequest({
      requestId,
      decision: { status: decision, decidedBy: acting, decidedAt: new Date() },
      activate,
    });
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  private async requireGroup(groupId: string): Promise<CommunityGroup> {
    this.assertUuid(groupId, "group");
    const group = await this.store.findGroup(groupId);
    if (!group) throw new NotFoundException("That group was not found.");
    return group;
  }

  /** Owner or mod, via the shared predicate — never a local copy of it. */
  private async assertCanAdminister(
    userId: string,
    group: CommunityGroup,
    message: string,
  ): Promise<MemberRole> {
    const membership = await this.store.findMembership(group.id, userId);
    const role = resolveAdminRole(group, userId, membership);
    if (!role) throw new ForbiddenException(message);
    return role;
  }

  private async assertIsOwner(
    userId: string,
    group: CommunityGroup,
    message: string,
  ): Promise<void> {
    const role = await this.assertCanAdminister(userId, group, message);
    if (role !== "owner") throw new ForbiddenException(message);
  }

  /**
   * The role an approved applicant keeps, matching `GroupsService`'s rule: a
   * live row (`invited` / `pending`) keeps whatever role an owner already gave
   * it, and anything else — no row, or a `removed` one — starts again as a
   * plain member so a former owner cannot recover their powers by reapplying.
   */
  private roleOnActivation(existing: CommunityGroupMember | null): string {
    if (existing?.status === "invited" || existing?.status === "pending") {
      return existing.role;
    }
    return "member";
  }

  /** `questions` is `jsonb`, so the driver hands back `unknown`. */
  private asQuestionArray(questions: unknown): GroupQuestionDto[] {
    return Array.isArray(questions) ? (questions as GroupQuestionDto[]) : [];
  }

  private requireUserId(userId: string): string {
    // Raw Clerk subject, never toDatabaseUserId: these columns are `text` and
    // the RLS policies compare them straight against auth.jwt() ->> 'sub'.
    const trimmed = (userId || "").trim();
    if (!trimmed) throw new BadRequestException("You need to be signed in.");
    return trimmed;
  }

  private assertUuid(value: string, label: string): void {
    if (!UUID_PATTERN.test(value)) {
      throw new BadRequestException(`That ${label} link isn't valid.`);
    }
  }
}
