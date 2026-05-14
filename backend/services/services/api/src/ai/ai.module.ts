import { Module } from '@nestjs/common';
import { AiController } from './ai.controller';
import { AiEncryptionService } from './ai-encryption.service';
import { AiService } from './ai.service';
import { GeminiAdapter } from './adapters/gemini.adapter';
import { OpenRouterAdapter } from './adapters/openrouter.adapter';

@Module({
  controllers: [AiController],
  providers: [AiService, AiEncryptionService, GeminiAdapter, OpenRouterAdapter],
  exports: [AiService],
})
export class AiModule {}
