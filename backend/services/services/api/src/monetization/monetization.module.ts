import { WebPaidToolsGuard } from "./web-paid-tools.guard";
import { Global, Module } from "@nestjs/common";
import { APP_INTERCEPTOR } from "@nestjs/core";
import { SettingsModule } from "../settings/settings.module";
import { AiMeteringInterceptor } from "./ai-metering.interceptor";
import { MonetizationController } from "./monetization.controller";
import { MonetizationService } from "./monetization.service";

// Global so any feature module can tag routes with @AiMetered without
// importing anything beyond the decorator.
@Global()
@Module({
  imports: [SettingsModule],
  controllers: [MonetizationController],
  providers: [
    MonetizationService,
    WebPaidToolsGuard,
    { provide: APP_INTERCEPTOR, useClass: AiMeteringInterceptor },
  ],
  // Consumers of WebPaidToolsGuard resolve its SettingsService dependency
  // through their module scope, so re-export the imported settings module.
  exports: [MonetizationService, WebPaidToolsGuard, SettingsModule],
})
export class MonetizationModule {}
