import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { OpportunityJourneyRemindersService } from "./opportunity-journey-reminders.service";

@Injectable()
export class OpportunityJourneyRemindersCron {
  private readonly logger = new Logger(OpportunityJourneyRemindersCron.name);
  private running = false;

  constructor(private readonly reminders: OpportunityJourneyRemindersService) {}

  @Cron(CronExpression.EVERY_HOUR)
  async enqueueDueReminders() {
    if (this.running) {
      this.logger.warn("Skipped overlapping opportunity journey reminder run");
      return;
    }
    this.running = true;
    try {
      const result = await this.reminders.enqueueDue();
      this.logger.log(
        `Opportunity journey reminders considered=${result.considered} queued=${result.queued} deduplicated=${result.deduplicated}`,
      );
    } catch (error) {
      this.logger.error(
        "Opportunity journey reminder run failed",
        error instanceof Error ? error.stack : String(error),
      );
    } finally {
      this.running = false;
    }
  }
}
