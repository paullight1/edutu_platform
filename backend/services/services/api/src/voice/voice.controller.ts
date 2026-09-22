import { Body, Controller, Post } from "@nestjs/common";
import { ClerkOnly, CurrentUser } from "../auth";
import {
  type CreateRealtimeSessionInput,
  RealtimeVoiceService,
} from "./realtime-voice.service";

@Controller("voice")
@ClerkOnly()
export class VoiceController {
  constructor(private readonly realtimeVoice: RealtimeVoiceService) {}

  @Post("realtime/session")
  createRealtimeSession(
    @CurrentUser("id") userId: string,
    @Body() body: CreateRealtimeSessionInput,
  ) {
    return this.realtimeVoice.createSession(userId, body);
  }
}
