import { Module } from "@nestjs/common";
import { NotificationsModule } from "../notifications/notifications.module";
import { CommunitiesController } from "./communities.controller";
import { FormsService } from "./forms.service";
import { GroupsService } from "./groups.service";
import { MessagesService } from "./messages.service";
import { ModerationService } from "./moderation.service";

/**
 * `NotificationsModule` IS NOT OPTIONAL. `ModerationService` takes its notifier
 * as `@Optional() @Inject(NotificationsService)` and falls back to constructing
 * its own instance, so a module that forgot this import would still boot, still
 * pass every unit test, and still accept reports — while the owner of the
 * reported group was never told, because the fallback instance is not the one
 * the rest of the app has wired up. The import is what makes the report button
 * do the one thing it exists to do.
 */
@Module({
  imports: [NotificationsModule],
  controllers: [CommunitiesController],
  providers: [GroupsService, MessagesService, FormsService, ModerationService],
  exports: [GroupsService, MessagesService, FormsService, ModerationService],
})
export class CommunitiesModule {}
