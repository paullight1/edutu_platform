import { Module } from "@nestjs/common";
import { NotificationsModule } from "../notifications/notifications.module";
import { MeController } from "./me.controller";
import { MeService } from "./me.service";

@Module({
  imports: [NotificationsModule],
  controllers: [MeController],
  providers: [MeService],
  exports: [MeService],
})
export class MeModule {}
