import type { VoiceConfig } from './config.js';
import {
  ApiMediaFailureReporter,
  type MediaFailureReporter,
} from './control-plane/media-failure-reporter.js';
import {
  ApiParticipantJoinedConfirmer,
  type ParticipantJoinedConfirmer,
} from './control-plane/participant-joined-confirmer.js';
import { HttpGatewayServer } from './http/http-server.js';
import type { MediaAdapter } from './media/contracts.js';
import { MediasoupAdapter } from './media/mediasoup-adapter.js';
import { logger as defaultLogger, type Logger } from './observability/logger.js';
import { Metrics } from './observability/metrics.js';
import { RoomRegistry } from './rooms/room-registry.js';
import { SignalingServer } from './signaling/signaling-server.js';

export type VoiceGateway = {
  config: VoiceConfig;
  media: MediaAdapter;
  metrics: Metrics;
  rooms: RoomRegistry;
  http: HttpGatewayServer;
  signaling: SignalingServer;
  mediaFailures: MediaFailureReporter;
  participantJoined: ParticipantJoinedConfirmer;
  start(): Promise<void>;
  stop(): Promise<void>;
};

export function createVoiceGateway(
  config: VoiceConfig,
  dependencies: {
    media?: MediaAdapter;
    metrics?: Metrics;
    logger?: Logger;
    mediaFailures?: MediaFailureReporter;
    participantJoined?: ParticipantJoinedConfirmer;
  } = {},
): VoiceGateway {
  const metrics = dependencies.metrics ?? new Metrics();
  const appLogger = dependencies.logger ?? defaultLogger;
  const media = dependencies.media ?? new MediasoupAdapter(config, metrics, appLogger);
  const mediaFailures = dependencies.mediaFailures ?? new ApiMediaFailureReporter(config, metrics, appLogger);
  const participantJoined = dependencies.participantJoined
    ?? new ApiParticipantJoinedConfirmer(config, metrics, appLogger);
  const rooms = new RoomRegistry(media, config, metrics, appLogger, mediaFailures);
  const http = new HttpGatewayServer(config, media, rooms, metrics, appLogger);
  const signaling = new SignalingServer(
    http.server,
    rooms,
    config,
    metrics,
    appLogger,
    participantJoined,
  );
  let started = false;

  return {
    config,
    media,
    metrics,
    rooms,
    http,
    signaling,
    mediaFailures,
    participantJoined,
    async start() {
      if (started) return;
      await media.start();
      try {
        await http.listen();
        started = true;
        appLogger.info('voice_gateway_started', {
          nodeId: config.nodeId,
          port: config.port,
          workers: media.healthyWorkerCount,
        });
      } catch (error) {
        await media.stop();
        throw error;
      }
    },
    async stop() {
      if (!started) {
        await participantJoined.stop();
        return;
      }
      const participantJoinedStopped = participantJoined.stop();
      rooms.closeAll();
      await signaling.close();
      await participantJoinedStopped;
      await http.close();
      await media.stop();
      await mediaFailures.stop();
      started = false;
      appLogger.info('voice_gateway_stopped', { nodeId: config.nodeId });
    },
  };
}
