import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  Query,
} from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { CurrentUser } from "../auth/current-user.decorator";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { CommunityCallsService } from "./community-calls.service";
import {
  CommunityCallListQuerySchema,
  DeclineCommunityCallSchema,
  ScheduleCommunityCallSchema,
  UpdateCommunityCallSchema,
  type CommunityCallListQueryDto,
  type DeclineCommunityCallDto,
  type ScheduleCommunityCallDto,
  type UpdateCommunityCallDto,
} from "./dto/community-call.dto";

@Controller("communities")
export class CommunityCallsController {
  constructor(private readonly calls: CommunityCallsService) {}

  @Get("groups/:groupId/calls")
  list(
    @CurrentUser("authId") userId: string,
    @Param("groupId") groupId: string,
    @Query(new ZodValidationPipe(CommunityCallListQuerySchema))
    query: CommunityCallListQueryDto,
  ) {
    return this.calls.list(userId, groupId, query);
  }

  @Get("calls/:callId")
  get(@CurrentUser("authId") userId: string, @Param("callId") callId: string) {
    return this.calls.get(userId, callId);
  }

  @Post("groups/:groupId/calls")
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  schedule(
    @CurrentUser("authId") userId: string,
    @Param("groupId") groupId: string,
    @Headers("idempotency-key") idempotencyKey: string,
    @Body(new ZodValidationPipe(ScheduleCommunityCallSchema))
    dto: ScheduleCommunityCallDto,
  ) {
    return this.calls.schedule(userId, groupId, dto, idempotencyKey);
  }

  @Patch("calls/:callId")
  update(
    @CurrentUser("authId") userId: string,
    @Param("callId") callId: string,
    @Headers("idempotency-key") idempotencyKey: string,
    @Body(new ZodValidationPipe(UpdateCommunityCallSchema))
    dto: UpdateCommunityCallDto,
  ) {
    return this.calls.update(userId, callId, dto, idempotencyKey);
  }

  @Post("calls/:callId/cancel")
  cancel(
    @CurrentUser("authId") userId: string,
    @Param("callId") callId: string,
    @Headers("idempotency-key") idempotencyKey: string,
  ) {
    return this.calls.cancel(userId, callId, idempotencyKey);
  }

  @Post("calls/:callId/start")
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  start(
    @CurrentUser("authId") userId: string,
    @Param("callId") callId: string,
    @Headers("idempotency-key") idempotencyKey: string,
  ) {
    return this.calls.start(userId, callId, idempotencyKey);
  }

  @Post("calls/:callId/end")
  end(
    @CurrentUser("authId") userId: string,
    @Param("callId") callId: string,
    @Headers("idempotency-key") idempotencyKey: string,
  ) {
    return this.calls.end(userId, callId, idempotencyKey);
  }

  @Post("calls/:callId/join-token")
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  joinToken(
    @CurrentUser("authId") userId: string,
    @Param("callId") callId: string,
    @Headers("idempotency-key") idempotencyKey: string,
  ) {
    return this.calls.joinToken(userId, callId, idempotencyKey);
  }

  @Post("calls/:callId/decline")
  decline(
    @CurrentUser("authId") userId: string,
    @Param("callId") callId: string,
    @Headers("idempotency-key") idempotencyKey: string,
    @Body(new ZodValidationPipe(DeclineCommunityCallSchema))
    dto: DeclineCommunityCallDto,
  ) {
    return this.calls.decline(userId, callId, dto, idempotencyKey);
  }

  @Post("calls/:callId/leave")
  leave(
    @CurrentUser("authId") userId: string,
    @Param("callId") callId: string,
    @Headers("idempotency-key") idempotencyKey: string,
  ) {
    return this.calls.leave(userId, callId, idempotencyKey);
  }
}
