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

  @Post("deadlines/run")
  runDeadlineReminders() {
    return this.alertsService.runDeadlineReminders();
  }
}
