import { streamChatMessage } from '@edutu/core/src/services/chatStream';
import type { SendChatMessageResult } from '@edutu/core/src/types/chat';
import { getConfig } from './config';

export type RealtimeVoiceStatus =
  | 'connecting'
  | 'listening'
  | 'thinking'
  | 'speaking'
  | 'muted'
  | 'error';

export interface RealtimeVoiceSessionHandlers {
  onReady?: (session: { callId: string | null; expiresAt: string }) => void;
  onStatus?: (status: RealtimeVoiceStatus) => void;
  onUserTranscript?: (transcript: string, final: boolean) => void;
  onAssistantTranscript?: (transcript: string, final: boolean) => void;
  onThread?: (threadId: string) => void;
  onExpiring?: () => void;
  onReconnectNeeded?: () => void;
  onError?: (error: Error) => void;
}

export interface RealtimeVoiceSessionOptions {
  userId: string;
  getAuthToken: () => Promise<string | null>;
  threadId?: string | null;
  voice: string;
  locale: string;
  handlers?: RealtimeVoiceSessionHandlers;
}

type MediaTrackLike = {
  enabled: boolean;
  stop(): void;
};

type MediaStreamLike = {
  getTracks(): MediaTrackLike[];
  getAudioTracks(): MediaTrackLike[];
};

type DataChannelLike = {
  readyState: string;
  onopen: (() => void) | null;
  onmessage: ((event: { data: string }) => void) | null;
  onclose: (() => void) | null;
  onerror: ((event: unknown) => void) | null;
  send(data: string): void;
  close(): void;
};

type PeerConnectionLike = {
  localDescription: { type?: string; sdp?: string } | null;
  connectionState: string;
  onconnectionstatechange: (() => void) | null;
  ontrack: ((event: unknown) => void) | null;
  createOffer(options?: unknown): Promise<{ type: string; sdp?: string }>;
  setLocalDescription(description: unknown): Promise<void>;
  setRemoteDescription(description: unknown): Promise<void>;
  addTrack(track: MediaTrackLike, stream: MediaStreamLike): unknown;
  createDataChannel(label: string, options?: unknown): DataChannelLike;
  close(): void;
};

type RtcAdapter = {
  RTCPeerConnection: new (configuration?: unknown) => PeerConnectionLike;
  RTCSessionDescription: new (description: {
    type: 'offer' | 'answer';
    sdp: string;
  }) => unknown;
  mediaDevices: {
    getUserMedia(constraints: unknown): Promise<MediaStreamLike>;
  };
};

type ChatSender = (options: {
  threadId: string | null;
  message: string;
  userId: string;
  authToken: string;
  channel: 'voice';
  locale: string;
  signal: AbortSignal;
  handlers: { onContent: (content: string) => void };
}) => Promise<SendChatMessageResult>;

interface RealtimeVoiceDependencies {
  rtc?: RtcAdapter;
  fetchImpl?: typeof fetch;
  sendMessage?: ChatSender;
  apiBaseUrl?: string;
  now?: () => number;
  setTimer?: typeof setTimeout;
  clearTimer?: typeof clearTimeout;
}

type RealtimeEvent = Record<string, unknown> & { type?: string };

function resolveRtc(): RtcAdapter {
  try {
    // Static string keeps the native dependency visible to Metro while the
    // lazy require lets Expo Go/non-native test environments fall back cleanly.
    return require('react-native-webrtc') as RtcAdapter;
  } catch {
    throw new Error('Native WebRTC is unavailable in this build');
  }
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function parseJsonObject(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'string') return null;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}

export class RealtimeVoiceSession {
  readonly dependencies: Required<
    Pick<RealtimeVoiceDependencies, 'fetchImpl' | 'sendMessage' | 'apiBaseUrl' | 'now' | 'setTimer' | 'clearTimer'>
  > & { rtc?: RtcAdapter };

