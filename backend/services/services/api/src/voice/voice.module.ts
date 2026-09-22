import { Module } from "@nestjs/common";
import { MonetizationModule } from "../monetization/monetization.module";
import { RealtimeVoiceService } from "./realtime-voice.service";
import { VoiceController } from "./voice.controller";

@Module({
  imports: [MonetizationModule],
  controllers: [VoiceController],
  providers: [RealtimeVoiceService],
  exports: [RealtimeVoiceService],
})
export class VoiceModule {}
