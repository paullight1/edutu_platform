import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
} from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { CurrentUser } from "../auth/current-user.decorator";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { communityThrottle } from "../communities/community-throttle";
import type { DmCursor } from "./community-dms.store";
import { CommunityDmsService } from "./community-dms.service";
import {
  BlockDmUserSchema,
  CreateDmRequestSchema,
  SendDmMessageSchema,
  type BlockDmUserDto,
  type CreateDmRequestDto,
  type SendDmMessageDto,
} from "./dto/community-dm.dto";
import type { DmRequestDirection } from "./community-dms.types";

@Controller("community-dms")
export class CommunityDmsController {
  constructor(private readonly dms: CommunityDmsService) {}

  @Get("relationships/:userId")
  relationship(
    @CurrentUser("authId") userId: string,
    @Param("userId") otherUserId: string,
  ) {
    return this.dms.relationship(userId, otherUserId);
  }

  @Get("requests")
  listRequests(
    @CurrentUser("authId") userId: string,
    @Query("direction") direction?: string,
    @Query("before") before?: string,
    @Query("beforeId") beforeId?: string,
    @Query("limit") limit?: string,
  ) {
    return this.dms.listRequests(
      userId,
      this.parseDirection(direction),
      this.parseCursor(before, beforeId),
      this.parseLimit(limit),
    );
  }

  @Post("requests")
  @Throttle(communityThrottle("dmRequest"))
  createRequest(
    @CurrentUser("authId") userId: string,
    @Body(new ZodValidationPipe(CreateDmRequestSchema))
    dto: CreateDmRequestDto,
  ) {
    return this.dms.createRequest(userId, dto);
  }

  @Post("requests/:id/accept")
  @Throttle(communityThrottle("mutateMembership"))
  acceptRequest(
    @CurrentUser("authId") userId: string,
    @Param("id") id: string,
  ) {
    return this.dms.acceptRequest(userId, id);
  }

  @Delete("requests/:id")
  @Throttle(communityThrottle("mutateMembership"))
  declineRequest(
    @CurrentUser("authId") userId: string,
    @Param("id") id: string,
  ) {
    return this.dms.declineRequest(userId, id);
  }

  @Get("conversations")
  listConversations(
    @CurrentUser("authId") userId: string,
    @Query("before") before?: string,
    @Query("beforeId") beforeId?: string,
    @Query("limit") limit?: string,
  ) {
    return this.dms.listConversations(
      userId,
      this.parseCursor(before, beforeId),
      this.parseLimit(limit),
    );
  }

  @Get("conversations/:id")
  getConversation(
    @CurrentUser("authId") userId: string,
    @Param("id") id: string,
  ) {
    return this.dms.getConversation(userId, id);
  }

  @Get("conversations/:id/messages")
  listMessages(
    @CurrentUser("authId") userId: string,
    @Param("id") id: string,
    @Query("before") before?: string,
    @Query("beforeId") beforeId?: string,
    @Query("limit") limit?: string,
  ) {
    return this.dms.listMessages(
      userId,
      id,
      this.parseCursor(before, beforeId),
      this.parseLimit(limit),
    );
  }

  @Post("conversations/:id/messages")
  @Throttle(communityThrottle("sendDmMessage"))
  sendMessage(
    @CurrentUser("authId") userId: string,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(SendDmMessageSchema)) dto: SendDmMessageDto,
  ) {
    return this.dms.sendMessage(userId, id, dto);
  }

  @Post("conversations/:id/read")
  markRead(@CurrentUser("authId") userId: string, @Param("id") id: string) {
    return this.dms.markRead(userId, id);
  }

  @Delete("conversations/:id")
  @Throttle(communityThrottle("mutateMembership"))
  hideConversation(
    @CurrentUser("authId") userId: string,
    @Param("id") id: string,
  ) {
    return this.dms.hideConversation(userId, id);
  }

  @Get("blocks")
  listBlocks(
    @CurrentUser("authId") userId: string,
    @Query("limit") limit?: string,
  ) {
    return this.dms.listBlocks(userId, this.parseLimit(limit));
  }

  @Post("blocks")
  @Throttle(communityThrottle("block"))
  blockUser(
    @CurrentUser("authId") userId: string,
    @Body(new ZodValidationPipe(BlockDmUserSchema)) dto: BlockDmUserDto,
  ) {
    return this.dms.blockUser(userId, dto.userId);
  }

  @Delete("blocks/:userId")
  @Throttle(communityThrottle("block"))
  unblockUser(
    @CurrentUser("authId") userId: string,
    @Param("userId") blockedUserId: string,
  ) {
    return this.dms.unblockUser(userId, blockedUserId);
  }

  private parseDirection(value?: string): DmRequestDirection {
    if (!value || value === "incoming") return "incoming";
    if (value === "outgoing") return "outgoing";
    throw new BadRequestException("Direction must be incoming or outgoing.");
  }

  private parseCursor(before?: string, beforeId?: string): DmCursor | null {
    if (!before && !beforeId) return null;
    if (!before) {
      throw new BadRequestException("before is required with beforeId.");
    }
    const createdAt = new Date(before);
    if (Number.isNaN(createdAt.getTime())) {
      throw new BadRequestException("before must be a valid timestamp.");
    }
    if (beforeId && !UUID_PATTERN.test(beforeId)) {
      throw new BadRequestException("beforeId must be a valid message id.");
    }
    return { createdAt, id: beforeId };
  }

  private parseLimit(value?: string): number | undefined {
    if (!value) return undefined;
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 1) {
      throw new BadRequestException("limit must be a positive number.");
    }
    return parsed;
  }
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
