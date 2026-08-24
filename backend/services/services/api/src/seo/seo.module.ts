import { Module } from "@nestjs/common";
import { BlogModule } from "../blog/blog.module";
import { EventsModule } from "../events/events.module";
import { SpaShellService } from "../og/spa-shell.service";
import { OpportunitiesModule } from "../opportunities/opportunities.module";
import { SeoHydrationController } from "./seo-hydration.controller";
import { SeoController } from "./seo.controller";

@Module({
  imports: [BlogModule, EventsModule, OpportunitiesModule],
  controllers: [SeoController, SeoHydrationController],
  providers: [SpaShellService],
})
export class SeoModule {}
