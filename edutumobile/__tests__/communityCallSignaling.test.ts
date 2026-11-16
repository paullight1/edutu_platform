import { CommunityCallSignaling, SignalingProtocolError, parseServerFrame } from '../features/community-calls/signaling';

class FakeSocket {
  readyState = 1;
  sent: string[] = [];
  onopen: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;
  send(value: string) { this.sent.push(value); }
  close() {}
  emitOpen() { this.onopen?.({} as Event); }
  emit(value: unknown) { this.onmessage?.({ data: JSON.stringify(value) } as MessageEvent); }
}

describe('community call gateway protocol', () => {
  it('authenticates with the gateway action envelope', async () => {
    const socket = new FakeSocket();
    const client = new CommunityCallSignaling(() => socket);
    const connected = client.connect('wss://voice.edutu.org/calls/call-1', 'short-lived-token');
    socket.emitOpen();
    await Promise.resolve();
    const request = JSON.parse(socket.sent[0]!);
    expect(request).toMatchObject({ version: 1, action: 'authenticate', data: { token: 'short-lived-token' } });
    expect(request.type).toBeUndefined();
    socket.emit({ version: 1, requestId: request.requestId, ok: true, data: { peerId: 'peer-1', existingProducers: [{ producerId: 'producer-1', peerId: 'peer-2' }] } });
    await expect(connected).resolves.toEqual({ peerId: 'peer-1', existingProducers: [{ producerId: 'producer-1', peerId: 'peer-2' }] });
    client.close();
  });

  it('parses versioned server events and rejects the old type envelope', () => {
    expect(parseServerFrame(JSON.stringify({ version: 1, event: 'peerJoined', data: { peerId: 'p1' } }))).toEqual({
      kind: 'event', event: { type: 'peerJoined', data: { peerId: 'p1' } },
    });
    expect(parseServerFrame(JSON.stringify({ version: 1, type: 'peerJoined', data: { peerId: 'p1' } }))).toBeNull();
  });

  it('surfaces structured gateway errors with their stable code', async () => {
    const socket = new FakeSocket();
    const client = new CommunityCallSignaling(() => socket);
    const connected = client.connect('wss://voice.edutu.org/calls/call-1', 'token');
    socket.emitOpen();
    await Promise.resolve();
    const request = JSON.parse(socket.sent[0]!);
    socket.emit({ version: 1, requestId: request.requestId, ok: false, error: { code: 'AUTH_EXPIRED', message: 'Join token expired.' } });
    await expect(connected).rejects.toEqual(expect.objectContaining<Partial<SignalingProtocolError>>({ name: 'SignalingProtocolError', code: 'AUTH_EXPIRED', message: 'Join token expired.' }));
    client.close();
  });
});
