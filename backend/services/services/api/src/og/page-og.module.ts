import { Module } from "@nestjs/common";
import { BlogModule } from "../blog/blog.module";
import { EventsModule } from "../events/events.module";
import { PageOgController } from "./page-og.controller";
import { SpaShellService } from "./spa-shell.service";

/**
 * Crawler-time Open Graph for DB-backed content routes (blog posts, events).
 * Opportunity OG lives in OpportunitiesModule's OgController; both mount under
 * the same `/og` prefix with non-overlapping paths.
 */
@Module({
  imports: [BlogModule, EventsModule],
  controllers: [PageOgController],
  providers: [SpaShellService],
})
export class PageOgModule {}
