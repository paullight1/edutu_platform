import { Module } from "@nestjs/common";
import { ApplicationGhostClosureService } from "./application-ghost-closure.service";
import { NotificationQueueOperationsService } from "./notification-queue-operations.service";
import { NotificationsController } from "./notifications.controller";
import { NotificationsService } from "./notifications.service";
import { OpportunityDeadlineRemindersService } from "./opportunity-deadline-reminders.service";
import { ProExpiryRemindersService } from "./pro-expiry-reminders.service";
import { DrizzlePushTokenStore, PUSH_TOKEN_STORE } from "./push-token.store";
import { NotificationSchedulerService } from "./scheduler/notification-scheduler.service";

@Module({
  controllers: [NotificationsController],
  providers: [
    NotificationsService,
    NotificationQueueOperationsService,
    OpportunityDeadlineRemindersService,
    ProExpiryRemindersService,
    ApplicationGhostClosureService,
    NotificationSchedulerService,
    { provide: PUSH_TOKEN_STORE, useClass: DrizzlePushTokenStore },
  ],
  exports: [NotificationsService, PUSH_TOKEN_STORE],
})
export class NotificationsModule {}
