import { Module } from "@nestjs/common";
import { NotificationsController } from "./notifications.controller";
import { NotificationsService } from "./notifications.service";
import { OpportunityDeadlineRemindersService } from "./opportunity-deadline-reminders.service";

@Module({
  controllers: [NotificationsController],
  providers: [NotificationsService, OpportunityDeadlineRemindersService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
