import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Res,
} from "@nestjs/common";
import type { Response } from "express";
import { CurrentUser } from "../auth";
import { AiMetered } from "../monetization/ai-metered.decorator";
import { ChatService } from "./chat.service";

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
    @Body()
    body: {
      threadId?: string | null;
      message?: string;
      userId?: string;
      channel?: "text" | "voice";
    },
  ) {
    return this.chatService.sendMessage(userId, body);
  }

  /**
   * Same turn as POST /chat/messages but with live progress over SSE:
   * `turn.start` → `tool.start`/`tool.result` per agent tool call →
   * `turn.final` carrying the exact /chat/messages response body →
   * `turn.error` if the turn throws (after which the stream closes).
   */
  @Post("messages/stream")
  @AiMetered("chatMessage")
  async sendMessageStream(
    @CurrentUser("id") userId: string,
    @Body()
    body: {
      threadId?: string | null;
      message?: string;
      userId?: string;
      channel?: "text" | "voice";
    },
    @Res() res: Response,
  ) {
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
      const result = await this.chatService.sendMessage(userId, body, {
        emit,
      });
      emit("turn.final", result as unknown as Record<string, unknown>);
      res.end();
    } catch (error) {
      emit("turn.error", {
        message: error instanceof Error ? error.message : "Chat turn failed",
        status: (error as { status?: number })?.status ?? 500,
      });
      res.end();
      // Rethrow so the metering interceptor refunds the charge — the response
      // has already ended, so nothing else is written to the socket.
      throw error;
    }
  }
}
