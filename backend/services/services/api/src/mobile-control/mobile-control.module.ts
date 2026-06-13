import { Module } from "@nestjs/common";
import { MobileControlAdminController } from "./mobile-control-admin.controller";
import { MobileControlController } from "./mobile-control.controller";
import { MobileControlService } from "./mobile-control.service";

@Module({
  controllers: [MobileControlController, MobileControlAdminController],
  providers: [MobileControlService],
})
export class MobileControlModule {}
