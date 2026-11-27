import { AutoApplyActivityService } from "./auto-apply-activity.service";
import { AutoApplyAdminController } from "./auto-apply-admin.controller";
import { AutoApplyWorker } from "./auto-apply-worker.service";
import { CvModule } from "../cv/cv.module";
import { UploadsModule } from "../uploads/uploads.module";
import { AiModule } from "../ai";
import { BillingModule } from "../billing/billing.module";
import { AutoApplyController } from "./auto-apply.controller";
import { Module } from "@nestjs/common";
import { NotificationsModule } from "../notifications/notifications.module";
import { ApplicationHistoryService } from "./application-history.service";
import { MeController } from "./me.controller";
import { MeService } from "./me.service";
import { ApplicationListService } from "./application-list.service";

@Module({
  imports: [NotificationsModule, BillingModule, CvModule, AiModule, UploadsModule],
  controllers: [MeController, AutoApplyController, AutoApplyAdminController],
  providers: [
    MeService,
    ApplicationHistoryService,
    ApplicationListService,
    AutoApplyWorker,
    AutoApplyActivityService,
  ],
  exports: [MeService, ApplicationHistoryService],
})
export class MeModule {}
