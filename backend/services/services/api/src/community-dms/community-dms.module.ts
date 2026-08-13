import { Module } from "@nestjs/common";
import { NotificationsModule } from "../notifications/notifications.module";
import { CommunityDmsController } from "./community-dms.controller";
import { CommunityDmsService } from "./community-dms.service";

@Module({
  imports: [NotificationsModule],
  controllers: [CommunityDmsController],
  providers: [CommunityDmsService],
  exports: [CommunityDmsService],
})
export class CommunityDmsModule {}
