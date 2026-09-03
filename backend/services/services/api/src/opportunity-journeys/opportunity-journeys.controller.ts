import {
  Body,
  ConflictException,
  Controller,
  Get,
  Headers,
  NotFoundException,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UnprocessableEntityException,
} from "@nestjs/common";
import { CurrentUser } from "../auth";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { OpportunityHomeService } from "./opportunity-home.service";
import { OpportunityIntentService } from "./opportunity-intent.service";
import { OpportunityJourneysService } from "./opportunity-journeys.service";
import { OpportunityJourneyDomainError } from "./opportunity-journey.errors";
import {
  applicationMutationSchema,
  createOpportunityJourneySchema,
  listOpportunityJourneysQuerySchema,
  opportunityHomeQuerySchema,
  opportunityJourneyOutcomeSchema,
  putOpportunityIntentSchema,
  setOpportunityJourneyPrioritySchema,
  transitionOpportunityJourneySchema,
  updateOpportunityJourneyTaskSchema,
  type ApplicationMutationInput,
  type CreateOpportunityJourneyInput,
  type ListOpportunityJourneysQuery,
  type OpportunityHomeQuery,
  type OpportunityJourneyOutcomeInput,
  type PutOpportunityIntentInput,
  type SetOpportunityJourneyPriorityInput,
  type TransitionOpportunityJourneyInput,
  type UpdateOpportunityJourneyTaskInput,
} from "./dto/opportunity-journey.dto";

@Controller("me")
export class OpportunityJourneysController {
  constructor(
    private readonly homeService: OpportunityHomeService,
    private readonly intentService: OpportunityIntentService,
    private readonly journeysService: OpportunityJourneysService,
  ) {}

  private async execute<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (!(error instanceof OpportunityJourneyDomainError)) throw error;

      if (
        [
          "ACTIVE_PURSUIT_LIMIT_REACHED",
          "PRIMARY_PURSUIT_EXISTS",
          "JOURNEY_VERSION_CONFLICT",
          "IDEMPOTENCY_CONFLICT",
        ].includes(error.code)
      ) {
        throw new ConflictException({
          code: error.code,
          message: error.message,
          ...error.details,
        });
      }

      if (
        [
          "JOURNEY_NOT_FOUND",
          "TASK_NOT_FOUND",
          "OPPORTUNITY_NOT_FOUND",
        ].includes(error.code)
      ) {
        throw new NotFoundException({
          code: error.code,
          message: error.message,
          ...error.details,
        });
      }

      throw new UnprocessableEntityException({
        code: error.code,
        message: error.message,
        ...error.details,
      });
    }
  }

  @Get("opportunity-home")
  getOpportunityHome(
    @CurrentUser("id") userId: string,
    @Query(new ZodValidationPipe(opportunityHomeQuerySchema))
    query: OpportunityHomeQuery,
  ) {
    return this.execute(() =>
      this.homeService.getHome(userId, query.recommendationLimit),
    );
  }

  @Get("opportunity-intent")
  getOpportunityIntent(@CurrentUser("id") userId: string) {
    return this.execute(() => this.intentService.getCurrentIntent(userId));
  }

  @Put("opportunity-intent")
  putOpportunityIntent(
    @CurrentUser("id") userId: string,
    @Body(new ZodValidationPipe(putOpportunityIntentSchema))
    body: PutOpportunityIntentInput,
    @Headers("idempotency-key") idempotencyKey: string,
  ) {
    if (!idempotencyKey || idempotencyKey.trim().length < 8) {
      throw new UnprocessableEntityException({
        code: "IDEMPOTENCY_KEY_REQUIRED",
        message: "A stable Idempotency-Key header is required.",
      });
    }
    return this.execute(() =>
      this.intentService.saveExplicitIntent(
        userId,
        body,
        idempotencyKey.trim(),
      ),
    );
  }

  @Get("opportunity-journeys")
  listOpportunityJourneys(
    @CurrentUser("id") userId: string,
    @Query(new ZodValidationPipe(listOpportunityJourneysQuerySchema))
    query: ListOpportunityJourneysQuery,
  ) {
    return this.execute(() =>
      this.journeysService.listJourneys(userId, query.stage ?? "pursuing"),
    );
  }

  @Post("opportunity-journeys")
  createOpportunityJourney(
    @CurrentUser("id") userId: string,
    @Body(new ZodValidationPipe(createOpportunityJourneySchema))
    body: CreateOpportunityJourneyInput,
  ) {
    return this.execute(() =>
      this.journeysService.createJourney(userId, body),
    );
  }

  @Get("opportunity-journeys/:journeyId")
  getOpportunityJourney(
    @CurrentUser("id") userId: string,
    @Param("journeyId") journeyId: string,
  ) {
    return this.execute(() =>
      this.journeysService.getJourney(userId, journeyId),
    );
  }

  @Patch("opportunity-journeys/:journeyId/transition")
  transitionJourney(
    @CurrentUser("id") userId: string,
    @Param("journeyId") journeyId: string,
    @Body(new ZodValidationPipe(transitionOpportunityJourneySchema))
    body: TransitionOpportunityJourneyInput,
  ) {
    return this.execute(() =>
      this.journeysService.transitionJourney(userId, journeyId, body),
    );
  }

  @Patch("opportunity-journeys/:journeyId/priority")
  setJourneyPriority(
    @CurrentUser("id") userId: string,
    @Param("journeyId") journeyId: string,
    @Body(new ZodValidationPipe(setOpportunityJourneyPrioritySchema))
    body: SetOpportunityJourneyPriorityInput,
  ) {
    return this.execute(() =>
      this.journeysService.setPriority(userId, journeyId, body),
    );
  }

  @Patch("opportunity-journeys/:journeyId/tasks/:taskId")
  updateJourneyTask(
    @CurrentUser("id") userId: string,
    @Param("journeyId") journeyId: string,
    @Param("taskId") taskId: string,
    @Body(new ZodValidationPipe(updateOpportunityJourneyTaskSchema))
    body: UpdateOpportunityJourneyTaskInput,
  ) {
    return this.execute(() =>
      this.journeysService.updateTask(userId, journeyId, taskId, body),
    );
  }

  @Post("opportunity-journeys/:journeyId/application-opened")
  openApplication(
    @CurrentUser("id") userId: string,
    @Param("journeyId") journeyId: string,
    @Body(new ZodValidationPipe(applicationMutationSchema))
    body: ApplicationMutationInput,
  ) {
    return this.execute(() =>
      this.journeysService.markApplicationOpened(userId, journeyId, body),
    );
  }

  @Post("opportunity-journeys/:journeyId/application-confirmed")
  confirmApplication(
    @CurrentUser("id") userId: string,
    @Param("journeyId") journeyId: string,
    @Body(new ZodValidationPipe(applicationMutationSchema))
    body: ApplicationMutationInput,
  ) {
    return this.execute(() =>
      this.journeysService.confirmApplication(userId, journeyId, body),
    );
  }

  @Post("opportunity-journeys/:journeyId/outcome")
  recordOutcome(
    @CurrentUser("id") userId: string,
    @Param("journeyId") journeyId: string,
    @Body(new ZodValidationPipe(opportunityJourneyOutcomeSchema))
    body: OpportunityJourneyOutcomeInput,
  ) {
    return this.execute(() =>
      this.journeysService.recordOutcome(userId, journeyId, body),
    );
  }
}
