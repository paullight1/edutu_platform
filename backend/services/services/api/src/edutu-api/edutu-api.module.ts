import { Module } from "@nestjs/common";
import { OpportunitiesModule } from "../opportunities/opportunities.module";
import { EdutuApiController } from "./edutu-api.controller";
import { EdutuApiKeyGuard } from "./edutu-api-key.guard";
import { EdutuApiService } from "./edutu-api.service";
import { EdutuApiUsageInterceptor } from "./edutu-api-usage.interceptor";
import { EdutuApiUsageService } from "./edutu-api-usage.service";

@Module({
  imports: [OpportunitiesModule],
  controllers: [EdutuApiController],
  providers: [
    EdutuApiService,
    EdutuApiKeyGuard,
    EdutuApiUsageInterceptor,
    EdutuApiUsageService,
  ],
})
export class EdutuApiModule {}
