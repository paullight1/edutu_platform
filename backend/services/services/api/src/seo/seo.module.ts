import { Module } from "@nestjs/common";
import { BlogModule } from "../blog/blog.module";
import { SpaShellService } from "../og/spa-shell.service";
import { OpportunitiesModule } from "../opportunities/opportunities.module";
import { SeoCatalogService } from "./seo-catalog.service";
import { SeoController } from "./seo.controller";

@Module({
  imports: [BlogModule, OpportunitiesModule],
  controllers: [SeoController],
  providers: [SeoCatalogService, SpaShellService],
})
export class SeoModule {}
