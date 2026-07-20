import { Module } from "@nestjs/common";
import { NotificationsController } from "./notifications.controller";
import { NotificationsService } from "./notifications.service";
import { OpportunityDeadlineRemindersService } from "./opportunity-deadline-reminders.service";
import { ProExpiryRemindersService } from "./pro-expiry-reminders.service";

@Module({
  controllers: [NotificationsController],
  providers: [
    NotificationsService,
    OpportunityDeadlineRemindersService,
    ProExpiryRemindersService,
  ],
  exports: [NotificationsService],
})
export class NotificationsModule {}
