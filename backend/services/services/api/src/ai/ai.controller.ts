import { Body, Controller, Get, Post, UseGuards } from "@nestjs/common";
import { AdminGuard, CurrentUser } from "../auth";
import { AiService } from "./ai.service";

@Controller("ai")
@UseGuards(AdminGuard)
export class AiController {
  constructor(private readonly aiService: AiService) {}

  @Get("config")
  getConfig() {
    return this.aiService.listConfig();
  }

  @Post("provider-keys")
  saveProviderKey(
    @CurrentUser("id") userId: string | null,
    @Body()
    body: {
      provider: string;
      label: string;
      apiKey: string;
    },
  ) {
    return this.aiService.saveProviderKey({
      provider: body.provider,
      label: body.label,
      apiKey: body.apiKey,
      createdBy: userId,
    });
  }

  @Post("routes")
  upsertRoute(
    @CurrentUser("id") userId: string | null,
    @Body()
    body: {
      feature: string;
      provider: string;
      model: string;
      providerKeyId?: string | null;
      systemPrompt?: string | null;
      temperature?: number | null;
      maxOutputTokens?: number | null;
      responseMimeType?: string | null;
      fallbackProvider?: string | null;
      fallbackModel?: string | null;
      isEnabled?: boolean;
      metadata?: Record<string, unknown>;
    },
  ) {
    return this.aiService.upsertRoute({
      ...body,
      updatedBy: userId,
    });
  }

  @Post("test")
  async testRoute(
    @Body()
    body: {
      feature: string;
      prompt: string;
      responseMimeType?: string | null;
    },
  ) {
    const result = await this.aiService.generateText({
      feature: body.feature,
      prompt: body.prompt,
      responseMimeType: body.responseMimeType,
      metadata: { source: "admin-test" },
    });

    return {
      text: result.text,
      provider: result.provider,
      model: result.model,
      usage: result.usage || null,
    };
  }
}
