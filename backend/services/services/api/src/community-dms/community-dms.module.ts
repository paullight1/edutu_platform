import { Module } from "@nestjs/common";
import { CommunityDmsController } from "./community-dms.controller";
import { CommunityDmsService } from "./community-dms.service";

@Module({
  controllers: [CommunityDmsController],
  providers: [CommunityDmsService],
  exports: [CommunityDmsService],
})
export class CommunityDmsModule {}
