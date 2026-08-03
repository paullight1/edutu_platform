import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from "@nestjs/common";
import { z } from "zod";
import { CurrentUser } from "../auth/current-user.decorator";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import {
  CreateGroupSchema,
  GroupFormSchema,
  JoinRequestSchema,
  ReportSchema,
  SendMessageSchema,
  UpdateGroupSchema,
  type CreateGroupDto,
  type GroupFormDto,
  type JoinRequestDto,
  type ReportDto,
  type SendMessageDto,
  type UpdateGroupDto,
} from "./dto/community.dto";
import { FormsService, type JoinRequestFilter } from "./forms.service";
import { GroupsService } from "./groups.service";
import { MessagesService } from "./messages.service";
import { ModerationService } from "./moderation.service";

/**
 * Small bodies that exist only at the HTTP edge — one field each, consumed by
 * exactly one route, and never referenced by a service. They live here rather
 * than in `dto/community.dto.ts` so that file stays the shared vocabulary the
 * mobile client is typed against.
 */
const InviteSchema = z.object({
  userId: z.string().trim().min(1, "Tell us who to invite."),
});
type InviteDto = z.infer<typeof InviteSchema>;

const MemberRoleSchema = z.object({
  role: z.enum(["owner", "mod", "member"]),
});
type MemberRoleDto = z.infer<typeof MemberRoleSchema>;

const DecisionSchema = z.object({
  decision: z.enum(["approved", "rejected"]),
});
type DecisionDto = z.infer<typeof DecisionSchema>;

/**
 * EVERY HANDLER TAKES `@CurrentUser("authId")`.
 *
 * `ClerkAuthGuard` puts two identifiers on the request: `id`, which is
 * `toDatabaseUserId(payload.sub)` — a uuid DERIVED from the subject for the
 * older, uuid-keyed tables — and `authId`, the raw Clerk subject itself. All
 * six `community_*` tables key on the RAW subject, and their RLS policies
 * compare it against `auth.jwt() ->> 'sub'`.
 *
 * Reaching for `id` here compiles, type-checks, and writes rows that no client
 * can ever read back: a member posts a message, the insert succeeds, and the
 * message is invisible to them because the row's `user_id` is a uuid the
 * policy will never match. There is no error to notice. The first test in
 * `communities.controller.spec.ts` exists to catch exactly this.
 */
@Controller("communities")
export class CommunitiesController {
  constructor(
    private readonly groups: GroupsService,
    private readonly messages: MessagesService,
    private readonly forms: FormsService,
    private readonly moderation: ModerationService,
  ) {}

  // -------------------------------------------------------------------------
  // Groups
  // -------------------------------------------------------------------------

  /**
   * Returns `{ group, membership }[]` — the SAME shape as `getGroup`, one per
   * row. The membership is what makes an invitation reachable at all: a private
   * group cannot be self-joined, so entry is always via an `invited` row, and a
   * list of bare groups gave the invitee nowhere to see it.
   *
   * `mine=true` means "every group I have a live relationship with" — joined,
   * invited, or applied — not "joined" alone; the membership field lets the
   * screen label which. See `GroupListFilter.mine`.
   */
  @Get("groups")
  listGroups(
    @CurrentUser("authId") userId: string,
    @Query("mine") mine?: string,
    @Query("opportunityId") opportunityId?: string,
    @Query("query") query?: string,
    @Query("limit") limit?: string,
  ) {
    return this.groups.list(userId, {
      mine: this.parseBoolean(mine),
      opportunityId: opportunityId?.trim() || undefined,
      query: query?.trim() || undefined,
      limit: this.parseLimit(limit),
    });
  }

  /**
   * Returns `{ group, membership }` — deliberately NOT flattened. The mobile
   * join gate decides between "Join", "Request to join", "Pending" and the
   * message composer from the membership row, and it is typed against both
   * halves; spreading the membership onto the group would collide on `id` and
   * `role` and silently hand the screen the wrong ones.
   */
  @Get("groups/:id")
  getGroup(@CurrentUser("authId") userId: string, @Param("id") id: string) {
    return this.groups.get(userId, id);
  }

  @Post("groups")
  createGroup(
    @CurrentUser("authId") userId: string,
    @Body(new ZodValidationPipe(CreateGroupSchema)) dto: CreateGroupDto,
  ) {
    return this.groups.create(userId, dto);
  }

