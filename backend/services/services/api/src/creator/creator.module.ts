import { Module } from "@nestjs/common";
import { NotificationsModule } from "../notifications/notifications.module";
import { CreatorController } from "./creator.controller";
import { CreatorProofController } from "./creator-proof.controller";
import { CreatorProofService } from "./creator-proof.service";
import { CreatorService } from "./creator.service";

@Module({
  imports: [NotificationsModule],
  controllers: [CreatorController, CreatorProofController],
  providers: [CreatorService, CreatorProofService],
  exports: [CreatorService, CreatorProofService],
})
export class CreatorModule {}
