import { Module } from "@nestjs/common";
import { GoalsService } from "./goals.service";
import { GoalsController } from "./goals.controller";
import { NotificationsModule } from "../notifications/notifications.module";
import { CalendarModule } from "../calendar/calendar.module";
import { MonetizationModule } from "../monetization/monetization.module";

@Module({
  imports: [NotificationsModule, CalendarModule, MonetizationModule],
  controllers: [GoalsController],
  providers: [GoalsService],
  exports: [GoalsService],
})
export class GoalsModule {}
