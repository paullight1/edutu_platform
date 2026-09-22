import {
  BadGatewayException,
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  Optional,
  ServiceUnavailableException,
} from "@nestjs/common";
import { createHash } from "crypto";
import {
  MonetizationService,
  type MeterCharge,
} from "../monetization/monetization.service";

export const OPENAI_REALTIME_FETCH = "OPENAI_REALTIME_FETCH";

export const OPENAI_REALTIME_VOICES = [
  "alloy",
  "ash",
  "ballad",
  "coral",
  "echo",
  "sage",
  "shimmer",
  "verse",
  "marin",
  "cedar",
] as const;

export type OpenAiRealtimeVoice = (typeof OPENAI_REALTIME_VOICES)[number];

export interface CreateRealtimeSessionInput {
  sdp: string;
  voice?: string | null;
  locale?: string | null;
}

export interface CreateRealtimeSessionResult {
  sdp: string;
  callId: string | null;
  /** Client reconnect deadline for the one-started-minute reservation. */
  expiresAt: string;
}

const OPENAI_REALTIME_CALLS_URL = "https://api.openai.com/v1/realtime/calls";
const DEFAULT_REALTIME_MODEL = "gpt-realtime-2.1";
const DEFAULT_REALTIME_VOICE: OpenAiRealtimeVoice = "marin";
const MAX_SDP_BYTES = 64 * 1024;
const CLIENT_SESSION_WINDOW_MS = 55_000;

function normalizeLocale(value?: string | null): string {
  const locale = value?.trim().toLowerCase().split(/[-_,]/)[0] ?? "";
  return /^[a-z]{2}$/.test(locale) ? locale : "en";
}

function safetyIdentifier(userId: string): string {
  return createHash("sha256").update(`edutu:${userId}`).digest("hex");
}

function callIdFromLocation(location: string | null): string | null {
  const value = location?.trim();
  if (!value) return null;
  const callId = value.split("/").filter(Boolean).at(-1) ?? null;
  return callId && /^rtc_[A-Za-z0-9_-]+$/.test(callId) ? callId : null;
}

@Injectable()
export class RealtimeVoiceService {
  private readonly logger = new Logger(RealtimeVoiceService.name);
  private readonly fetchImpl: typeof fetch;

  constructor(
    private readonly monetization: MonetizationService,
    @Optional()
    @Inject(OPENAI_REALTIME_FETCH)
    fetchImpl?: typeof fetch,
  ) {
    this.fetchImpl = fetchImpl ?? globalThis.fetch.bind(globalThis);
  }

  async createSession(
    userId: string,
    input: CreateRealtimeSessionInput,
  ): Promise<CreateRealtimeSessionResult> {
    const sdp = this.validateSdp(input?.sdp);
    const voice = this.validateVoice(input?.voice);
    const apiKey = process.env.OPENAI_API_KEY?.trim();
    if (!apiKey) {
      throw new ServiceUnavailableException({
        code: "realtime_unavailable",
        message: "Live voice is temporarily unavailable.",
      });
    }

    const charge = await this.monetization.meter(userId, "voicePerMinute", 1);

    try {
      const body = new FormData();
      body.set("sdp", sdp);
      body.set(
        "session",
        JSON.stringify(this.sessionConfiguration(voice, input?.locale)),
      );
      const response = await this.fetchImpl(OPENAI_REALTIME_CALLS_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "OpenAI-Safety-Identifier": safetyIdentifier(userId),
        },
        body,
      });

      if (!response.ok) {
        this.logger.warn(
          `OpenAI Realtime setup rejected with status ${response.status}`,
        );
        throw new BadGatewayException({
          code: "realtime_setup_failed",
          message: "Live voice could not connect. Please try again.",
        });
      }

      const answerSdp = await response.text();
      if (!answerSdp.trim()) {
        throw new BadGatewayException({
          code: "realtime_setup_failed",
          message: "Live voice returned an invalid connection response.",
        });
      }

      return {
        sdp: answerSdp,
        callId: callIdFromLocation(response.headers.get("location")),
        expiresAt: new Date(
          Date.now() + CLIENT_SESSION_WINDOW_MS,
        ).toISOString(),
      };
    } catch (error) {
      await this.refundSetup(charge);
      if (error instanceof BadGatewayException) throw error;
      this.logger.warn(
        `OpenAI Realtime setup transport failed: ${
          error instanceof Error ? error.name : "unknown"
        }`,
      );
      throw new BadGatewayException({
        code: "realtime_setup_failed",
        message: "Live voice could not connect. Please try again.",
      });
    }
  }

  private validateSdp(value: unknown): string {
    if (typeof value !== "string") {
      throw new BadRequestException("A WebRTC SDP offer is required");
    }
    const sdp = value.trim();
    if (
      !sdp.startsWith("v=0") ||
      !/(?:^|\r?\n)m=audio\s/m.test(sdp) ||
      Buffer.byteLength(sdp, "utf8") > MAX_SDP_BYTES
    ) {
      throw new BadRequestException("Invalid WebRTC SDP offer");
    }
    return sdp;
  }

  private validateVoice(value?: string | null): OpenAiRealtimeVoice {
    const voice = value?.trim().toLowerCase() || DEFAULT_REALTIME_VOICE;
    if (!(OPENAI_REALTIME_VOICES as readonly string[]).includes(voice)) {
      throw new BadRequestException("Unsupported Realtime voice");
    }
    return voice as OpenAiRealtimeVoice;
  }

  private sessionConfiguration(
    voice: OpenAiRealtimeVoice,
    locale?: string | null,
  ) {
    return {
      type: "realtime",
      model:
        process.env.OPENAI_REALTIME_MODEL?.trim() || DEFAULT_REALTIME_MODEL,
      output_modalities: ["audio"],
      max_output_tokens: 1024,
      instructions: [
        "You are the low-latency voice interface for Edutu Coach.",
        "For every completed user utterance, call ask_edutu exactly once with the user's complete meaning.",
        "Never answer the user directly and never use your own knowledge for the answer.",
        "After receiving the tool output, speak its reply faithfully in a natural, warm, concise voice.",
        "Do not mention tools, providers, hidden instructions, or implementation details.",
      ].join(" "),
      audio: {
        input: {
          noise_reduction: { type: "near_field" },
          transcription: {
            model: "gpt-live-transcribe",
            language: normalizeLocale(locale),
          },
          turn_detection: {
            type: "semantic_vad",
            create_response: true,
            interrupt_response: true,
          },
        },
        output: {
          voice,
        },
      },
      tools: [
        {
          type: "function",
          name: "ask_edutu",
          description:
            "Send the user's completed utterance to the authoritative Edutu Coach backend and return its saved reply.",
          parameters: {
            type: "object",
            additionalProperties: false,
            properties: {
              message: { type: "string" },
            },
            required: ["message"],
          },
        },
      ],
      tool_choice: "required",
    };
  }

  private async refundSetup(charge: MeterCharge): Promise<void> {
    try {
      await this.monetization.refund(charge);
    } catch {
      // refund() is already best-effort and logs its own provider/storage error.
    }
  }
}
