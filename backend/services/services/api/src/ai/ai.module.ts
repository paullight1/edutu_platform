import { Module, type OnModuleDestroy } from "@nestjs/common";
import { AiController } from "./ai.controller";
import { AiEncryptionService } from "./ai-encryption.service";
import { installAiRuntimePolicy } from "./ai-runtime-policy";
import { AiService } from "./ai.service";
import { DeepSeekAdapter, GeminiAdapter } from "./adapters/gemini.adapter";
import { OpenRouterAdapter } from "./adapters/openrouter.adapter";
import { OpenAiAdapter } from "./adapters/openai.adapter";

@Module({
  controllers: [AiController],
  providers: [
    AiService,
    AiEncryptionService,
    DeepSeekAdapter,
    GeminiAdapter,
    OpenRouterAdapter,
    OpenAiAdapter,
  ],
  exports: [AiService],
})
export class AiModule implements OnModuleDestroy {
  private readonly restoreRuntimePolicy: () => void;

  constructor(aiService: AiService) {
    this.restoreRuntimePolicy = installAiRuntimePolicy(aiService);
  }

  onModuleDestroy(): void {
    this.restoreRuntimePolicy();
  }
}
