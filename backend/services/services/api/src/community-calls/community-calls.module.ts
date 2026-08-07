import { Module } from "@nestjs/common";
import { NotificationsModule } from "../notifications/notifications.module";
import {
  COMMUNITY_CALLS_CONFIG,
  communityCallsConfig,
} from "./community-calls.config";
import {
  COMMUNITY_CALLS_REPOSITORY,
  DrizzleCommunityCallsRepository,
} from "./community-calls.repository";
import { CommunityCallGatewayClient } from "./community-call-gateway.client";
import { CommunityCallTokenService } from "./community-call-token.service";
import { CommunityCallsController } from "./community-calls.controller";
import { CommunityCallsInternalController } from "./community-calls.internal.controller";
import { CommunityCallsLifecycle } from "./community-calls.lifecycle";
import { CommunityCallsService } from "./community-calls.service";
import { NativeCallDeliveryService } from "./native-call-delivery.service";
import { NATIVE_CALL_PROVIDERS } from "./native-call-delivery.service";
import { ApnsVoipCallProvider, FcmCallProvider } from "./native-call-providers";

@Module({
  imports: [NotificationsModule],
  controllers: [CommunityCallsController, CommunityCallsInternalController],
  providers: [
    { provide: COMMUNITY_CALLS_CONFIG, useFactory: communityCallsConfig },
    {
      provide: COMMUNITY_CALLS_REPOSITORY,
      useClass: DrizzleCommunityCallsRepository,
    },
    CommunityCallTokenService,
    CommunityCallGatewayClient,
    {
      provide: NATIVE_CALL_PROVIDERS,
      useFactory: () => [new ApnsVoipCallProvider(), new FcmCallProvider()],
    },
    NativeCallDeliveryService,
    CommunityCallsService,
    CommunityCallsLifecycle,
  ],
  exports: [CommunityCallsService],
})
export class CommunityCallsModule {}
