import { useState, useCallback, useEffect, useRef } from 'react';
import { speak as edutuSpeak, stopSpeaking } from '../lib/edutuSpeech';
import { getVoiceSettings } from '../lib/voiceSettingsStore';
import i18n from '../lib/i18n';

export interface UseTextToSpeechConfig {
    /** Clerk token getter — required for Edutu's server voice; without it the
     *  device synthesizer is used as a fallback. */
    getAuthToken?: () => Promise<string | null>;
}

export interface UseTextToSpeechReturn {
    isSpeaking: boolean;
    currentText: string | null;
    speak: (text: string) => void;
    stop: () => void;
}

/**
 * Speaks chat replies in Edutu's branded neural voice (server TTS, with a
 * device fallback). Shares the single global speaker with voice mode, so
 * starting playback here cancels any voice-mode utterance and vice versa.
 */
export function useTextToSpeech(config: UseTextToSpeechConfig = {}): UseTextToSpeechReturn {
    const [isSpeaking, setIsSpeaking] = useState(false);
    const [currentText, setCurrentText] = useState<string | null>(null);
    const { getAuthToken } = config;
    const getAuthTokenRef = useRef(getAuthToken);
    useEffect(() => {
        // Post-commit write; render-time ref writes are unsafe under
        // concurrent rendering.
        getAuthTokenRef.current = getAuthToken;
    });

    const speak = useCallback((text: string) => {
        if (!text?.trim()) return;
        setCurrentText(text);
        setIsSpeaking(true);
        void edutuSpeak(text, {
            voice: getVoiceSettings().ttsVoice,
            language: i18n.language?.split('-')[0] || 'en',
            getAuthToken: getAuthTokenRef.current,
            onDone: () => {
                setIsSpeaking(false);
                setCurrentText(null);
            },
            onStopped: () => {
                setIsSpeaking(false);
                setCurrentText(null);
            },
            onError: () => {
                setIsSpeaking(false);
                setCurrentText(null);
            },
        });
    }, []);

    const stop = useCallback(() => {
        stopSpeaking();
        setIsSpeaking(false);
        setCurrentText(null);
    }, []);

    return { isSpeaking, currentText, speak, stop };
}
