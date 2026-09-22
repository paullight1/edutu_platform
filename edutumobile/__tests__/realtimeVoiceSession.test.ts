import {
  RealtimeVoiceSession,
  type RealtimeVoiceSessionHandlers,
} from '../lib/realtimeVoiceSession';

const OFFER_SDP = 'v=0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111';

class FakeTrack {
  enabled = true;
  stop = jest.fn();
}

class FakeStream {
  readonly track = new FakeTrack();
  getTracks = () => [this.track];
  getAudioTracks = () => [this.track];
}

class FakeDataChannel {
  readyState = 'open';
  sent: string[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  send = jest.fn((data: string) => this.sent.push(data));
  close = jest.fn(() => {
    this.readyState = 'closed';
  });
}

class FakePeerConnection {
  static instances: FakePeerConnection[] = [];
  localDescription: { type: string; sdp: string } | null = null;
  remoteDescription: { type: string; sdp: string } | null = null;
  connectionState = 'new';
  onconnectionstatechange: (() => void) | null = null;
  ontrack: ((event: unknown) => void) | null = null;
  readonly channel = new FakeDataChannel();
  readonly addTrack = jest.fn();
  readonly close = jest.fn(() => {
    this.connectionState = 'closed';
  });
  readonly createOffer = jest.fn(async () => ({ type: 'offer', sdp: OFFER_SDP }));
  readonly setLocalDescription = jest.fn(async (description) => {
    this.localDescription = description;
  });
  readonly setRemoteDescription = jest.fn(async (description) => {
    this.remoteDescription = description;
  });
  readonly createDataChannel = jest.fn(() => this.channel);

