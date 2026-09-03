import { Module } from "@nestjs/common";
import { AppController } from "./app.controller";
import { AppService } from "./app.service";
import { AuthModule } from "./auth";
import { GoalsModule } from "./goals/goals.module";
import { OpportunitiesModule } from "./opportunities/opportunities.module";
import { OpportunityJourneysModule } from "./opportunity-journeys/opportunity-journeys.module";
import { OpportunitySubmissionsModule } from "./opportunity-submissions/opportunity-submissions.module";
import { CreatorModule } from "./creator/creator.module";
import { QuizModule } from "./quiz/quiz.module";
import { FlashcardsModule } from "./flashcards/flashcards.module";
import { BlogModule } from "./blog/blog.module";
import { ImpactStoriesModule } from "./impact-stories/impact-stories.module";
import { ScraperModule } from "./scraper/scraper.module";
import { CvModule } from "./cv/cv.module";
import { RoadmapsModule } from "./roadmaps/roadmaps.module";
import { BillingModule } from "./billing/billing.module";
import { AiModule } from "./ai/ai.module";
import { MobileControlModule } from "./mobile-control/mobile-control.module";
import { NotificationsModule } from "./notifications/notifications.module";
import { EdutuApiModule } from "./edutu-api/edutu-api.module";
import { ProfileModule } from "./profile/profile.module";
import { MeModule } from "./me/me.module";
import { ChatModule } from "./chat/chat.module";
import { SettingsModule } from "./settings/settings.module";
import { AdminModule } from "./admin/admin.module";
import { AnalyticsModule } from "./analytics/analytics.module";
import { HealthModule } from "./health/health.module";
import { EventsModule } from "./events/events.module";
import { PageOgModule } from "./og/page-og.module";
import { SeoModule } from "./seo/seo.module";
import { ScheduleModule } from "@nestjs/schedule";
import { ConfigModule } from "@nestjs/config";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import { APP_GUARD } from "@nestjs/core";
import { DeveloperModule } from "./developer/developer.module";
import { CalendarModule } from "./calendar/calendar.module";
import { CacheModule } from "./common/cache/cache.module";
import { CopilotModule } from "./copilot/copilot.module";
import { SavedSearchesModule } from "./saved-searches/saved-searches.module";
import { CommunitiesModule } from "./communities/communities.module";
import { CommunityDmsModule } from "./community-dms/community-dms.module";
import { CommunityCallsModule } from "./community-calls/community-calls.module";
import { MonetizationModule } from "./monetization/monetization.module";
import { AlertsModule } from "./alerts/alerts.module";
import { DocumentsModule } from "./documents/documents.module";
import { UploadsModule } from "./uploads/uploads.module";
import { SupportModule } from "./support/support.module";

@Module({
  imports: [
    CacheModule,
    ConfigModule.forRoot({ envFilePath: [".env.local", ".env"] }),
    ScheduleModule.forRoot(),
    ThrottlerModule.forRoot([
      {
        ttl: 60000,
        limit: 100,
      },
    ]),
    AuthModule,
    GoalsModule,
    OpportunitiesModule,
    OpportunityJourneysModule,
    OpportunitySubmissionsModule,
    CreatorModule,
    QuizModule,
    FlashcardsModule,
    BlogModule,
    ImpactStoriesModule,
    ScraperModule,
    CvModule,
    RoadmapsModule,
    BillingModule,
    AiModule,
    MobileControlModule,
    NotificationsModule,
    ProfileModule,
    MeModule,
    ChatModule,
    DocumentsModule,
    UploadsModule,
    SettingsModule,
    MonetizationModule,
    AdminModule,
    AnalyticsModule,
    HealthModule,
    EventsModule,
    PageOgModule,
    SeoModule,
    EdutuApiModule,
    DeveloperModule,
    CalendarModule,
    CopilotModule,
    SavedSearchesModule,
    CommunitiesModule,
    CommunityDmsModule,
    CommunityCallsModule,
    AlertsModule,
    SupportModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
