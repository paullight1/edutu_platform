import { Module } from "@nestjs/common";
import { NotificationsModule } from "../notifications/notifications.module";
import { ApplicationHistoryService } from "./application-history.service";
import { MeController } from "./me.controller";
import { MeService } from "./me.service";

@Module({
  imports: [NotificationsModule],
  controllers: [MeController],
  providers: [MeService, ApplicationHistoryService],
  exports: [MeService, ApplicationHistoryService],
})
export class MeModule {}
