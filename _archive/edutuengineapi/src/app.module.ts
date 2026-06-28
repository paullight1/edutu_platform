import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { APP_GUARD, APP_INTERCEPTOR } from "@nestjs/core";
import { ApiUsageInterceptor } from "./auth/api-usage.interceptor.js";
import { ApiKeyGuard } from "./auth/api-key.guard.js";
import { ApiKeyStore } from "./auth/api-key.store.js";
import { BillingController } from "./billing/billing.controller.js";
import { EngineController } from "./engine/engine.controller.js";
import { EngineService } from "./engine/engine.service.js";
import { DiscoveryController } from "./discovery/discovery.controller.js";
import { HealthController } from "./health/health.controller.js";
import { DeveloperController } from "./developer/developer.controller.js";
import { OpportunitiesController } from "./opportunities/opportunities.controller.js";
import { OpportunitiesService } from "./opportunities/opportunities.service.js";

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true })],
  controllers: [
    DiscoveryController,
    HealthController,
    EngineController,
    DeveloperController,
    OpportunitiesController,
    BillingController,
  ],
  providers: [
    ApiKeyStore,
    EngineService,
    OpportunitiesService,
    {
      provide: APP_GUARD,
      useClass: ApiKeyGuard,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: ApiUsageInterceptor,
    },
  ],
})
export class AppModule {}
