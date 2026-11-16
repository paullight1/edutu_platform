import { SignalingProtocolError, type CommunityCallSignaling, type SignalingEvent } from './signaling';

type AnyRecord = Record<string, any>;
export type CommunityAudioRoute = { name: string; type: string; selected?: boolean };

function row(value: unknown, label: string): AnyRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`Voice server returned invalid ${label}.`);
  return value as AnyRecord;
}

export class CommunityCallMediaSession {
  private device: any;
  private sendTransport: any;
  private recvTransport: any;
  private producer: any;
  private consumers = new Map<string, any>();
  private consuming = new Set<string>();
  private queuedProducers = new Set<string>();
  private localStream: any;
  private unsubscribe: (() => void) | null = null;
  private disconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private readyToConsume = false;
  private closed = false;

  constructor(private readonly signaling: CommunityCallSignaling, private readonly onDisconnected?: () => void) {}

  private assertOpen() {
    if (this.closed) throw new Error('Call media session was cancelled.');
  }

  async start(existingProducers: Array<{ producerId: string }> = []): Promise<void> {
    if (this.closed) throw new Error('Call media session is closed.');
    // Subscribe before the first await. Producers announced after authenticate
    // but while native modules/transports load are queued and cannot be lost.
    this.unsubscribe = this.signaling.onEvent((event) => { void this.handleEvent(event); });
    for (const { producerId } of existingProducers) this.queuedProducers.add(producerId);
    let webrtc: any; let mediasoup: any;
    try {
      webrtc = await import('react-native-webrtc');
      // mediasoup-client reads WebRTC globals during module initialization.
      webrtc.registerGlobals?.();
      mediasoup = await import('mediasoup-client');
    }
    catch { throw new Error('Voice calls need an Edutu development or store build. Expo Go is not supported.'); }
    this.assertOpen();
    const Device = mediasoup.Device ?? mediasoup.default?.Device;
    if (!Device || !webrtc.mediaDevices?.getUserMedia) throw new Error('Voice calling is unavailable in this build.');
    this.device = new Device();
    const capabilities = row(await this.signaling.request('getRouterRtpCapabilities'), 'router capabilities');
    this.assertOpen();
    await this.device.load({ routerRtpCapabilities: capabilities });
    this.assertOpen();

    const [sendOptions, recvOptions] = await Promise.all([
      this.signaling.request('createTransport', { direction: 'send' }),
      this.signaling.request('createTransport', { direction: 'recv' }),
    ]);
    this.assertOpen();
    this.sendTransport = this.device.createSendTransport(row(sendOptions, 'send transport'));
    this.recvTransport = this.device.createRecvTransport(row(recvOptions, 'receive transport'));
    this.bindSendTransport(); this.bindRecvTransport();
    this.readyToConsume = true;
    await Promise.all([...this.queuedProducers].map((producerId) => this.consumeProducer(producerId)));
    this.assertOpen();

    // getUserMedia is the permission boundary. Audio only: this module never asks for camera.
    this.localStream = await webrtc.mediaDevices.getUserMedia({ audio: true, video: false });
    if (this.closed) {
      for (const streamTrack of this.localStream?.getTracks?.() ?? []) streamTrack.stop?.();
      this.localStream = null;
      throw new Error('Call media session was cancelled.');
    }
    const track = this.localStream.getAudioTracks?.()[0];
    if (!track) throw new Error('No microphone is available.');
    track.enabled = false;
    this.producer = await this.sendTransport.produce({ track, paused: true, appData: { mediaTag: 'microphone' } });
    this.assertOpen();
  }

  private handleConnectionState(state: string) {
    if (state === 'connected') {
      if (this.disconnectTimer) clearTimeout(this.disconnectTimer);
      this.disconnectTimer = null;
      return;
    }
    if (state === 'failed' || state === 'closed') {
      this.onDisconnected?.();
      return;
    }
    if (state === 'disconnected' && !this.disconnectTimer) {
      this.disconnectTimer = setTimeout(() => { this.disconnectTimer = null; if (!this.closed) this.onDisconnected?.(); }, 5_000);
    }
  }

