import { Module } from "@nestjs/common";
import { AuditModule } from "../common/audit";
import { SettingsController } from "./settings.controller";
import { WebConfigController } from "./web-config.controller";
import { SettingsService } from "./settings.service";

@Module({
  imports: [AuditModule],
  controllers: [SettingsController, WebConfigController],
  providers: [SettingsService],
  exports: [SettingsService],
})
export class SettingsModule {}
