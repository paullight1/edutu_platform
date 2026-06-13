import { Body, Controller, Delete, Get, Param, Post } from "@nestjs/common";
import { CurrentUser } from "../auth";
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
  sendMessage(
    @CurrentUser("id") userId: string,
    @Body()
    body: { threadId?: string | null; message?: string; userId?: string },
  ) {
    return this.chatService.sendMessage(userId, body);
  }
}
