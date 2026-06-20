import { Controller, Get, UseGuards } from "@nestjs/common";
import { AdminGuard } from "./admin.guard";
import { CurrentUser } from "./current-user.decorator";

type AdminAccessUser = {
  id?: string;
  email?: string;
  role?: string;
};

@Controller("auth")
export class AuthController {
  @Get("admin-access")
  @UseGuards(AdminGuard)
  getAdminAccess(@CurrentUser() user: AdminAccessUser | null) {
    return {
      allowed: true,
      userId: user?.id ?? null,
      email: user?.email ?? null,
      role: user?.role ?? null,
    };
  }
}
