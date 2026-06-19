import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
  Headers,
} from "@nestjs/common";
import { AdminGuard, CurrentUser } from "../auth";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import {
  AdminInviteUserSchema,
  AdminUpdateUserRoleSchema,
  type AdminDashboardResponse,
  type AdminInviteResponse,
  type AdminInviteUserDto,
  type AdminUpdateUserRoleDto,
  type AdminUpdateUserRoleResponse,
  type AdminUsersResponse,
} from "./admin.dto";
import { AdminService } from "./admin.service";

@Controller("admin")
@UseGuards(AdminGuard)
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get("users")
  async listUsers(
    @CurrentUser() adminUser: { id?: string; email?: string; role?: string },
    @Query("search") search?: string,
    @Query("role") role?: string,
  ): Promise<AdminUsersResponse> {
    return this.adminService.listUsers(adminUser, search, role);
  }

  @Post("users/invite")
  async inviteUser(
    @CurrentUser() adminUser: { id?: string; email?: string; role?: string },
    @Body(new ZodValidationPipe(AdminInviteUserSchema))
    body: AdminInviteUserDto,
    @Headers("origin") origin?: string,
  ): Promise<AdminInviteResponse> {
    return this.adminService.inviteUser(adminUser, {
      ...body,
      redirectUrl:
        body.redirectUrl ||
        (origin ? `${origin.replace(/\/+$/, "")}/login` : undefined),
    });
  }

  @Patch("users/:userId/role")
  async updateUserRole(
    @CurrentUser() adminUser: { id?: string; email?: string; role?: string },
    @Param("userId") userId: string,
    @Body(new ZodValidationPipe(AdminUpdateUserRoleSchema))
    body: AdminUpdateUserRoleDto,
  ): Promise<AdminUpdateUserRoleResponse> {
    return this.adminService.updateUserRole(adminUser, userId, body);
  }

  @Get("dashboard")
  async getDashboard(): Promise<AdminDashboardResponse> {
    return this.adminService.getDashboard();
  }
}
