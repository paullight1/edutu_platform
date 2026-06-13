import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  UseGuards,
  Headers,
} from "@nestjs/common";
import { AdminGuard, CurrentUser } from "../auth";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import {
  AdminInviteUserSchema,
  type AdminDashboardResponse,
  type AdminInviteResponse,
  type AdminInviteUserDto,
  type AdminUsersResponse,
} from "./admin.dto";
import { AdminService } from "./admin.service";

@Controller("admin")
@UseGuards(AdminGuard)
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get("users")
  async listUsers(
    @Query("search") search?: string,
    @Query("role") role?: string,
  ): Promise<AdminUsersResponse> {
    return this.adminService.listUsers(search, role);
  }

  @Post("users/invite")
  async inviteUser(
    @CurrentUser("id") adminUserId: string,
    @Body(new ZodValidationPipe(AdminInviteUserSchema))
    body: AdminInviteUserDto,
    @Headers("origin") origin?: string,
  ): Promise<AdminInviteResponse> {
    return this.adminService.inviteUser(adminUserId, {
      ...body,
      redirectUrl:
        body.redirectUrl ||
        (origin ? `${origin.replace(/\/+$/, "")}/login` : undefined),
    });
  }

  @Get("dashboard")
  async getDashboard(): Promise<AdminDashboardResponse> {
    return this.adminService.getDashboard();
  }
}
