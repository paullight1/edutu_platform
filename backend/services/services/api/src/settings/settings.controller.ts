import { Body, Controller, Get, Put, UseGuards } from "@nestjs/common";
import { CurrentUser } from "../auth";
import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from "@nestjs/common";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { SettingsService } from "./settings.service";
import {
  AdminSettingsSchema,
  type AdminSettingsResponse,
  type AdminSettingsDto,
} from "./settings.dto";

/** Global platform controls require an actual admin role. Support and
 * moderation roles retain access to their scoped workflows only. */
@Injectable()
export class PlatformAdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const user = context.switchToHttp().getRequest().user;
    const email =
      typeof user?.email === "string" ? user.email.toLowerCase() : "";
    const allowlistedEmails = (process.env.ADMIN_EMAILS ?? "")
      .split(",")
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean);
    if (
      user &&
      (user.role === "admin" ||
        user.role === "super_admin" ||
        (email && allowlistedEmails.includes(email)))
    ) {
      return true;
    }
    throw new ForbiddenException("Platform administrator access required");
  }
}

@Controller("admin/settings")
@UseGuards(PlatformAdminGuard)
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
