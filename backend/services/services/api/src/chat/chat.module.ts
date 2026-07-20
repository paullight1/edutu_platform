import { Module } from "@nestjs/common";
import { AiModule } from "../ai";
import { OpportunitiesModule } from "../opportunities/opportunities.module";
import { ProfileModule } from "../profile/profile.module";
import { GoalsModule } from "../goals/goals.module";
import { RoadmapsModule } from "../roadmaps/roadmaps.module";
import { DocumentsModule } from "../documents/documents.module";
import { CvModule } from "../cv/cv.module";
import { ApplicationDocumentsModule } from "../applications/application-documents.module";
import { UploadsModule } from "../uploads/uploads.module";
import { SettingsModule } from "../settings/settings.module";
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
    UploadsModule,
    // For the admin-configurable crisis contact in the self-harm support path.
    // No cycle: SettingsModule imports only AuditModule.
    SettingsModule,
  ],
  controllers: [ChatController],
  providers: [ChatService, CoachToolsService],
})
export class ChatModule {}
