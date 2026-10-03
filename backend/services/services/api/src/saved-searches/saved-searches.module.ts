import { Module } from "@nestjs/common";
import { NotificationsModule } from "../notifications/notifications.module";
import { MonetizationModule } from "../monetization/monetization.module";
import { SavedSearchesController } from "./saved-searches.controller";
import { SavedSearchesService } from "./saved-searches.service";

@Module({
  imports: [NotificationsModule, MonetizationModule],
  controllers: [SavedSearchesController],
  providers: [SavedSearchesService],
  exports: [SavedSearchesService],
})
export class SavedSearchesModule {}
