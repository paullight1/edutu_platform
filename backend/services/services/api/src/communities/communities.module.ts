import { Module } from "@nestjs/common";
import { NotificationsModule } from "../notifications/notifications.module";
import { CommunityArchiveCron } from "./archive.cron";
import { CommunitiesController } from "./communities.controller";
import { CommunityContentService } from "./content.service";
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
  providers: [
    GroupsService,
    CommunityContentService,
    MessagesService,
    FormsService,
    ModerationService,
    // Registered as a provider and deliberately NOT exported: the nightly
    // expiry sweep has exactly one caller, the scheduler, and exporting it
    // would invite a second one. @Cron only fires for providers Nest has
    // instantiated, so omitting this line is a silent no-op — every expired
    // group would simply stay writable forever with nothing failing.
    CommunityArchiveCron,
  ],
  exports: [GroupsService, MessagesService, FormsService, ModerationService],
})
export class CommunitiesModule {}
