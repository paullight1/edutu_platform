import { act, renderHook } from '@testing-library/react-native';

const mockTurn = {
  status: 'idle',
  errorCode: null,
  muted: false,
  level: 0,
  userTranscript: null,
  assistantReply: null,
  spokenRatio: 0,
  turnCount: 0,
  paused: false,
  begin: jest.fn(),
  end: jest.fn(),
  onOrbPress: jest.fn(),
  bargeIn: jest.fn(),
  toggleMute: jest.fn(),
  retry: jest.fn(),
};

const mockRealtime = {
  ...mockTurn,
  status: 'listening',
  begin: jest.fn(),
  end: jest.fn(),
};

let mockRealtimeOptions: any;
jest.mock('../hooks/useVoiceSession', () => ({
  useVoiceSession: jest.fn(() => mockTurn),
}));
jest.mock('../hooks/useRealtimeVoiceSession', () => ({
  useRealtimeVoiceSession: jest.fn((options) => {
    mockRealtimeOptions = options;
    return mockRealtime;
  }),
}));

const { useVoiceModeSession } = require('../hooks/useVoiceModeSession');

const options = {
  mode: 'live' as const,
  userId: 'user_1',
  getAuthToken: async () => 'token',
  greeting: 'Hello',
  realtimeEnabled: true,
  voice: 'marin',
  locale: 'en',
};

describe('useVoiceModeSession', () => {
  beforeEach(() => jest.clearAllMocks());

  it('uses Realtime for eligible Live mode and falls back automatically after setup failure', () => {
    const { result } = renderHook(() => useVoiceModeSession(options));

    act(() => result.current.begin());
    expect(mockRealtime.begin).toHaveBeenCalledTimes(1);
    expect(mockTurn.begin).not.toHaveBeenCalled();
    expect(result.current.status).toBe('listening');

    act(() => mockRealtimeOptions.onUnavailable(new Error('native unavailable')));

    expect(mockRealtime.end).toHaveBeenCalled();
    expect(mockTurn.begin).toHaveBeenCalledTimes(1);
    expect(result.current.status).toBe('idle');
  });

  it('keeps non-Realtime and ineligible sessions on the tap-to-talk engine', () => {
    const { result } = renderHook(() => useVoiceModeSession({
      ...options,
      realtimeEnabled: false,
    }));

    act(() => result.current.begin());

    expect(mockTurn.begin).toHaveBeenCalledTimes(1);
    expect(mockRealtime.begin).not.toHaveBeenCalled();
  });

  it('tears down both engines so no hidden microphone owner survives', () => {
    const { result } = renderHook(() => useVoiceModeSession(options));

    act(() => result.current.end());

    expect(mockTurn.end).toHaveBeenCalled();
    expect(mockRealtime.end).toHaveBeenCalled();
  });
});
