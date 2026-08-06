import { Module } from "@nestjs/common";
import { NotificationsController } from "./notifications.controller";
import { NotificationsService } from "./notifications.service";
import { OpportunityDeadlineRemindersService } from "./opportunity-deadline-reminders.service";
import { ProExpiryRemindersService } from "./pro-expiry-reminders.service";
import { ApplicationGhostClosureService } from "./application-ghost-closure.service";
import { NotificationSchedulerService } from "./scheduler/notification-scheduler.service";

@Module({
  controllers: [NotificationsController],
  providers: [
    NotificationsService,
    OpportunityDeadlineRemindersService,
    ProExpiryRemindersService,
    ApplicationGhostClosureService,
    NotificationSchedulerService,
  ],
  exports: [NotificationsService],
})
export class NotificationsModule {}