  @Patch("groups/:id")
  updateGroup(
    @CurrentUser("authId") userId: string,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(UpdateGroupSchema)) dto: UpdateGroupDto,
  ) {
    return this.groups.update(userId, id, dto);
  }

  /**
   * Join, or accept a standing invitation.
   *
   * The answers are graded against the group's form BEFORE the request is
   * written: `JoinRequestSchema` only checks each answer is a short
   * `{ id, value }` pair, so without this a `required` question could go
   * unanswered and the screening form would not screen. `validateAnswers`
   * carries the same `canReadGroup` gate as every other read of the form, so a
   * private group refuses the caller here exactly as `join` would.
   */
  @Post("groups/:id/join")
  async joinGroup(
    @CurrentUser("authId") userId: string,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(JoinRequestSchema)) dto: JoinRequestDto,
  ) {
    const answers = dto?.answers ?? [];
    await this.forms.validateAnswers(userId, id, answers);
    return this.groups.join(userId, id, answers);
  }

  /** Owner only, and irreversible — there is deliberately no unarchive. */
  @Post("groups/:id/archive")
  archiveGroup(@CurrentUser("authId") userId: string, @Param("id") id: string) {
    return this.groups.archive(userId, id);
  }

  /**
   * Owner or mod. **The only entry path into a private group** — a private
   * group can never be self-joined whatever its `joinPolicy` says, so without
   * this route private groups would be unjoinable by anybody, including the
   * people their owner wants in.
   */
  @Post("groups/:id/invite")
  inviteToGroup(
    @CurrentUser("authId") userId: string,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(InviteSchema)) dto: InviteDto,
  ) {
    return this.groups.invite(userId, id, dto.userId);
  }

  @Patch("groups/:id/members/:uid/role")
  setMemberRole(
    @CurrentUser("authId") userId: string,
    @Param("id") id: string,
    @Param("uid") targetUserId: string,
    @Body(new ZodValidationPipe(MemberRoleSchema)) dto: MemberRoleDto,
  ) {
    return this.groups.setMemberRole(userId, id, targetUserId, dto.role);
  }

  /**
   * Leave, or — for an owner or mod — remove somebody else. `removeMember`
   * routes a self-removal into `leave` itself, including the only-owner guard,
   * so one route serves both and the two can never disagree.
   */
  @Delete("groups/:id/members/:uid")
  removeMember(
    @CurrentUser("authId") userId: string,
    @Param("id") id: string,
    @Param("uid") targetUserId: string,
  ) {
    return this.groups.removeMember(userId, id, targetUserId);
  }

  // -------------------------------------------------------------------------
  // Screening form and the applicant queue
  // -------------------------------------------------------------------------

  @Get("groups/:id/form")
  getForm(@CurrentUser("authId") userId: string, @Param("id") id: string) {
    return this.forms.getForm(userId, id);
  }

  @Post("groups/:id/form")
  setForm(
    @CurrentUser("authId") userId: string,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(GroupFormSchema)) dto: GroupFormDto,
  ) {
    return this.forms.setForm(userId, id, dto);
  }

  /** Owner or mod. Defaults to the pending queue; `all` is the history. */
  @Get("groups/:id/requests")
  listRequests(
    @CurrentUser("authId") userId: string,
    @Param("id") id: string,
    @Query("status") status?: string,
  ) {
    return this.forms.listRequests(
      userId,
      id,
      (status?.trim() || "pending") as JoinRequestFilter,
    );
  }

  /**
   * `:rid` IS A REQUEST ID, NOT A GROUP ID. The group in `:id` is the one the
   * client navigated from; `decide` resolves the group from the request row
   * itself and authorizes against that, so a mismatched pair cannot be used to
   * approve somebody into a group the caller does not administer.
   */
  @Post("groups/:id/requests/:rid")
  decideRequest(
    @CurrentUser("authId") userId: string,
    @Param("rid") requestId: string,
    @Body(new ZodValidationPipe(DecisionSchema)) dto: DecisionDto,
  ) {
    return this.forms.decide(userId, requestId, dto.decision);
  }

  // -------------------------------------------------------------------------
  // Messages
  // -------------------------------------------------------------------------

  /**
   * A KEYSET cursor, so `beforeId` is forwarded and not dropped. Two messages
   * written in one transaction share an exact `created_at`; paging on the
   * timestamp alone either repeats them forever or skips them silently,
   * depending on which way the comparison leans.
   */
  @Get("groups/:id/messages")
  listMessages(
    @CurrentUser("authId") userId: string,
    @Param("id") id: string,
    @Query("before") before?: string,
    @Query("beforeId") beforeId?: string,
    @Query("limit") limit?: string,
  ) {
    return this.messages.list(userId, id, {
      before: this.parseBefore(before),
      beforeId: beforeId?.trim() || undefined,
      limit: this.parseLimit(limit),
    });
  }

  @Post("groups/:id/messages")
  sendMessage(
    @CurrentUser("authId") userId: string,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(SendMessageSchema)) dto: SendMessageDto,
  ) {
    return this.messages.send(userId, id, dto);
  }

  @Delete("messages/:id")
  deleteMessage(
    @CurrentUser("authId") userId: string,
    @Param("id") id: string,
  ) {
    return this.messages.softDelete(userId, id);
  }

  // -------------------------------------------------------------------------
  // Moderation
  // -------------------------------------------------------------------------

  @Post("reports")
  report(
    @CurrentUser("authId") userId: string,
    @Body(new ZodValidationPipe(ReportSchema)) dto: ReportDto,
  ) {
    return this.moderation.report(userId, dto);
  }

  // -------------------------------------------------------------------------
  // Query-string helpers
  // -------------------------------------------------------------------------

  /** Query strings have no booleans; `?mine` with no value means true. */
  private parseBoolean(value: string | undefined): boolean | undefined {
    if (value === undefined) return undefined;
    const normalized = value.trim().toLowerCase();
    if (normalized === "" || normalized === "true" || normalized === "1") {
      return true;
    }
    return false;
  }

  private parseLimit(value: string | undefined): number | undefined {
    if (value === undefined || value.trim() === "") return undefined;
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      throw new BadRequestException("Ask for a positive number of results.");
    }
    return Math.floor(parsed);
  }

  /**
   * An unparseable cursor is refused rather than silently ignored: dropping it
   * would restart the page at the newest message, and the client — which is
   * appending — would show the same block of history over and over.
   */
  private parseBefore(value: string | undefined): Date | undefined {
    if (value === undefined || value.trim() === "") return undefined;
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      throw new BadRequestException("That page of messages isn't valid.");
    }
    return parsed;
  }
}
