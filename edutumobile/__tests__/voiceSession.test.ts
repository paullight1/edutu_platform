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

const mockStreamChatMessage = jest.fn();
jest.mock('@edutu/core/src/services/chat', () => ({
    ChatRateLimitError: class ChatRateLimitError extends Error {},
}));
jest.mock('@edutu/core/src/services/chatStream', () => ({
    streamChatMessage: (...args: unknown[]) => mockStreamChatMessage(...args),
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

function deferred<T>() {
    let resolve!: (value: T) => void;
    let reject!: (error: unknown) => void;
    const promise = new Promise<T>((res, rej) => {
        resolve = res;
        reject = rej;
    });
    return { promise, resolve, reject };
}

const finalTurn = (content = 'Here is a plan.') => ({
    threadId: 'thread-1',
    userMessage: { id: 'user-message', role: 'user', content: 'hello edutu' },
    assistantMessage: { id: 'assistant-message', role: 'assistant', content },
});

describe('voice session engine', () => {
    let appStateHandlers: Array<(status: string) => void>;
    let appStateSpy: jest.SpyInstance;

    beforeEach(() => {
        jest.clearAllMocks();
        appStateHandlers = [];
        appStateSpy = jest
            .spyOn(AppState, 'addEventListener')
            .mockImplementation((_event: string, handler: (status: never) => void) => {
                appStateHandlers.push(handler as (status: string) => void);
                return { remove: jest.fn() } as never;
            });
        mockRecorder.uri = 'file:///tmp/turn.m4a';
        mockRecorderState = { isRecording: false, metering: -60, durationMillis: 0 };
        (global as unknown as { FileReader: unknown }).FileReader = FakeFileReader;
        primeTranscription('hello edutu');
        mockStreamChatMessage.mockResolvedValue(finalTurn());
        mockSpeak.mockResolvedValue(undefined);
    });

    afterEach(() => {
        appStateSpy.mockRestore();
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
        const { result } = setup();
        await act(async () => {
            result.current.begin();
        });
        await waitFor(() => expect(result.current.status).toBe('listening'));

        await act(async () => {
            appStateHandlers.forEach((handler) => handler('background'));
        });

        expect(mockStopSpeaking).toHaveBeenCalled();
        expect(mockStop).toHaveBeenCalled();
        await waitFor(() => expect(result.current.status).toBe('idle'));
    });

    it('invalidates a pending mic arm when backgrounded from idle', async () => {
        const permission = deferred<{ granted: boolean }>();
        mockGetPermissions.mockReturnValueOnce(permission.promise);
        const { result } = setup();

        act(() => result.current.begin());
        await act(async () => appStateHandlers.forEach((handler) => handler('background')));
        await act(async () => permission.resolve({ granted: true }));

        expect(mockPrepare).not.toHaveBeenCalled();
        expect(mockRecord).not.toHaveBeenCalled();
        expect(result.current.paused).toBe(true);
        expect(result.current.status).toBe('idle');
    });

    it('does not prepare or record twice when a backgrounded arm resumes while cleanup is pending', async () => {
        const prepare = deferred<void>();
        mockPrepare.mockReturnValueOnce(prepare.promise);

        const { result } = setup({ mode: 'live' });
        act(() => result.current.begin());
        await waitFor(() => expect(mockPrepare).toHaveBeenCalledTimes(1));

        await act(async () => appStateHandlers.forEach((handler) => handler('background')));
        await act(async () => appStateHandlers.forEach((handler) => handler('active')));

        // The original arm is still inside prepareToRecordAsync. A resume
        // must wait for it rather than racing a second native recorder arm.
        expect(mockPrepare).toHaveBeenCalledTimes(1);
        expect(mockRecord).not.toHaveBeenCalled();

        await act(async () => prepare.resolve());
        await waitFor(() => expect(mockPrepare).toHaveBeenCalledTimes(2));
        await waitFor(() => expect(mockRecord).toHaveBeenCalledTimes(1));
    });

    it('lets a failed voice turn be retried without making the user speak again', async () => {
        mockStreamChatMessage.mockRejectedValueOnce(new Error('offline'));

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

        await waitFor(() => expect(mockStreamChatMessage).toHaveBeenCalledTimes(2));
        expect(mockStreamChatMessage.mock.calls[1][0]).toMatchObject({ message: 'hello edutu' });
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

    it('aborts the file read and transcription request before parking in the background', async () => {
        const fileResponse = deferred<{ blob: () => Promise<object> }>();
        const fetchMock = jest.fn((input: string) => {
            if (input.startsWith('file://')) return fileResponse.promise;
            return Promise.resolve({ ok: true, json: async () => ({ transcript: 'late words' }) });
        });
        (global as unknown as { fetch: jest.Mock }).fetch = fetchMock;

        const { result } = setup();
        await act(async () => result.current.begin());
        await waitFor(() => expect(result.current.status).toBe('listening'));
        await act(async () => result.current.onOrbPress());
        await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
            'file:///tmp/turn.m4a',
            expect.objectContaining({ signal: expect.any(Object) }),
        ));
        const signal = fetchMock.mock.calls[0][1].signal as AbortSignal;

        await act(async () => appStateHandlers.forEach((handler) => handler('background')));

        expect(signal.aborted).toBe(true);
        fileResponse.resolve({ blob: async () => ({}) });
        await act(async () => { await Promise.resolve(); });
        expect(mockStreamChatMessage).not.toHaveBeenCalled();
        expect(result.current.status).toBe('idle');
    });

    it('streams assistant captions and reconciles them to the authoritative final turn', async () => {
        const stream = deferred<ReturnType<typeof finalTurn>>();
        mockStreamChatMessage.mockImplementationOnce((options) => {
            options.handlers.onContent('A partial answer');
            return stream.promise;
        });

        const { result } = setup();
        await act(async () => result.current.begin());
        await waitFor(() => expect(result.current.status).toBe('listening'));
        await act(async () => result.current.onOrbPress());
        await waitFor(() => expect(result.current.assistantReply).toBe('A partial answer'));

        await act(async () => stream.resolve(finalTurn('The final answer.')));

        await waitFor(() => expect(result.current.assistantReply).toBe('The final answer.'));
        expect(mockSpeak).toHaveBeenCalledWith(
            'The final answer.',
            expect.objectContaining({ signal: expect.any(Object) }),
        );
    });

    it('uses the same turn signal for file fetch, Edge transcription, chat, and TTS', async () => {
        const { result } = setup();
        await act(async () => result.current.begin());
        await waitFor(() => expect(result.current.status).toBe('listening'));
        await act(async () => result.current.onOrbPress());
        await waitFor(() => expect(mockSpeak).toHaveBeenCalled());

        const fetchMock = (global as unknown as { fetch: jest.Mock }).fetch;
        const fileSignal = fetchMock.mock.calls[0][1].signal;
        const transcriptionSignal = fetchMock.mock.calls[1][1].signal;
        const chatSignal = mockStreamChatMessage.mock.calls[0][0].signal;
        const speechSignal = mockSpeak.mock.calls[0][1].signal;

        expect(transcriptionSignal).toBe(fileSignal);
        expect(chatSignal).toBe(fileSignal);
        expect(speechSignal).toBe(fileSignal);
    });

    it('aborts chat on end and suppresses a late final turn', async () => {
        const stream = deferred<ReturnType<typeof finalTurn>>();
        mockStreamChatMessage.mockReturnValueOnce(stream.promise);
        const { result } = setup();
        await act(async () => result.current.begin());
        await waitFor(() => expect(result.current.status).toBe('listening'));
        await act(async () => result.current.onOrbPress());
        await waitFor(() => expect(mockStreamChatMessage).toHaveBeenCalled());
        const signal = mockStreamChatMessage.mock.calls[0][0].signal as AbortSignal;

        act(() => result.current.end());

        expect(signal.aborted).toBe(true);
        await act(async () => stream.resolve(finalTurn('Too late')));
        expect(result.current.assistantReply).toBeNull();
        expect(mockSpeak).not.toHaveBeenCalled();
    });

    it('aborts chat on mute and ignores late streamed tokens', async () => {
        const stream = deferred<ReturnType<typeof finalTurn>>();
        let streamOptions: any;
        mockStreamChatMessage.mockImplementationOnce((options) => {
            streamOptions = options;
            return stream.promise;
        });
        const { result } = setup();
        await act(async () => result.current.begin());
        await waitFor(() => expect(result.current.status).toBe('listening'));
        await act(async () => result.current.onOrbPress());
        await waitFor(() => expect(mockStreamChatMessage).toHaveBeenCalled());

        act(() => result.current.toggleMute());
        streamOptions.handlers.onContent('stale token');

        expect(streamOptions.signal.aborted).toBe(true);
        expect(result.current.assistantReply).toBeNull();
        expect(result.current.status).toBe('idle');
    });

    it('resets and invalidates the old turn when the signed-in account changes', async () => {
        const stream = deferred<ReturnType<typeof finalTurn>>();
        mockStreamChatMessage.mockReturnValueOnce(stream.promise);
        const { result, rerender } = renderHook(
            ({ userId }: { userId: string | null }) => useVoiceSession({
                mode: 'voice',
                userId,
                getAuthToken: async () => 'token',
            }),
            { initialProps: { userId: 'user_1' } },
        );
        await act(async () => result.current.begin());
        await waitFor(() => expect(result.current.status).toBe('listening'));
        await act(async () => result.current.onOrbPress());
        await waitFor(() => expect(mockStreamChatMessage).toHaveBeenCalled());
        const signal = mockStreamChatMessage.mock.calls[0][0].signal as AbortSignal;

        rerender({ userId: 'user_2' });

        await waitFor(() => expect(signal.aborted).toBe(true));
        expect(result.current.userTranscript).toBeNull();
        expect(result.current.assistantReply).toBeNull();
        expect(result.current.turnCount).toBe(0);
        await act(async () => stream.resolve(finalTurn('Old account answer')));
        expect(mockSpeak).not.toHaveBeenCalled();
    });

    it('aborts TTS on unmount and suppresses its late completion callback', async () => {
        const { result, unmount } = setup({ greeting: 'Welcome' });
        await act(async () => result.current.begin());
        await waitFor(() => expect(mockSpeak).toHaveBeenCalled());
        const options = mockSpeak.mock.calls[0][1];

        unmount();
        options.onDone();

        expect(options.signal.aborted).toBe(true);
        expect(mockRecord).not.toHaveBeenCalled();
    });

    it('aborts the spoken turn before barge-in and ignores its stale callbacks', async () => {
        const { result } = setup({ greeting: 'Welcome' });
        await act(async () => result.current.begin());
        await waitFor(() => expect(result.current.status).toBe('speaking'));
        const options = mockSpeak.mock.calls[0][1];

        act(() => result.current.bargeIn());
        await waitFor(() => expect(mockRecord).toHaveBeenCalledTimes(1));
        options.onDone();

        expect(options.signal.aborted).toBe(true);
        expect(mockRecord).toHaveBeenCalledTimes(1);
    });
});
