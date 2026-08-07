import type { VoiceConfig } from '../config.js';
import type { Logger } from '../observability/logger.js';
import type { Metrics } from '../observability/metrics.js';
import { ApiCallbackClient } from './api-callback-client.js';

export type ParticipantJoinedConfirmation = {
  callId: string;
  userId: string;
  joinTokenJti: string;
};

export interface ParticipantJoinedConfirmer {
  confirm(confirmation: ParticipantJoinedConfirmation): Promise<void>;
  stop(): Promise<void>;
}

export class ApiParticipantJoinedConfirmer implements ParticipantJoinedConfirmer {
  private readonly callbacks: ApiCallbackClient;

  public constructor(
    config: VoiceConfig,
    private readonly metrics: Metrics,
    private readonly logger: Logger,
    callbacks?: ApiCallbackClient,
  ) {
    this.callbacks = callbacks ?? new ApiCallbackClient(config, metrics);
  }

  public async confirm(confirmation: ParticipantJoinedConfirmation): Promise<void> {
    const { callId, userId, joinTokenJti } = confirmation;
    this.metrics.increment(
      'voice_participant_join_confirmations_total',
      1,
      'Participant join confirmations requested',
    );
    try {
      await this.callbacks.post({
        path: `/internal/community-calls/${encodeURIComponent(callId)}/participants/${encodeURIComponent(userId)}/joined`,
        action: 'participant-joined',
        claims: { callId, userId, joinTokenJti },
        body: { joinTokenJti },
      });
      this.metrics.increment(
        'voice_participant_join_confirmations_succeeded_total',
        1,
        'Participant join confirmations accepted by the API',
      );
    } catch (error) {
      this.metrics.increment(
        'voice_participant_join_confirmations_failed_total',
        1,
        'Participant join confirmations not accepted by the API',
      );
      this.logger.warn('participant_join_confirmation_failed', {
        callId,
        userId,
        errorName: error instanceof Error ? error.name : 'UnknownError',
      });
      throw error;
    }
  }

  public stop(): Promise<void> {
    return this.callbacks.stop();
  }
}
