import { Inject, Injectable } from "@nestjs/common";
import { z } from "zod";
import { callError } from "./community-calls.errors";
import {
  COMMUNITY_CALLS_CONFIG,
  communityCallsConfig,
} from "./community-calls.config";
import { CommunityCallTokenService } from "./community-call-token.service";
import type {
  CommunityCallsConfig,
  PreparedRoom,
} from "./community-calls.types";

const PreparedRoomSchema = z.object({
  nodeId: z.string().min(1).max(200),
  roomId: z.string().min(1).max(200),
  signalingUrl: z
    .string()
    .url()
    .refine((value) => value.startsWith("wss://") || value.startsWith("ws://")),
});

@Injectable()
export class CommunityCallGatewayClient {
  constructor(
    private readonly tokens: CommunityCallTokenService,
    @Inject(COMMUNITY_CALLS_CONFIG)
    private readonly config: CommunityCallsConfig = communityCallsConfig(),
  ) {}

  async prepare(input: {
    callId: string;
    groupId: string;
    participantCap: number;
  }): Promise<PreparedRoom> {
    const response = await this.request(
      input.callId,
      "prepare",
      `/internal/calls/${encodeURIComponent(input.callId)}/room`,
      {
        method: "PUT",
        body: JSON.stringify({}),
      },
    );
    const parsed = PreparedRoomSchema.safeParse(await response.json());
    if (!parsed.success) throw callError.mediaUnavailable();
    return parsed.data;
  }

  async close(callId: string): Promise<void> {
    await this.request(
      callId,
      "close",
      `/internal/calls/${encodeURIComponent(callId)}/room`,
      { method: "DELETE" },
    );
  }

  private async request(
    callId: string,
    action: "prepare" | "close",
    path: string,
    init: RequestInit,
  ): Promise<Response> {
    if (!this.config.enabled || !this.config.gatewayUrl) {
      throw callError.mediaUnavailable();
    }
    const authorization = await this.tokens.signGatewayInternalToken(
      callId,
      action,
    );
    let response: Response;
    try {
      response = await fetch(`${this.config.gatewayUrl}${path}`, {
        ...init,
        headers: {
          authorization: `Bearer ${authorization}`,
          "content-type": "application/json",
          "x-request-id": randomRequestId(),
          ...(init.headers || {}),
        },
        signal: AbortSignal.timeout(this.config.gatewayTimeoutMs),
      });
    } catch {
      throw callError.mediaUnavailable();
    }
    if (!response.ok) throw callError.mediaUnavailable();
    return response;
  }
}

function randomRequestId(): string {
  return `call-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}
