import { Module } from "@nestjs/common";
import { AiModule } from "../ai";
import { MonetizationModule } from "../monetization/monetization.module";
import { CopilotController } from "./copilot.controller";
import { CopilotService } from "./copilot.service";

@Module({
  imports: [AiModule, MonetizationModule],
  controllers: [CopilotController],
  providers: [CopilotService],
})
export class CopilotModule {}
