import { Module } from "@nestjs/common";
import { AiModule } from "../ai";
import { CopilotController } from "./copilot.controller";
import { CopilotService } from "./copilot.service";

@Module({
  imports: [AiModule],
  controllers: [CopilotController],
  providers: [CopilotService],
})
export class CopilotModule {}
