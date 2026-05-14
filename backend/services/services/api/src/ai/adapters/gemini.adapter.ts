import { Injectable } from '@nestjs/common';
import { GoogleGenAI } from '@google/genai';
import {
  AiGenerateOptions,
  AiGenerateResult,
  AiProviderAdapter,
  AiRouteConfig,
} from '../ai.types';

@Injectable()
export class GeminiAdapter implements AiProviderAdapter {
  readonly provider = 'gemini';

  async generateText(
    config: AiRouteConfig,
    options: AiGenerateOptions,
  ): Promise<AiGenerateResult> {
    if (!config.apiKey) {
      throw new Error('Gemini API key is not configured');
    }

    const ai = new GoogleGenAI({ apiKey: config.apiKey });
    const response = await ai.models.generateContent({
      model: config.model,
      contents: options.prompt,
      config: {
        ...(config.systemPrompt || options.systemInstruction
          ? { systemInstruction: config.systemPrompt || options.systemInstruction || undefined }
          : {}),
        ...(config.responseMimeType || options.responseMimeType
          ? { responseMimeType: config.responseMimeType || options.responseMimeType || undefined }
          : {}),
        ...(typeof config.temperature === 'number' || typeof options.temperature === 'number'
          ? { temperature: config.temperature ?? options.temperature ?? undefined }
          : {}),
        ...(config.maxOutputTokens || options.maxOutputTokens
          ? { maxOutputTokens: config.maxOutputTokens || options.maxOutputTokens || undefined }
          : {}),
      },
    });

    return {
      text: response.text?.trim() || '',
      provider: this.provider,
      model: config.model,
      usage: {
        promptTokens: response.usageMetadata?.promptTokenCount,
        completionTokens: response.usageMetadata?.candidatesTokenCount,
        totalTokens: response.usageMetadata?.totalTokenCount,
      },
    };
  }
}
