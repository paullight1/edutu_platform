import { Module } from "@nestjs/common";
import { CalendarSyncService } from "./calendar-sync.service";
import { CalendarController } from "./calendar.controller";
import { NotificationsModule } from "../notifications/notifications.module";

@Module({
  imports: [NotificationsModule],
  controllers: [CalendarController],
  providers: [CalendarSyncService],
  exports: [CalendarSyncService],
})
export class CalendarModule {}
