import { Body, Controller, Get, Put, UseGuards } from "@nestjs/common";
import { AdminGuard, CurrentUser } from "../auth";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { SettingsService } from "./settings.service";
import {
  AdminSettingsSchema,
  type AdminSettingsResponse,
  type AdminSettingsDto,
} from "./settings.dto";

@Controller("admin/settings")
@UseGuards(AdminGuard)
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get()
  async getSettings(): Promise<AdminSettingsResponse> {
    return this.settingsService.getSettings();
  }

  @Put()
  async updateSettings(
    @CurrentUser("id") userId: string,
    @Body(new ZodValidationPipe(AdminSettingsSchema))
    body: AdminSettingsDto,
  ): Promise<AdminSettingsResponse> {
    return this.settingsService.updateSettings(userId, body);
  }
}
