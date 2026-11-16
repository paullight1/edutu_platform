import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { AppState } from 'react-native';

const mockSessions: Array<{
  options: any;
  start: jest.Mock;
  close: jest.Mock;
  setMuted: jest.Mock;
  interrupt: jest.Mock;
}> = [];
let mockRejectNextStart = false;

jest.mock('../lib/realtimeVoiceSession', () => ({
  RealtimeVoiceSession: jest.fn().mockImplementation((options) => {
    const instance = {
      options,
      start: jest.fn(async () => {
        if (mockRejectNextStart) {
          mockRejectNextStart = false;
          throw new Error('WebRTC unavailable');
        }
      }),
      close: jest.fn(),
      setMuted: jest.fn(),
      interrupt: jest.fn(),
    };
    mockSessions.push(instance);
    return instance;
  }),
}));

const { useRealtimeVoiceSession } = require('../hooks/useRealtimeVoiceSession');

function setup(overrides: Record<string, unknown> = {}) {
  return renderHook(() => useRealtimeVoiceSession({
    userId: 'user_1',
    getAuthToken: async () => 'token',
    voice: 'marin',
    locale: 'en',
    ...overrides,
  }));
}

describe('useRealtimeVoiceSession', () => {
  let appStateHandlers: Array<(status: string) => void>;
  let appStateSpy: jest.SpyInstance;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockSessions.length = 0;
    mockRejectNextStart = false;
    await AsyncStorage.clear();
    appStateHandlers = [];
    appStateSpy = jest.spyOn(AppState, 'addEventListener').mockImplementation(
      (_event: string, handler: (status: never) => void) => {
        appStateHandlers.push(handler as (status: string) => void);
        return { remove: jest.fn() } as never;
      },
    );
  });

  afterEach(() => appStateSpy.mockRestore());

  it('maps Realtime callbacks into live captions, speaking state, and the saved chat thread', async () => {
    const { result } = setup();

    await act(async () => result.current.begin());
    const current = mockSessions[0];
    act(() => current.options.handlers.onReady({ callId: 'rtc_1', expiresAt: 'later' }));
    act(() => current.options.handlers.onUserTranscript('Find scholar', false));
    act(() => current.options.handlers.onUserTranscript('Find scholarships', true));
    act(() => current.options.handlers.onAssistantTranscript('I found three', false));
    act(() => current.options.handlers.onStatus('speaking'));
    act(() => current.options.handlers.onThread('thread-live-1'));

    expect(result.current.status).toBe('speaking');
    expect(result.current.userTranscript).toBe('Find scholarships');
    expect(result.current.assistantReply).toBe('I found three');
    expect(result.current.spokenRatio).toBe(1);
    expect(result.current.turnCount).toBe(1);
  });

  it('checkpoints captions, closes media in background, and reconnects to the same thread on foreground', async () => {
    const { result } = setup();
    await act(async () => result.current.begin());
    const first = mockSessions[0];
    act(() => first.options.handlers.onUserTranscript('Partial words', false));
    act(() => first.options.handlers.onAssistantTranscript('Saved reply', true));
    act(() => first.options.handlers.onThread('thread-live-1'));

    await act(async () => appStateHandlers.forEach((handler) => handler('background')));

    expect(first.close).toHaveBeenCalledTimes(1);
    expect(result.current.paused).toBe(true);
    await waitFor(async () => {
      const values = await AsyncStorage.multiGet(await AsyncStorage.getAllKeys());
      expect(values.some(([, value]) => value?.includes('Partial words'))).toBe(true);
    });

    await act(async () => appStateHandlers.forEach((handler) => handler('active')));

    await waitFor(() => expect(mockSessions).toHaveLength(2));
    expect(mockSessions[1].options.threadId).toBe('thread-live-1');
    expect(result.current.paused).toBe(false);
  });

  it('mutes without destroying the connection and barge-in cancels current model speech', async () => {
    const { result } = setup();
    await act(async () => result.current.begin());
    const current = mockSessions[0];

    act(() => result.current.toggleMute());
    expect(current.setMuted).toHaveBeenCalledWith(true);
    expect(current.close).not.toHaveBeenCalled();

    act(() => result.current.bargeIn());
    expect(current.interrupt).toHaveBeenCalled();
  });

  it('reconnects in the background lifecycle while preserving a muted microphone', async () => {
    const { result } = setup();
    await act(async () => result.current.begin());

    act(() => result.current.toggleMute());
    await act(async () => appStateHandlers.forEach((handler) => handler('background')));
    await act(async () => appStateHandlers.forEach((handler) => handler('active')));

    await waitFor(() => expect(mockSessions).toHaveLength(2));
    expect(mockSessions[1].setMuted).toHaveBeenCalledWith(true);

    await act(async () => mockSessions[1].options.handlers.onReconnectNeeded());
    await waitFor(() => expect(mockSessions).toHaveLength(3));
    expect(mockSessions[2].setMuted).toHaveBeenCalledWith(true);
  });

  it('reconnects when the selected Realtime voice changes because voices are session-locked', async () => {
    const { result, rerender } = renderHook(
      ({ voice }: { voice: string }) => useRealtimeVoiceSession({
        userId: 'user_1',
        getAuthToken: async () => 'token',
        voice,
        locale: 'en',
      }),
      { initialProps: { voice: 'marin' } },
    );
    await act(async () => result.current.begin());
    const first = mockSessions[0];

    rerender({ voice: 'cedar' });

    await waitFor(() => expect(mockSessions).toHaveLength(2));
    expect(first.close).toHaveBeenCalled();
    expect(mockSessions[1].options.voice).toBe('cedar');
  });

  it('reconnects transparently when the WebRTC transport drops', async () => {
    const { result } = setup();
    await act(async () => result.current.begin());
    const first = mockSessions[0];

    await act(async () => first.options.handlers.onReconnectNeeded());

    await waitFor(() => expect(mockSessions).toHaveLength(2));
    expect(first.close).toHaveBeenCalled();
    expect(result.current.errorCode).toBeNull();
  });

  it('clears the checkpoint and native session on explicit end', async () => {
    const { result } = setup();
    await act(async () => result.current.begin());
    const current = mockSessions[0];
    act(() => current.options.handlers.onThread('thread-live-1'));
    await act(async () => appStateHandlers.forEach((handler) => handler('background')));

    act(() => result.current.end());

    expect(current.close).toHaveBeenCalled();
    await waitFor(async () => {
      expect(await AsyncStorage.getAllKeys()).toEqual([]);
    });
  });

  it('requests the tap-to-talk fallback when native Realtime startup fails', async () => {
    const onUnavailable = jest.fn();
    mockRejectNextStart = true;
    const { result } = setup({ onUnavailable });

    await act(async () => result.current.begin());

    expect(onUnavailable).toHaveBeenCalledWith(expect.any(Error));
    expect(result.current.status).toBe('error');
    expect(result.current.errorCode).toBe('network');
  });
});
