import { Module } from "@nestjs/common";
import { NotificationsModule } from "../notifications/notifications.module";
import { OpportunitiesModule } from "../opportunities/opportunities.module";
import { MeModule } from "../me/me.module";
import { ProfileController } from "./profile.controller";
import { ProfileService } from "./profile.service";

@Module({
  imports: [NotificationsModule, OpportunitiesModule, MeModule],
  controllers: [ProfileController],
  providers: [ProfileService],
  exports: [ProfileService],
})
export class ProfileModule {}
