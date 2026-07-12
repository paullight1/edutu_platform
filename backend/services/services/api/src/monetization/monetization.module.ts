import { Global, Module } from "@nestjs/common";
import { APP_INTERCEPTOR } from "@nestjs/core";
import { SettingsModule } from "../settings/settings.module";
import { AiMeteringInterceptor } from "./ai-metering.interceptor";
import { MonetizationService } from "./monetization.service";

// Global so any feature module can tag routes with @AiMetered without
// importing anything beyond the decorator.
@Global()
@Module({
  imports: [SettingsModule],
  providers: [
    MonetizationService,
    { provide: APP_INTERCEPTOR, useClass: AiMeteringInterceptor },
  ],
  exports: [MonetizationService],
})
export class MonetizationModule {}