  private bindSendTransport() {
    this.sendTransport.on('connectionstatechange', (state: string) => this.handleConnectionState(state));
    this.sendTransport.on('connect', ({ dtlsParameters }: AnyRecord, callback: () => void, errback: (e: Error) => void) => {
      void this.signaling.request('connectTransport', { transportId: this.sendTransport.id, dtlsParameters }).then(() => callback(), errback);
    });
    this.sendTransport.on('produce', ({ kind, rtpParameters }: AnyRecord, callback: (v: AnyRecord) => void, errback: (e: Error) => void) => {
      if (kind !== 'audio') return errback(new Error('Only audio can be produced.'));
      void this.signaling.request('produceAudio', { transportId: this.sendTransport.id, rtpParameters }).then((value) => {
        const result = row(value, 'producer'); if (typeof result.id !== 'string') throw new Error('Voice server returned invalid producer.'); callback({ id: result.id });
      }, errback);
    });
  }
  private bindRecvTransport() {
    this.recvTransport.on('connectionstatechange', (state: string) => this.handleConnectionState(state));
    this.recvTransport.on('connect', ({ dtlsParameters }: AnyRecord, callback: () => void, errback: (e: Error) => void) => {
      void this.signaling.request('connectTransport', { transportId: this.recvTransport.id, dtlsParameters }).then(() => callback(), errback);
    });
  }
  async setMuted(muted: boolean): Promise<void> {
    if (!this.producer) return;
    const action = muted ? 'pauseProducer' : 'resumeProducer';
    const track = this.localStream?.getAudioTracks?.()[0];
    if (muted && track) track.enabled = false;
    if (!muted && track) track.enabled = true;
    try {
      await this.signaling.request(action, { producerId: this.producer.id });
      if (muted) this.producer.pause(); else this.producer.resume();
    } catch (error) {
      if (track) track.enabled = muted;
      throw error;
    }
  }
  private async handleEvent(event: SignalingEvent) {
    if (this.closed) return;
    const producerId = event.data.producerId;
    if (event.type === 'producerClosed' && typeof producerId === 'string') {
      this.queuedProducers.delete(producerId);
      const consumer = this.consumers.get(producerId);
      consumer?.close?.();
      this.consumers.delete(producerId);
      return;
    }
    if (event.type !== 'newProducer' || typeof producerId !== 'string') return;
    this.queuedProducers.add(producerId);
    if (this.readyToConsume) {
      try { await this.consumeProducer(producerId); }
      catch (error) {
        if (!(error instanceof SignalingProtocolError && error.code === 'PRODUCER_NOT_FOUND')) this.onDisconnected?.();
      }
    }
  }
  private async consumeProducer(producerId: string) {
    if (this.closed || !this.readyToConsume || this.consumers.has(producerId) || this.consuming.has(producerId)) return;
    this.consuming.add(producerId);
    try {
      const result = row(await this.signaling.request('consume', { transportId: this.recvTransport.id, producerId, rtpCapabilities: this.device.rtpCapabilities }), 'consumer');
      if (typeof result.id !== 'string' || result.producerId !== producerId || result.kind !== 'audio' || !result.rtpParameters) {
        throw new Error('Voice server returned an invalid consumer.');
      }
      if (this.closed) return;
      const consumer = await this.recvTransport.consume(result);
      this.consumers.set(producerId, consumer);
      await this.signaling.request('resumeConsumer', { consumerId: consumer.id });
      consumer.resume?.();
      this.queuedProducers.delete(producerId);
      consumer.on?.('producerclose', () => { consumer.close?.(); this.consumers.delete(producerId); });
    } finally {
      this.consuming.delete(producerId);
    }
  }
  async close(): Promise<void> {
    if (this.closed) return; this.closed = true; this.readyToConsume = false; this.unsubscribe?.();
    if (this.disconnectTimer) clearTimeout(this.disconnectTimer);
    this.disconnectTimer = null;
    await this.signaling.request('leave').catch(() => undefined);
    this.producer?.close?.(); for (const consumer of this.consumers.values()) consumer.close?.();
    this.sendTransport?.close?.(); this.recvTransport?.close?.();
    for (const track of this.localStream?.getTracks?.() ?? []) track.stop?.();
    this.consumers.clear(); this.consuming.clear(); this.queuedProducers.clear();
    this.localStream = null; this.producer = null; this.sendTransport = null; this.recvTransport = null; this.device = null;
  }
}