  private peer: PeerConnectionLike | null = null;
  private channel: DataChannelLike | null = null;
  private localStream: MediaStreamLike | null = null;
  private abortController = new AbortController();
  private toolController: AbortController | null = null;
  private processedCallIds = new Set<string>();
  private transcriptDeltas = new Map<string, string>();
  private assistantDeltas = new Map<string, string>();
  private expirationTimer: ReturnType<typeof setTimeout> | null = null;
  private closed = false;
  private started = false;
  private muted = false;
  private reconnectRequested = false;
  private threadId: string | null;
  private sessionInfo: { callId: string | null; expiresAt: string } | null = null;

  constructor(
    private readonly options: RealtimeVoiceSessionOptions,
    dependencies: RealtimeVoiceDependencies = {},
  ) {
    this.threadId = options.threadId ?? null;
    this.dependencies = {
      rtc: dependencies.rtc,
      fetchImpl: dependencies.fetchImpl ?? globalThis.fetch.bind(globalThis),
      sendMessage: dependencies.sendMessage ?? streamChatMessage,
      apiBaseUrl: (dependencies.apiBaseUrl ?? getConfig().apiBaseUrl).replace(/\/$/, ''),
      now: dependencies.now ?? Date.now,
      setTimer: dependencies.setTimer ?? setTimeout,
      clearTimer: dependencies.clearTimer ?? clearTimeout,
    };
  }

