import { Injectable } from '@nestjs/common';
import {
  AiGenerateOptions,
  AiGenerateResult,
  AiProviderAdapter,
  AiRouteConfig,
} from '../ai.types';

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

@Injectable()
export class OpenRouterAdapter implements AiProviderAdapter {
  readonly provider = 'openrouter';

  async generateText(
    config: AiRouteConfig,
    options: AiGenerateOptions,
  ): Promise<AiGenerateResult> {
    if (!config.apiKey) {
      throw new Error('OpenRouter API key is not configured');
    }

    const messages = [
      ...(config.systemPrompt || options.systemInstruction
        ? [
            {
              role: 'system',
              content: config.systemPrompt || options.systemInstruction,
            },
          ]
        : []),
      { role: 'user', content: options.prompt },
    ];

    const response = await fetch(OPENROUTER_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
        'HTTP-Referer': process.env.OPENROUTER_REFERRER || 'https://edutu.app',
        'X-Title': process.env.OPENROUTER_TITLE || 'Edutu AI',
      },
      body: JSON.stringify({
        model: config.model,
        messages,
        stream: false,
        ...(typeof config.temperature === 'number' ||
        typeof options.temperature === 'number'
          ? { temperature: config.temperature ?? options.temperature }
          : {}),
        ...(config.maxOutputTokens || options.maxOutputTokens
          ? { max_tokens: config.maxOutputTokens || options.maxOutputTokens }
          : {}),
      }),
    });

    if (!response.ok) {
      throw new Error(
        `OpenRouter request failed: ${response.status} ${await response.text()}`,
      );
    }

    const payload = await response.json();
    return {
      text: payload?.choices?.[0]?.message?.content?.trim() || '',
      provider: this.provider,
      model: config.model,
      usage: {
        promptTokens: payload?.usage?.prompt_tokens,
        completionTokens: payload?.usage?.completion_tokens,
        totalTokens: payload?.usage?.total_tokens,
      },
    };
  }
}
