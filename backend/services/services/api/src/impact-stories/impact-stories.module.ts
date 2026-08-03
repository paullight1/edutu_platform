import { Module } from "@nestjs/common";
import { ImpactStoriesController } from "./impact-stories.controller";
import { ImpactStoriesService } from "./impact-stories.service";

@Module({
  controllers: [ImpactStoriesController],
  providers: [ImpactStoriesService],
  exports: [ImpactStoriesService],
})
export class ImpactStoriesModule {}
