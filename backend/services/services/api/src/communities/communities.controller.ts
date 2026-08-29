import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
} from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { z } from "zod";
import { CurrentUser } from "../auth/current-user.decorator";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { communityThrottle } from "./community-throttle";
import { CreationRequestsService } from "./creation-requests.service";
import {
  CommunityAttachmentUploadSchema,
  CommunityGroupImageUploadSchema,
  CreateGroupSchema,
  GroupFormSchema,
  JoinRequestSchema,
  ReportSchema,
  PinMessageSchema,
  SendCommentSchema,
  SendMessageSchema,
  UpdateGroupSchema,
  type CreateGroupDto,
  type CommunityAttachmentUploadDto,
  type CommunityGroupImageUploadDto,
  type GroupFormDto,
  type JoinRequestDto,
  type ReportDto,
  type PinMessageDto,
  type SendCommentDto,
  type SendMessageDto,
  type UpdateGroupDto,
} from "./dto/community.dto";
import {
  CreateCommunityRequestSchema,
  UpdateCommunityRequestCoverSchema,
  type CreateCommunityRequestDto,
  type UpdateCommunityRequestCoverDto,
} from "./dto/creation-request.dto";
import { FormsService, type JoinRequestFilter } from "./forms.service";
import { CommunityContentService } from "./content.service";
import { GroupsService, type CommunityMemberCursor } from "./groups.service";
import { MessagesService } from "./messages.service";
import { ModerationService } from "./moderation.service";

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