  constructor(readonly configuration: unknown) {
    FakePeerConnection.instances.push(this);
  }
}

const rtc = {
  RTCPeerConnection: FakePeerConnection,
  RTCSessionDescription: class {
    type: string;
    sdp: string;
    constructor(value: { type: string; sdp: string }) {
      this.type = value.type;
      this.sdp = value.sdp;
    }
  },
  mediaDevices: {
    getUserMedia: jest.fn(async () => new FakeStream()),
  },
};

const finalTurn = {
  threadId: 'thread-live-1',
  userMessage: { id: 'user-1', role: 'user', content: 'Find scholarships' },
  assistantMessage: {
    id: 'assistant-1',
    role: 'assistant',
    content: 'I found three strong matches.',
  },
};

const sessions: RealtimeVoiceSession[] = [];

function emit(channel: FakeDataChannel, payload: Record<string, unknown>) {
  channel.onmessage?.({ data: JSON.stringify(payload) });
}

function setup(overrides: Record<string, unknown> = {}) {
  const handlers: RealtimeVoiceSessionHandlers = {
    onReady: jest.fn(),
    onStatus: jest.fn(),
    onUserTranscript: jest.fn(),
    onAssistantTranscript: jest.fn(),
    onThread: jest.fn(),
    onError: jest.fn(),
  };
  const sendMessage = jest.fn(async (options: any) => {
    options.handlers?.onContent?.('I found three');
    return finalTurn;
  });
  const fetchImpl = jest.fn(async () =>
    new Response(
      JSON.stringify({
        sdp: 'v=0\r\na=answer',
        callId: 'rtc_live_1',
        expiresAt: '2026-08-30T17:00:55.000Z',
      }),
      { status: 201, headers: { 'Content-Type': 'application/json' } },
    ),
  );
  const session = new RealtimeVoiceSession(
    {
      userId: 'user_1',
      getAuthToken: async () => 'clerk-token',
      threadId: null,
      voice: 'marin',
      locale: 'en',
      handlers,
      ...overrides,
    },
    {
      rtc: rtc as never,
      fetchImpl,
      sendMessage: sendMessage as never,
      apiBaseUrl: 'https://api.edutu.test',
    },
  );
  sessions.push(session);
  return { session, handlers, sendMessage, fetchImpl };
}

describe('RealtimeVoiceSession', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    FakePeerConnection.instances = [];
  });

  afterEach(() => {
    sessions.splice(0).forEach((session) => session.close());
  });

  it('opens a low-latency native WebRTC session through the authenticated Edutu API', async () => {
    const { session, handlers, fetchImpl } = setup({ voice: 'cedar', locale: 'fr' });

    await session.start();

    expect(rtc.mediaDevices.getUserMedia).toHaveBeenCalledWith({
      audio: expect.objectContaining({
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      }),
      video: false,
    });
    const peer = FakePeerConnection.instances[0];
    expect(peer.configuration).toMatchObject({ bundlePolicy: 'max-bundle' });
    expect(peer.addTrack).toHaveBeenCalledWith(
      expect.any(FakeTrack),
      expect.any(FakeStream),
    );
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://api.edutu.test/voice/realtime/session',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer clerk-token' }),
        body: JSON.stringify({ sdp: OFFER_SDP, voice: 'cedar', locale: 'fr' }),
      }),
    );
    expect(peer.remoteDescription).toMatchObject({ type: 'answer', sdp: 'v=0\r\na=answer' });

    peer.channel.onopen?.();
    expect(handlers.onReady).toHaveBeenCalledWith({
      callId: 'rtc_live_1',
      expiresAt: '2026-08-30T17:00:55.000Z',
    });
  });

  it('delivers incremental and final user and assistant transcripts', async () => {
    const { session, handlers } = setup();
    await session.start();
    const channel = FakePeerConnection.instances[0].channel;

    emit(channel, {
      type: 'conversation.item.input_audio_transcription.delta',
      item_id: 'item-user',
      delta: 'Find scholar',
    });
    emit(channel, {
      type: 'conversation.item.input_audio_transcription.completed',
      item_id: 'item-user',
      transcript: 'Find scholarships',
    });
    emit(channel, {
      type: 'response.output_audio_transcript.delta',
      item_id: 'item-assistant',
      delta: 'I found ',
    });
    emit(channel, {
      type: 'response.output_audio_transcript.done',
      item_id: 'item-assistant',
      transcript: 'I found three strong matches.',
    });

    expect(handlers.onUserTranscript).toHaveBeenNthCalledWith(1, 'Find scholar', false);
    expect(handlers.onUserTranscript).toHaveBeenLastCalledWith('Find scholarships', true);
    expect(handlers.onAssistantTranscript).toHaveBeenNthCalledWith(1, 'I found ', false);
    expect(handlers.onAssistantTranscript).toHaveBeenLastCalledWith(
      'I found three strong matches.',
      true,
    );
  });

  it('fulfills ask_edutu exactly once and returns the saved canonical reply for speech', async () => {
    const { session, handlers, sendMessage } = setup();
    await session.start();
    const channel = FakePeerConnection.instances[0].channel;
    const toolEvent = {
      type: 'response.function_call_arguments.done',
      call_id: 'call_1',
      name: 'ask_edutu',
      arguments: JSON.stringify({ message: 'Find scholarships' }),
    };

    emit(channel, toolEvent);
    emit(channel, toolEvent);
    await Promise.resolve();
    await Promise.resolve();

    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user_1',
        threadId: null,
        message: 'Find scholarships',
        channel: 'voice',
        authToken: 'clerk-token',
      }),
    );
    expect(handlers.onThread).toHaveBeenCalledWith('thread-live-1');
    const sent = channel.sent.map((value) => JSON.parse(value));
    expect(sent).toContainEqual({
      type: 'conversation.item.create',
      item: {
        type: 'function_call_output',
        call_id: 'call_1',
        output: JSON.stringify({
          threadId: 'thread-live-1',
          reply: 'I found three strong matches.',
        }),
      },
    });
    expect(sent).toContainEqual({
      type: 'response.create',
      response: expect.objectContaining({
        output_modalities: ['audio'],
        tool_choice: 'none',
      }),
    });
  });

  it('keeps newly acquired tracks muted when mute was restored before startup', async () => {
    const { session } = setup();
    session.setMuted(true);
    await session.start();
    const track = (await rtc.mediaDevices.getUserMedia.mock.results[0].value).track;
    expect(track.enabled).toBe(false);
    session.setMuted(false);
    expect(track.enabled).toBe(true);
  });

  it('honors a mute tap while microphone permission is still pending', async () => {
    let resolveStream!: (stream: FakeStream) => void;
    rtc.mediaDevices.getUserMedia.mockImplementationOnce(() => new Promise((resolve) => { resolveStream = resolve; }));
    const { session } = setup();
    const starting = session.start();
    await Promise.resolve();
    session.setMuted(true);
    const stream = new FakeStream();
    resolveStream(stream);
    await starting;
    expect(stream.track.enabled).toBe(false);
  });

  it('mutes the native microphone and interrupts model audio without reconnecting', async () => {
    const { session } = setup();
    await session.start();
    const peer = FakePeerConnection.instances[0];
    const track = (await rtc.mediaDevices.getUserMedia.mock.results[0].value).track;

    session.setMuted(true);
    expect(track.enabled).toBe(false);
    session.setMuted(false);
    expect(track.enabled).toBe(true);
    session.interrupt();

    expect(peer.channel.sent.map((value) => JSON.parse(value))).toContainEqual({
      type: 'response.cancel',
    });
    expect(peer.close).not.toHaveBeenCalled();
  });

  it('barge-in aborts the current Edutu tool turn while keeping the WebRTC session reusable', async () => {
    const signals: AbortSignal[] = [];
    const sendMessage = jest.fn((options: any) => {
      signals.push(options.signal);
      return new Promise(() => undefined);
    });
    const { session } = setup();
    (session as any).dependencies.sendMessage = sendMessage;
    await session.start();
    const channel = FakePeerConnection.instances[0].channel;
    emit(channel, {
      type: 'response.function_call_arguments.done',
      call_id: 'call_first',
      name: 'ask_edutu',
      arguments: JSON.stringify({ message: 'First question' }),
    });
    await Promise.resolve();

    session.interrupt();
    expect(signals[0].aborted).toBe(true);

    emit(channel, {
      type: 'response.function_call_arguments.done',
      call_id: 'call_second',
      name: 'ask_edutu',
      arguments: JSON.stringify({ message: 'Second question' }),
    });
    await Promise.resolve();

    expect(sendMessage).toHaveBeenCalledTimes(2);
    expect(signals[1].aborted).toBe(false);
    expect(FakePeerConnection.instances[0].close).not.toHaveBeenCalled();
  });

  it('closes idempotently, aborts Edutu work, and releases every native resource', async () => {
    let capturedSignal: AbortSignal | null = null;
    const work = new Promise(() => undefined);
    const sendMessage = jest.fn((options: any) => {
      capturedSignal = options.signal;
      return work;
    });
    const { session } = setup({});
    (session as any).dependencies.sendMessage = sendMessage;
    await session.start();
    const peer = FakePeerConnection.instances[0];
    const stream = await rtc.mediaDevices.getUserMedia.mock.results[0].value;
    emit(peer.channel, {
      type: 'response.function_call_arguments.done',
      call_id: 'call_pending',
      name: 'ask_edutu',
      arguments: JSON.stringify({ message: 'Pending work' }),
    });
    await Promise.resolve();

    session.close();
    session.close();

    expect(capturedSignal?.aborted).toBe(true);
    expect(stream.track.stop).toHaveBeenCalledTimes(1);
    expect(peer.channel.close).toHaveBeenCalledTimes(1);
    expect(peer.close).toHaveBeenCalledTimes(1);
  });

  it('cleans up the microphone and peer when session setup fails', async () => {
    const { session, handlers } = setup();
    (session as any).dependencies.fetchImpl = jest.fn(async () =>
      new Response('unavailable', { status: 503 }),
    );

    await expect(session.start()).rejects.toThrow('Live voice session failed');

    const peer = FakePeerConnection.instances[0];
    const stream = await rtc.mediaDevices.getUserMedia.mock.results[0].value;
    expect(stream.track.stop).toHaveBeenCalled();
    expect(peer.close).toHaveBeenCalled();
    expect(handlers.onError).toHaveBeenCalled();
  });
});
