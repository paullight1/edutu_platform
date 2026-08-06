import { Module } from "@nestjs/common";
import { AdminModule } from "../admin/admin.module";
import { GrowthSnapshotService } from "./growth-snapshot.service";

@Module({
  imports: [AdminModule],
  providers: [GrowthSnapshotService],
})
export class AnalyticsModule {}