  async start(): Promise<void> {
    if (this.started) return;
    if (this.closed) throw new Error('Live voice session is closed');
    this.started = true;
    this.options.handlers?.onStatus?.('connecting');

    try {
      const token = await this.options.getAuthToken();
      if (!token) throw new Error('Sign in to use Live voice');
      if (this.closed) return;

      const rtc = this.dependencies.rtc ?? resolveRtc();
      const stream = await rtc.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
        },
        video: false,
      });
      if (this.closed) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      this.localStream = stream;

      const peer = new rtc.RTCPeerConnection({
        bundlePolicy: 'max-bundle',
        rtcpMuxPolicy: 'require',
        iceCandidatePoolSize: 1,
      });
      this.peer = peer;
      stream.getAudioTracks().forEach((track) => {
        // Mute may have been restored before getUserMedia finished (resume,
        // reconnect, or a tap during startup). Never attach an enabled track
        // while the controller still presents a muted session.
        track.enabled = !this.muted;
        peer.addTrack(track, stream);
      });

      const channel = peer.createDataChannel('oai-events', { ordered: true });
      this.channel = channel;
      this.bindChannel(channel);
      peer.onconnectionstatechange = () => {
        if (this.closed) return;
        if (peer.connectionState === 'failed' || peer.connectionState === 'disconnected') {
          this.requestReconnect(new Error('Live voice connection was interrupted'));
        }
      };

      const offer = await peer.createOffer({ offerToReceiveAudio: true });
      await peer.setLocalDescription(offer);
      const offerSdp = peer.localDescription?.sdp ?? offer.sdp;
      if (!offerSdp) throw new Error('Could not create a WebRTC audio offer');

      const response = await this.dependencies.fetchImpl(
        `${this.dependencies.apiBaseUrl}/voice/realtime/session`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            sdp: offerSdp,
            voice: this.options.voice,
            locale: this.options.locale,
          }),
          signal: this.abortController.signal,
        },
      );
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.message || body?.error || `Live voice session responded ${response.status}`);
      }
      const answer = await response.json() as {
        sdp?: unknown;
        callId?: unknown;
        expiresAt?: unknown;
      };
      if (typeof answer.sdp !== 'string' || typeof answer.expiresAt !== 'string') {
        throw new Error('Live voice returned an invalid connection response');
      }
      this.sessionInfo = {
        callId: typeof answer.callId === 'string' ? answer.callId : null,
        expiresAt: answer.expiresAt,
      };
      await peer.setRemoteDescription(
        new rtc.RTCSessionDescription({ type: 'answer', sdp: answer.sdp }),
      );
      this.scheduleExpiration(answer.expiresAt);
    } catch (error) {
      const sessionError = new Error(
        `Live voice session failed: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
      this.reportError(sessionError);
      this.releaseResources();
      throw sessionError;
    }
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    this.localStream?.getAudioTracks().forEach((track) => {
      track.enabled = !muted;
    });
    this.options.handlers?.onStatus?.(muted ? 'muted' : 'listening');
  }

  interrupt(): void {
    if (this.closed) return;
    this.toolController?.abort();
    this.toolController = null;
    this.send({ type: 'response.cancel' });
    this.options.handlers?.onStatus?.(this.muted ? 'muted' : 'listening');
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.toolController?.abort();
    this.toolController = null;
    this.abortController.abort();
    this.releaseResources();
  }

  private bindChannel(channel: DataChannelLike): void {
    channel.onopen = () => {
      if (this.closed) return;
      this.options.handlers?.onReady?.(
        this.sessionInfo ?? { callId: null, expiresAt: '' },
      );
      this.options.handlers?.onStatus?.(this.muted ? 'muted' : 'listening');
    };
    channel.onmessage = (event) => {
      if (this.closed) return;
      const parsed = parseJsonObject(event.data);
      if (parsed) void this.handleEvent(parsed);
    };
    channel.onerror = () => {
      if (!this.closed) this.requestReconnect(new Error('Live voice data channel failed'));
    };
    channel.onclose = () => {
      if (!this.closed) this.requestReconnect(new Error('Live voice data channel closed'));
    };
  }

  private async handleEvent(event: RealtimeEvent): Promise<void> {
    const type = event.type;
    if (type === 'session.created' || type === 'session.updated') {
      this.options.handlers?.onStatus?.(this.muted ? 'muted' : 'listening');
      return;
    }
    if (type === 'input_audio_buffer.speech_started') {
      this.options.handlers?.onStatus?.(this.muted ? 'muted' : 'listening');
      return;
    }
    if (type === 'conversation.item.input_audio_transcription.delta') {
      const itemId = asString(event.item_id) || 'current-user';
      const transcript = `${this.transcriptDeltas.get(itemId) ?? ''}${asString(event.delta)}`;
      this.transcriptDeltas.set(itemId, transcript);
      this.options.handlers?.onUserTranscript?.(transcript, false);
      return;
    }
    if (type === 'conversation.item.input_audio_transcription.completed') {
      const itemId = asString(event.item_id) || 'current-user';
      const transcript = asString(event.transcript) || this.transcriptDeltas.get(itemId) || '';
      this.transcriptDeltas.delete(itemId);
      if (transcript) this.options.handlers?.onUserTranscript?.(transcript, true);
      return;
    }
    if (type === 'response.output_audio_transcript.delta') {
      const itemId = asString(event.item_id) || 'current-assistant';
      const transcript = `${this.assistantDeltas.get(itemId) ?? ''}${asString(event.delta)}`;
      this.assistantDeltas.set(itemId, transcript);
      this.options.handlers?.onAssistantTranscript?.(transcript, false);
      this.options.handlers?.onStatus?.('speaking');
      return;
    }
    if (type === 'response.output_audio_transcript.done') {
      const itemId = asString(event.item_id) || 'current-assistant';
      const transcript = asString(event.transcript) || this.assistantDeltas.get(itemId) || '';
      this.assistantDeltas.delete(itemId);
      if (transcript) this.options.handlers?.onAssistantTranscript?.(transcript, true);
      return;
    }
    if (type === 'response.function_call_arguments.done') {
      await this.fulfillToolCall(event);
      return;
    }
    if (type === 'response.done') {
      this.options.handlers?.onStatus?.(this.muted ? 'muted' : 'listening');
      return;
    }
    if (type === 'error') {
      const details = event.error && typeof event.error === 'object'
        ? event.error as Record<string, unknown>
        : null;
      this.reportError(new Error(asString(details?.message) || 'OpenAI Realtime reported an error'));
    }
  }

  private async fulfillToolCall(event: RealtimeEvent): Promise<void> {
    const callId = asString(event.call_id);
    const name = asString(event.name);
    if (!callId || name !== 'ask_edutu' || this.processedCallIds.has(callId)) return;
    this.processedCallIds.add(callId);

    const args = parseJsonObject(event.arguments);
    const message = asString(args?.message).trim();
    if (!message) {
      this.sendToolFailure(callId, 'The user message was empty.');
      return;
    }

    this.toolController?.abort();
    const toolController = new AbortController();
    this.toolController = toolController;
    const abortTool = () => toolController.abort();
    this.abortController.signal.addEventListener('abort', abortTool, { once: true });
    try {
      const token = await this.options.getAuthToken();
      if (!token) throw new Error('Sign in to continue');
      this.options.handlers?.onStatus?.('thinking');
      this.options.handlers?.onUserTranscript?.(message, true);
      const result = await this.dependencies.sendMessage({
        threadId: this.threadId,
        message,
        userId: this.options.userId,
        authToken: token,
        channel: 'voice',
        locale: this.options.locale,
        signal: toolController.signal,
        handlers: {
          onContent: (content) => {
            if (!this.closed) this.options.handlers?.onAssistantTranscript?.(content, false);
          },
        },
      });
      if (this.closed || toolController.signal.aborted) return;

      this.threadId = result.threadId;
      this.options.handlers?.onThread?.(result.threadId);
      const reply = result.assistantMessage?.content?.trim() || '';
      this.options.handlers?.onAssistantTranscript?.(reply, true);
      this.send({
        type: 'conversation.item.create',
        item: {
          type: 'function_call_output',
          call_id: callId,
          output: JSON.stringify({ threadId: result.threadId, reply }),
        },
      });
      this.send({
        type: 'response.create',
        response: {
          output_modalities: ['audio'],
          tool_choice: 'none',
          instructions:
            'Speak only the reply contained in the latest ask_edutu tool output. Preserve its meaning and language. Do not add facts.',
        },
      });
      this.options.handlers?.onStatus?.('speaking');
    } catch (error) {
      if (this.closed || this.abortController.signal.aborted || toolController.signal.aborted) return;
      const message = error instanceof Error ? error.message : 'Edutu could not answer';
      this.sendToolFailure(callId, message);
      this.reportError(new Error(message));
    } finally {
      this.abortController.signal.removeEventListener('abort', abortTool);
      if (this.toolController === toolController) this.toolController = null;
    }
  }

  private sendToolFailure(callId: string, message: string): void {
    this.send({
      type: 'conversation.item.create',
      item: {
        type: 'function_call_output',
        call_id: callId,
        output: JSON.stringify({ error: message }),
      },
    });
  }

  private send(event: Record<string, unknown>): void {
    if (this.closed || !this.channel || this.channel.readyState !== 'open') return;
    this.channel.send(JSON.stringify(event));
  }

  private scheduleExpiration(expiresAt: string): void {
    const delay = Date.parse(expiresAt) - this.dependencies.now();
    if (!Number.isFinite(delay) || delay <= 0) return;
    this.expirationTimer = this.dependencies.setTimer(() => {
      if (!this.closed) this.options.handlers?.onExpiring?.();
    }, Math.max(0, delay - 1_000));
  }

  private reportError(error: Error): void {
    this.options.handlers?.onStatus?.('error');
    this.options.handlers?.onError?.(error);
  }

  private requestReconnect(error: Error): void {
    if (this.reconnectRequested || this.closed) return;
    this.reconnectRequested = true;
    this.reportError(error);
    this.options.handlers?.onReconnectNeeded?.();
  }

  private releaseResources(): void {
    if (this.expirationTimer) {
      this.dependencies.clearTimer(this.expirationTimer);
      this.expirationTimer = null;
    }
    const stream = this.localStream;
    this.localStream = null;
    stream?.getTracks().forEach((track) => {
      try {
        track.stop();
      } catch {}
    });
    const channel = this.channel;
    this.channel = null;
    if (channel) {
      channel.onopen = null;
      channel.onmessage = null;
      channel.onclose = null;
      channel.onerror = null;
      try {
        channel.close();
      } catch {}
    }
    const peer = this.peer;
    this.peer = null;
    if (peer) {
      peer.onconnectionstatechange = null;
      peer.ontrack = null;
      try {
        peer.close();
      } catch {}
    }
  }
}
