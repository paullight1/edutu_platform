/**
 * Behavioural contract for the voice-mode conversation engine
 * (hooks/useVoiceSession). These cover the states a user actually hits and
 * that used to have no owner: mic-permission denial, the app going to the
 * background mid-turn, a network failure after the user already spoke, and
 * barge-in over Edutu's reply.
 */
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { AppState } from 'react-native';

const mockRecord = jest.fn();
const mockStop = jest.fn(async () => undefined);
const mockPrepare = jest.fn(async () => undefined);
const mockRecorder = {
    record: mockRecord,
    stop: mockStop,
    prepareToRecordAsync: mockPrepare,
    uri: 'file:///tmp/turn.m4a',
};
let mockRecorderState = { isRecording: false, metering: -60, durationMillis: 0 };

const mockGetPermissions = jest.fn(async () => ({ granted: true }));
const mockRequestPermissions = jest.fn(async () => ({ granted: true }));

jest.mock('expo-audio', () => ({
    useAudioRecorder: () => mockRecorder,
    useAudioRecorderState: () => mockRecorderState,
    setAudioModeAsync: jest.fn(async () => undefined),
    RecordingPresets: { HIGH_QUALITY: {} },
    AudioModule: {
        getRecordingPermissionsAsync: () => mockGetPermissions(),
        requestRecordingPermissionsAsync: () => mockRequestPermissions(),
    },
}));

const mockSpeak = jest.fn(async () => undefined);
const mockStopSpeaking = jest.fn();
jest.mock('../lib/edutuSpeech', () => ({
    speak: (...args: unknown[]) => mockSpeak(...(args as [])),
    stopSpeaking: () => mockStopSpeaking(),
}));

const mockSendChatMessage = jest.fn();
jest.mock('@edutu/core/src/services/chat', () => ({
    sendChatMessage: (...args: unknown[]) => mockSendChatMessage(...args),
    ChatRateLimitError: class ChatRateLimitError extends Error {},
}));

jest.mock('../lib/supabase', () => ({ supabase: {} }));
jest.mock('../lib/config', () => ({ getConfig: () => ({ supabaseUrl: 'https://sb.test' }) }));
jest.mock('../lib/haptics', () => ({
    haptics: { light: jest.fn(), medium: jest.fn(), error: jest.fn(), selection: jest.fn() },
}));
jest.mock('../lib/i18n', () => ({ __esModule: true, default: { language: 'en' } }));

const { useVoiceSession } = require('../hooks/useVoiceSession');

/** Drives one full listen→transcribe→think turn to the point of the AI call. */
function primeTranscription(transcript: string) {
    (global as unknown as { fetch: jest.Mock }).fetch = jest.fn(async (input: string) => {
        if (input.startsWith('file://')) {
            return { blob: async () => ({}) } as unknown as Response;
        }
        return { ok: true, json: async () => ({ transcript }) } as unknown as Response;
    });
}

class FakeFileReader {
    result: string | null = null;
    onloadend: (() => void) | null = null;
    onerror: (() => void) | null = null;
    readAsDataURL() {
        this.result = 'data:audio/m4a;base64,QUJD';
        this.onloadend?.();
    }
}

function setup(overrides: Record<string, unknown> = {}) {
    return renderHook(() =>
        useVoiceSession({
            mode: 'voice',
            userId: 'user_1',
            getAuthToken: async () => 'token',
            ...overrides,
        }),
    );
}

describe('voice session engine', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockRecorder.uri = 'file:///tmp/turn.m4a';
        mockRecorderState = { isRecording: false, metering: -60, durationMillis: 0 };
        (global as unknown as { FileReader: unknown }).FileReader = FakeFileReader;
        primeTranscription('hello edutu');
        mockSendChatMessage.mockResolvedValue({
            threadId: 'thread-1',
            assistantMessage: { content: 'Here is a plan.' },
        });
    });

    it('surfaces a permission error for voice instead of silently failing to record', async () => {
        mockGetPermissions.mockResolvedValueOnce({ granted: false });
        mockRequestPermissions.mockResolvedValueOnce({ granted: false });

        const { result } = setup();
        await act(async () => {
            result.current.begin();
        });

        await waitFor(() => expect(result.current.errorCode).toBe('permission'));
        expect(result.current.status).toBe('error');
        expect(mockRecord).not.toHaveBeenCalled();
    });

    it('parks the voice session when the app is backgrounded mid-listen', async () => {
        const handlers: Array<(s: string) => void> = [];
        const spy = jest
            .spyOn(AppState, 'addEventListener')
            .mockImplementation((_event: string, handler: (s: never) => void) => {
                handlers.push(handler as (s: string) => void);
                return { remove: jest.fn() } as never;
            });

        const { result } = setup();
        await act(async () => {
            result.current.begin();
        });
        await waitFor(() => expect(result.current.status).toBe('listening'));

        await act(async () => {
            handlers.forEach((handler) => handler('background'));
        });

        expect(mockStopSpeaking).toHaveBeenCalled();
        expect(mockStop).toHaveBeenCalled();
        await waitFor(() => expect(result.current.status).toBe('idle'));
        spy.mockRestore();
    });

    it('lets a failed voice turn be retried without making the user speak again', async () => {
        mockSendChatMessage.mockRejectedValueOnce(new Error('offline'));

        const { result } = setup();
        await act(async () => {
            result.current.begin();
        });
        await waitFor(() => expect(result.current.status).toBe('listening'));

        await act(async () => {
            result.current.onOrbPress();
        });
        await waitFor(() => expect(result.current.errorCode).toBe('network'));
        expect(result.current.userTranscript).toBe('hello edutu');

        mockRecord.mockClear();
        await act(async () => {
            result.current.retry();
        });

        await waitFor(() => expect(mockSendChatMessage).toHaveBeenCalledTimes(2));
        expect(mockSendChatMessage.mock.calls[1][1]).toMatchObject({ message: 'hello edutu' });
        expect(mockRecord).not.toHaveBeenCalled();
    });

    it('barges in on the voice reply when the user taps while Edutu speaks', async () => {
        const { result } = setup({ greeting: 'Hi there' });
        await act(async () => {
            result.current.begin();
        });
        await waitFor(() => expect(result.current.status).toBe('speaking'));

        mockStopSpeaking.mockClear();
        await act(async () => {
            result.current.onOrbPress();
        });

        expect(mockStopSpeaking).toHaveBeenCalled();
        await waitFor(() => expect(mockRecord).toHaveBeenCalled());
    });

    it('never arms the voice mic while muted', async () => {
        const { result } = setup();
        await act(async () => {
            result.current.toggleMute();
        });
        mockRecord.mockClear();

        await act(async () => {
            result.current.onOrbPress();
        });

        expect(mockRecord).not.toHaveBeenCalled();
        expect(result.current.muted).toBe(true);
    });
});
