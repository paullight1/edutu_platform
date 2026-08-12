import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  Post,
  Res,
} from "@nestjs/common";
import type { Response } from "express";
import { CurrentUser } from "../auth";
import { AiMetered } from "../monetization/ai-metered.decorator";
import { ChatService } from "./chat.service";
import type { ScreenContext, WinCoachIntent } from "./chat.service";

@Controller("chat")
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Get("threads")
  listThreads(@CurrentUser("id") userId: string) {
    return this.chatService.listThreads(userId);
  }

  @Get("threads/:id/messages")
  listMessages(
    @CurrentUser("id") userId: string,
    @Param("id") threadId: string,
  ) {
    return this.chatService.listMessages(userId, threadId);
  }

  @Delete("threads/:id")
  deleteThread(
    @CurrentUser("id") userId: string,
    @Param("id") threadId: string,
  ) {
    return this.chatService.deleteThread(userId, threadId);
  }

  @Post("messages")
  @AiMetered("chatMessage")
  sendMessage(
    @CurrentUser("id") userId: string,
    @CurrentUser("authId") authId: string,
    @Body()
    body: {
      threadId?: string | null;
      message?: string;
      userId?: string;
      channel?: "text" | "voice";
      context?: ScreenContext;
      intent?: WinCoachIntent;
      /** UI language of the client; falls back to Accept-Language, then English. */
      locale?: string | null;
    },
    @Headers("accept-language") acceptLanguage?: string,
  ) {
    return this.chatService.sendMessage(userId, {
      ...body,
      // Raw auth subject — profiles are canonically keyed by it, so the agent
      // reads the populated row instead of a derived-uuid orphan.
      authId,
      locale: body.locale ?? acceptLanguage ?? null,
    });
  }

  /**
   * Same turn as POST /chat/messages but with live progress over SSE:
   * `turn.start` → `tool.start`/`tool.result` per agent tool call →
   * `token` per content delta (EVERY agent round streams, so tokens usually
   * start on the first one) →
   * `turn.final` carrying the exact /chat/messages response body →
   * `turn.error` if the turn throws (after which the stream closes).
   *
   * `token` (and the optional `turn.truncated` notice) are additive: clients
   * that don't know them ignore unknown events and keep rendering from
   * `turn.final`, which still carries the COMPLETE message and its metadata —
   * plus `metadata.truncated: true` when the answer is only partial, so a
   * client that never learned `turn.truncated` still knows.
   *
   * `tool.start`/`tool.result` also carry the tool call's `id`; a round runs its
   * tools in parallel, so pairing them by `name` is ambiguous (and impossible
   * when the model requests the same tool twice).
   *
   * DISCARD RULE — on `tool.start`, clear the token buffer. Anything streamed
   * before it came from a round that went on to call tools, so it is by
   * construction NOT part of `turn.final` (typically a "let me check…"
   * preamble). `turn.final` is always authoritative; reconcile against it.
   * The server relies on the same boundary: preamble the client is told to
   * discard does not block the legacy fallback if the turn later fails.
   */
  @Post("messages/stream")
  @AiMetered("chatMessage")
  async sendMessageStream(
    @CurrentUser("id") userId: string,
    @CurrentUser("authId") authId: string,
    @Body()
    body: {
      threadId?: string | null;
      message?: string;
      userId?: string;
      channel?: "text" | "voice";
      context?: ScreenContext;
      intent?: WinCoachIntent;
      /** UI language of the client; falls back to Accept-Language, then English. */
      locale?: string | null;
    },
    @Res() res: Response,
    @Headers("accept-language") acceptLanguage?: string,
  ) {
    // The provider request must not outlive the browser/app socket. Express
    // emits `close` for both an intentional disconnect and a destroyed
    // connection; only abort while the response is still open so a normal
    // `res.end()` does not race the generation signal.
    const generationAbort = new AbortController();
    const onResponseClose = () => {
      if (!res.writableEnded) generationAbort.abort();
    };
    res.once("close", onResponseClose);
    const cleanup = () => res.off("close", onResponseClose);

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders?.();

    const emit = (event: string, data: Record<string, unknown>) => {
      if (res.writableEnded) return;
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    emit("turn.start", {});
    try {
      const result = await this.chatService.sendMessage(
        userId,
        { ...body, authId, locale: body.locale ?? acceptLanguage ?? null },
        {
          emit,
          onToken: (content) => emit("token", { type: "token", content }),
          signal: generationAbort.signal,
        },
      );
      if (generationAbort.signal.aborted) {
        cleanup();
        if (!res.writableEnded) res.end();
        return;
      }
      emit("turn.final", result as unknown as Record<string, unknown>);
      cleanup();
      res.end();
    } catch (error) {
      // A disconnected client cannot receive an error event. Do not rethrow
      // this cancellation: the metering interceptor treats handler errors as
      // provider failures and would refund a charge even though generation may
      // already have consumed provider tokens.
      if (generationAbort.signal.aborted) {
        cleanup();
        if (!res.writableEnded) res.end();
        return;
      }
      emit("turn.error", {
        message: error instanceof Error ? error.message : "Chat turn failed",
        status: (error as { status?: number })?.status ?? 500,
      });
      cleanup();
      res.end();
      // Rethrow so the metering interceptor refunds the charge — the response
      // has already ended, so nothing else is written to the socket.
      throw error;
    }
  }
}
