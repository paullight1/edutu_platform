import { Module } from "@nestjs/common";
import { AiModule } from "../ai";
import { OpportunitiesModule } from "../opportunities/opportunities.module";
import { ProfileModule } from "../profile/profile.module";
import { GoalsModule } from "../goals/goals.module";
import { RoadmapsModule } from "../roadmaps/roadmaps.module";
import { DocumentsModule } from "../documents/documents.module";
import { CvModule } from "../cv/cv.module";
import { ApplicationDocumentsModule } from "../applications/application-documents.module";
import { ChatController } from "./chat.controller";
import { ChatService } from "./chat.service";
import { CoachToolsService } from "./tools/coach-tools.service";

@Module({
  imports: [
    AiModule,
    OpportunitiesModule,
    ProfileModule,
    GoalsModule,
    RoadmapsModule,
    DocumentsModule,
    CvModule,
    ApplicationDocumentsModule,
  ],
  controllers: [ChatController],
  providers: [ChatService, CoachToolsService],
})
export class ChatModule {}
