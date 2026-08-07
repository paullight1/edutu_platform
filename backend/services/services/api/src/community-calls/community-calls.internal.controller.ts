import { Body, Controller, Headers, Param, Post } from "@nestjs/common";
import { z } from "zod";
import { Public } from "../auth/public.decorator";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { CommunityCallsService } from "./community-calls.service";

const MediaFailureSchema = z
  .object({
    failureCode: z
      .string()
      .trim()
      .min(1)
      .max(80)
      .regex(/^[A-Z0-9_.:-]+$/),
  })
  .strict();

const ParticipationSchema = z
  .object({
    joinTokenJti: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();

@Public()
@Controller("internal/community-calls")
export class CommunityCallsInternalController {
  constructor(private readonly calls: CommunityCallsService) {}

  @Post(":callId/media-failed")
  fail(
    @Param("callId") callId: string,
    @Headers("authorization") authorization: string | undefined,
    @Body(new ZodValidationPipe(MediaFailureSchema))
    dto: z.infer<typeof MediaFailureSchema>,
  ) {
    return this.calls.failFromGateway(callId, authorization, dto.failureCode);
  }

  @Post(":callId/participants/:userId/joined")
  joined(
    @Param("callId") callId: string,
    @Param("userId") userId: string,
    @Headers("authorization") authorization: string | undefined,
    @Body(new ZodValidationPipe(ParticipationSchema))
    dto: z.infer<typeof ParticipationSchema>,
  ) {
    return this.calls.confirmJoinedFromGateway(
      callId,
      userId,
      authorization,
      dto.joinTokenJti,
    );
  }
}
