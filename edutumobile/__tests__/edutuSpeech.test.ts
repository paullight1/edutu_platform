import * as Speech from 'expo-speech';
import { createAudioPlayer } from 'expo-audio';

const mockSpeechSpeak = Speech.speak as jest.Mock;
const mockSpeechStop = Speech.stop as jest.Mock;
const mockCreateAudioPlayer = createAudioPlayer as jest.Mock;

describe('Edutu speech cancellation and entitlement gate', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('defaults premium voice to disabled', () => {
        jest.isolateModules(() => {
            const { isPremiumVoiceEnabled } = require('../lib/edutuSpeech');
            expect(isPremiumVoiceEnabled()).toBe(false);
        });
    });

    it('enables premium voice only after a loaded Pro result', () => {
        const { premiumVoiceEnabledForEntitlement } = require('../lib/edutuSpeech');

        expect(premiumVoiceEnabledForEntitlement(true, true)).toBe(false);
        expect(premiumVoiceEnabledForEntitlement(false, false)).toBe(false);
        expect(premiumVoiceEnabledForEntitlement(true, false)).toBe(true);
    });

    it('passes the signal to synthesis and does not fall back after abort', async () => {
        const { setPremiumVoiceEnabled, speak } = require('../lib/edutuSpeech');
        setPremiumVoiceEnabled(true);
        const controller = new AbortController();
        const onDone = jest.fn();
        const onError = jest.fn();
        const fetchMock = jest.fn((_url, init) => new Promise((_resolve, reject) => {
            init.signal.addEventListener('abort', () => {
                const error = new Error('aborted');
                error.name = 'AbortError';
                reject(error);
            });
        }));
        (global as unknown as { fetch: jest.Mock }).fetch = fetchMock;

        const speaking = speak('Hello there', {
            signal: controller.signal,
            getAuthToken: async () => 'token',
            onDone,
            onError,
        });
        await Promise.resolve();
        await Promise.resolve();
        controller.abort();
        await speaking;

        expect(fetchMock.mock.calls[0][1].signal).toBe(controller.signal);
        expect(mockSpeechSpeak).not.toHaveBeenCalled();
        expect(onDone).not.toHaveBeenCalled();
        expect(onError).not.toHaveBeenCalled();
    });

    it('stops device speech and suppresses late callbacks when aborted', async () => {
        const { setPremiumVoiceEnabled, speak } = require('../lib/edutuSpeech');
        setPremiumVoiceEnabled(false);
        const controller = new AbortController();
        const onDone = jest.fn();
        const onProgress = jest.fn();

        await speak('Device voice', { signal: controller.signal, onDone, onProgress });
        const callbacks = mockSpeechSpeak.mock.calls[0][1];
        controller.abort();
        callbacks.onDone();

        expect(mockSpeechStop).toHaveBeenCalled();
        expect(onDone).not.toHaveBeenCalled();
        expect(onProgress).not.toHaveBeenCalled();
    });

    it('reports an asynchronous player error and tears down the active playback', async () => {
        const { setPremiumVoiceEnabled, speak } = require('../lib/edutuSpeech');
        setPremiumVoiceEnabled(true);

        let statusListener: ((status: Record<string, unknown>) => void) | undefined;
        const removeListener = jest.fn();
        const removePlayer = jest.fn();
        const play = jest.fn();
        mockCreateAudioPlayer.mockReturnValueOnce({
            play,
            remove: removePlayer,
            addListener: jest.fn((_event: string, listener: (status: Record<string, unknown>) => void) => {
                statusListener = listener;
                return { remove: removeListener };
            }),
        });
        (global as unknown as { fetch: jest.Mock }).fetch = jest.fn(async () => ({
            ok: true,
            json: async () => ({ audio: 'QUJD', mimeType: 'audio/mpeg' }),
        }));

        const onDone = jest.fn();
        const onError = jest.fn();
        await speak('Server voice', {
            getAuthToken: async () => 'token',
            onDone,
            onError,
        });

        expect(play).toHaveBeenCalledTimes(1);
        expect(statusListener).toBeDefined();

        statusListener?.({
            duration: 2,
            currentTime: 0,
            didJustFinish: false,
            error: 'decoder failed',
        });

        expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: 'decoder failed' }));
        expect(onDone).not.toHaveBeenCalled();
        expect(removeListener).toHaveBeenCalledTimes(1);
        expect(removePlayer).toHaveBeenCalledTimes(1);
    });
});