const BlockSchema = z.object({
  userId: z.string().trim().min(1, "Tell us who to block."),
});
type BlockDto = z.infer<typeof BlockSchema>;

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
    private readonly content: CommunityContentService,
    private readonly creationRequests?: CreationRequestsService,
  ) {}

  @Post("creation-requests")
  @Throttle(communityThrottle("createGroup"))
  submitCreationRequest(
    @CurrentUser("authId") userId: string,
    @Body(new ZodValidationPipe(CreateCommunityRequestSchema))
    dto: CreateCommunityRequestDto,
  ) {
    return this.requestService().submit(userId, dto);
  }

  @Get("creation-requests/mine")
  listMyCreationRequests(@CurrentUser("authId") userId: string) {
    return this.requestService().listMine(userId);
  }

  @Post("creation-requests/:id/cancel")
  @Throttle(communityThrottle("mutateMembership"))
  cancelCreationRequest(
    @CurrentUser("authId") userId: string,
    @Param("id") id: string,
  ) {
    return this.requestService().cancel(userId, id);
  }

  @Patch("creation-requests/:id/cover-image")
  @Throttle(communityThrottle("uploadReservation"))
  setCreationRequestCover(
    @CurrentUser("authId") userId: string,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(UpdateCommunityRequestCoverSchema))
    dto: UpdateCommunityRequestCoverDto,
  ) {
    return this.requestService().setCoverImage(
      userId,
      id,
      dto.coverImageResourceUrl,
    );
  }

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

  @Get("discovery")
  discovery(
    @CurrentUser("authId") userId: string,
    @Query("limit") limit?: string,
  ) {
    return this.groups.discovery(userId, this.parseLimit(limit));
  }

  @Get("groups/:id")
  getGroup(@CurrentUser("authId") userId: string, @Param("id") id: string) {
    return this.groups.get(userId, id);
  }

  @Get("groups/:id/members")
  listGroupMembers(
    @CurrentUser("authId") userId: string,
    @Param("id") id: string,
    @Query("limit") limit?: string,
    @Query("afterRole") afterRole?: string,
    @Query("afterJoinedAt") afterJoinedAt?: string,
    @Query("afterId") afterId?: string,
  ) {
    return this.groups.listMembers(
      userId,
      id,
      this.parseLimit(limit),
      this.parseMemberCursor(afterRole, afterJoinedAt, afterId),
    );
  }

  @Post("groups")
  @Throttle(communityThrottle("createGroup"))
  createGroup(
    @CurrentUser("authId") _userId: string,
    @Body(new ZodValidationPipe(CreateGroupSchema)) _dto: CreateGroupDto,
  ) {
    throw new ConflictException({
      statusCode: 409,
      code: "COMMUNITY_CREATION_REVIEW_REQUIRED",
      message:
        "Community creation now requires review. Update Edutu and submit a community request.",
    });
  }

  @Patch("groups/:id")
  @Throttle(communityThrottle("mutateMembership"))
  updateGroup(
    @CurrentUser("authId") userId: string,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(UpdateGroupSchema)) dto: UpdateGroupDto,
  ) {
    return this.groups.update(userId, id, dto);
  }

  @Post("groups/:id/cover-image/upload-url")
  @Throttle(communityThrottle("uploadReservation"))
  createGroupCoverImageUpload(
    @CurrentUser("authId") userId: string,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(CommunityGroupImageUploadSchema))
    dto: CommunityGroupImageUploadDto,
  ) {
    return this.groups.createCoverImageUpload(userId, id, dto);
  }

  @Post("groups/:id/join")
  @Throttle(communityThrottle("joinGroup"))
  async joinGroup(
    @CurrentUser("authId") userId: string,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(JoinRequestSchema)) dto: JoinRequestDto,
  ) {
    const answers = dto?.answers ?? [];
    await this.forms.validateAnswers(userId, id, answers);
    return this.groups.join(userId, id, answers);
  }

  @Post("groups/:id/archive")
  @Throttle(communityThrottle("mutateMembership"))
  archiveGroup(@CurrentUser("authId") userId: string, @Param("id") id: string) {
    return this.groups.archive(userId, id);
  }

  @Post("groups/:id/invite")
  @Throttle(communityThrottle("inviteMember"))
  inviteToGroup(
    @CurrentUser("authId") userId: string,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(InviteSchema)) dto: InviteDto,
  ) {
    return this.groups.invite(userId, id, dto.userId);
  }

  @Patch("groups/:id/members/:uid/role")
  @Throttle(communityThrottle("mutateMembership"))
  setMemberRole(
    @CurrentUser("authId") userId: string,
    @Param("id") id: string,
    @Param("uid") targetUserId: string,
    @Body(new ZodValidationPipe(MemberRoleSchema)) dto: MemberRoleDto,
  ) {
    return this.groups.setMemberRole(userId, id, targetUserId, dto.role);
  }

  @Delete("groups/:id/members/:uid")
  @Throttle(communityThrottle("mutateMembership"))
  removeMember(
    @CurrentUser("authId") userId: string,
    @Param("id") id: string,
    @Param("uid") targetUserId: string,
  ) {
    return this.groups.removeMember(userId, id, targetUserId);
  }

  @Get("groups/:id/form")
  getForm(@CurrentUser("authId") userId: string, @Param("id") id: string) {
    return this.forms.getForm(userId, id);
  }

  @Post("groups/:id/form")
  @Throttle(communityThrottle("mutateMembership"))
  setForm(
    @CurrentUser("authId") userId: string,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(GroupFormSchema)) dto: GroupFormDto,
  ) {
    return this.forms.setForm(userId, id, dto);
  }

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

  @Post("groups/:id/requests/:rid")
  @Throttle(communityThrottle("mutateMembership"))
  decideRequest(
    @CurrentUser("authId") userId: string,
    @Param("rid") requestId: string,
    @Body(new ZodValidationPipe(DecisionSchema)) dto: DecisionDto,
  ) {
    return this.forms.decide(userId, requestId, dto.decision);
  }

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

  @Get("groups/:id/pinned-post")
  getPinnedPost(
    @CurrentUser("authId") userId: string,
    @Param("id") id: string,
  ) {
    return this.messages.getPinnedPreview(userId, id);
  }

  @Get("groups/:id/posts/:postId")
  getPostThread(
    @CurrentUser("authId") userId: string,
    @Param("id") id: string,
    @Param("postId") postId: string,
  ) {
    return this.messages.getPostThread(userId, id, postId);
  }

  @Get("groups/:id/resources")
  listResources(
    @CurrentUser("authId") userId: string,
    @Param("id") id: string,
    @Query("before") before?: string,
    @Query("beforeId") beforeId?: string,
    @Query("limit") limit?: string,
  ) {
    return this.messages.listResources(userId, id, {
      before: this.parseBefore(before),
      beforeId: beforeId?.trim() || undefined,
      limit: this.parseLimit(limit),
    });
  }

  @Post("groups/:id/messages")
  @Throttle(communityThrottle("sendGroupMessage"))
  sendMessage(
    @CurrentUser("authId") userId: string,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(SendMessageSchema)) dto: SendMessageDto,
  ) {
    return this.messages.send(userId, id, dto);
  }

  @Post("groups/:id/posts/:postId/comments")
  @Throttle(communityThrottle("sendGroupMessage"))
  sendComment(
    @CurrentUser("authId") userId: string,
    @Param("id") id: string,
    @Param("postId") postId: string,
    @Body(new ZodValidationPipe(SendCommentSchema)) dto: SendCommentDto,
  ) {
    return this.messages.sendComment(userId, id, postId, dto);
  }

  @Put("messages/:id/like")
  @Throttle(communityThrottle("mutateMembership"))
  likeMessage(@CurrentUser("authId") userId: string, @Param("id") id: string) {
    return this.messages.setLike(userId, id, true);
  }

  @Delete("messages/:id/like")
  @Throttle(communityThrottle("mutateMembership"))
  unlikeMessage(
    @CurrentUser("authId") userId: string,
    @Param("id") id: string,
  ) {
    return this.messages.setLike(userId, id, false);
  }

  @Patch("messages/:id/pin")
  @Throttle(communityThrottle("mutateMembership"))
  pinMessage(
    @CurrentUser("authId") userId: string,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(PinMessageSchema)) dto: PinMessageDto,
  ) {
    return this.messages.setPinned(userId, id, dto.pinned);
  }

  @Post("groups/:id/attachments/upload-url")
  @Throttle(communityThrottle("uploadReservation"))
  createAttachmentUpload(
    @CurrentUser("authId") userId: string,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(CommunityAttachmentUploadSchema))
    dto: CommunityAttachmentUploadDto,
  ) {
    return this.messages.createAttachmentUpload(userId, id, dto);
  }

  @Get("groups/:id/attachments/download-url")
  getAttachmentDownloadUrl(
    @CurrentUser("authId") userId: string,
    @Param("id") id: string,
    @Query("path") path: string,
    @Query("signature") signature: string,
  ) {
    return this.messages.getAttachmentDownloadUrl(
      userId,
      id,
      path?.trim() ?? "",
      signature?.trim() ?? "",
    );
  }

  @Delete("messages/:id")
  @Throttle(communityThrottle("mutateMembership"))
  deleteMessage(
    @CurrentUser("authId") userId: string,
    @Param("id") id: string,
  ) {
    return this.messages.softDelete(userId, id);
  }

  @Post("reports")
  @Throttle(communityThrottle("report"))
  report(
    @CurrentUser("authId") userId: string,
    @Body(new ZodValidationPipe(ReportSchema)) dto: ReportDto,
  ) {
    return this.moderation.report(userId, dto);
  }

  @Post("blocks")
  @Throttle(communityThrottle("block"))
  block(
    @CurrentUser("authId") userId: string,
    @Body(new ZodValidationPipe(BlockSchema)) dto: BlockDto,
  ) {
    return this.moderation.block(userId, dto.userId);
  }

  @Get("blocks")
  listBlocks(@CurrentUser("authId") userId: string) {
    return this.moderation.listBlocks(userId);
  }

  @Delete("blocks/:uid")
  @Throttle(communityThrottle("block"))
  unblock(
    @CurrentUser("authId") userId: string,
    @Param("uid") targetUserId: string,
  ) {
    return this.moderation.unblock(userId, targetUserId);
  }

  @Get("profile/content")
  listOwnContent(
    @CurrentUser("authId") authId: string,
    @Query("before") before?: string,
    @Query("beforeId") beforeId?: string,
    @Query("limit") limit?: string,
  ) {
    return this.content.listMine(authId, {
      before: this.parseBefore(before),
      beforeId: beforeId?.trim() || undefined,
      limit: this.parseLimit(limit),
    });
  }

  private parseBoolean(value: string | undefined): boolean | undefined {
    if (value === undefined) return undefined;
    const normalized = value.trim().toLowerCase();
    if (normalized === "" || normalized === "true" || normalized === "1") {
      return true;
    }
    return false;
  }

  private requestService(): CreationRequestsService {
    if (!this.creationRequests) {
      throw new BadRequestException(
        "Community creation requests are not configured right now.",
      );
    }
    return this.creationRequests;
  }

  private parseLimit(value: string | undefined): number | undefined {
    if (value === undefined || value.trim() === "") return undefined;
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      throw new BadRequestException("Ask for a positive number of results.");
    }
    return Math.floor(parsed);
  }

  private parseMemberCursor(
    roleValue: string | undefined,
    joinedAtValue: string | undefined,
    idValue: string | undefined,
  ): CommunityMemberCursor | undefined {
    const role = roleValue?.trim();
    const joinedAt = joinedAtValue?.trim();
    const id = idValue?.trim();
    const supplied = [role, joinedAt, id].filter(Boolean).length;
    if (supplied === 0) return undefined;
    if (supplied !== 3) {
      throw new BadRequestException("That member-page cursor isn't complete.");
    }
    if (role !== "owner" && role !== "mod" && role !== "member") {
      throw new BadRequestException("That member-page cursor isn't valid.");
    }
    const parsedDate = new Date(joinedAt!);
    if (Number.isNaN(parsedDate.getTime())) {
      throw new BadRequestException("That member-page cursor isn't valid.");
    }
    return {
      role,
      joinedAt: parsedDate.toISOString(),
      id: id!,
    };
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
