import { Controller, Post, UseGuards } from "@nestjs/common";
import { AdminGuard } from "../auth";
import { OpportunityAlertsService } from "./opportunity-alerts.service";

// Manual triggers so admins can test/backfill the alert crons on demand.
@Controller("admin/alerts")
@UseGuards(AdminGuard)
export class AlertsController {
  constructor(private readonly alertsService: OpportunityAlertsService) {}

  @Post("interest/run")
  runInterestAlerts() {
    return this.alertsService.runInterestAlerts();
  }

  // NOTE: there is deliberately no "deadlines/run" route here any more.
  // Deadline reminders are owned by OpportunityDeadlineRemindersService
  // (src/notifications) — this service no longer sends them.
}
