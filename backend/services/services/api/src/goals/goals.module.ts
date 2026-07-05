import { Module } from "@nestjs/common";
import { GoalsService } from "./goals.service";
import { GoalsController } from "./goals.controller";
import { NotificationsModule } from "../notifications/notifications.module";
import { CalendarModule } from "../calendar/calendar.module";

@Module({
  imports: [NotificationsModule, CalendarModule],
  controllers: [GoalsController],
  providers: [GoalsService],
  exports: [GoalsService],
})
export class GoalsModule {}
