import { Inject, Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression, Interval } from "@nestjs/schedule";
import {
  COMMUNITY_CALLS_REPOSITORY,
  type CommunityCallsRepository,
} from "./community-calls.repository";
import { COMMUNITY_CALLS_CONFIG } from "./community-calls.config";
import { CommunityCallGatewayClient } from "./community-call-gateway.client";
import { CommunityCallsService } from "./community-calls.service";
import type { CommunityCallsConfig } from "./community-calls.types";

@Injectable()
export class CommunityCallsLifecycle {
  private readonly logger = new Logger(CommunityCallsLifecycle.name);
  private running = false;

  constructor(
    @Inject(COMMUNITY_CALLS_REPOSITORY)
    private readonly repository: CommunityCallsRepository,
    private readonly calls: CommunityCallsService,
    private readonly gateway: CommunityCallGatewayClient,
    @Inject(COMMUNITY_CALLS_CONFIG)
    private readonly config: CommunityCallsConfig,
  ) {}

  @Interval(5_000)
  async drainRingQueue() {
    if (!this.config.enabled) return;
    await this.calls.processRingDeliveries();
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async run() {
    if (!this.config.enabled || this.running) return;
    this.running = true;
    try {
      const now = new Date();
      const [reminders, missed, expired, overdue, staleStarting] =
        await Promise.all([
          this.repository.claimDueReminders(
            now,
            this.config.reminderMinutes,
            this.config.lifecycleBatchSize,
          ),
          this.repository.finalizeMissed(now, this.config.lifecycleBatchSize),
          this.repository.expireAbandoned(
            now,
            this.config.startLateMinutes,
            this.config.lifecycleBatchSize,
          ),
          this.repository.claimOverdue(
            now,
            this.config.maximumDurationMinutes,
            this.config.lifecycleBatchSize,
          ),
          this.repository.failStaleStarting(
            now,
            this.config.startingTimeoutMinutes,
            this.config.lifecycleBatchSize,
          ),
        ]);
      const work: Promise<unknown>[] = [
        ...reminders.map((claim) => this.calls.sendReminder(claim)),
        ...missed.map((finalization) => this.calls.sendMissed(finalization)),
        ...overdue.map((call) => this.closeRoom(call.id)),
        ...staleStarting.map((call) => this.closeRoom(call.id)),
      ];
      const results = await Promise.allSettled(work);
      const failures = results.filter(
        (result) => result.status === "rejected",
      ).length;
      if (failures) {
        this.logger.warn(
          `Community call lifecycle completed with ${failures} side-effect failure(s)`,
        );
      }
      if (expired.length || overdue.length || staleStarting.length) {
        this.logger.log(
          `Community call lifecycle expired=${expired.length} ended=${overdue.length} failed=${staleStarting.length}`,
        );
      }
    } finally {
      this.running = false;
    }
  }

  private async closeRoom(callId: string) {
    try {
      await this.gateway.close(callId);
    } catch {
      this.logger.warn(
        `Lifecycle could not close media room for call ${callId}`,
      );
    }
  }
}
