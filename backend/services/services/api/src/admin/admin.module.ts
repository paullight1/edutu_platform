import { Module } from "@nestjs/common";
import { AuditModule } from "../common/audit";
import { AdminController } from "./admin.controller";
import { AdminService } from "./admin.service";
import { AdminCommunitySafetyController } from "./community-safety.controller";
import { AdminCommunityManagementController } from "./community-management.controller";
import { AdminCommunityManagementService } from "./community-management.service";
import {
  ADMIN_COMMUNITY_SAFETY_STORE,
  AdminCommunitySafetyService,
  DrizzleAdminCommunitySafetyStore,
} from "./community-safety.service";

@Module({
  imports: [AuditModule],
  controllers: [
    AdminController,
    AdminCommunitySafetyController,
    AdminCommunityManagementController,
  ],
  providers: [
    AdminService,
    AdminCommunityManagementService,
    AdminCommunitySafetyService,
    {
      provide: ADMIN_COMMUNITY_SAFETY_STORE,
      useClass: DrizzleAdminCommunitySafetyStore,
    },
  ],
  exports: [AdminService, AdminCommunitySafetyService],
})
export class AdminModule {}
