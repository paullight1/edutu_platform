import { Module } from "@nestjs/common";
import { GoogleCalendarService } from "./google-calendar.service";
import { CalendarController } from "./calendar.controller";
import { NotificationsModule } from "../notifications/notifications.module";

@Module({
  imports: [NotificationsModule],
  controllers: [CalendarController],
  providers: [GoogleCalendarService],
  exports: [GoogleCalendarService],
})
export class CalendarModule {}
