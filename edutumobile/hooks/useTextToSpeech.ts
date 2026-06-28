import { useState, useCallback, useRef } from 'react';
import * as Speech from 'expo-speech';

export interface UseTextToSpeechReturn {
    isSpeaking: boolean;
    currentText: string | null;
    speak: (text: string, options?: { rate?: number; pitch?: number }) => void;
    stop: () => void;
    pause: () => void;
    resume: () => void;
}

export function useTextToSpeech(): UseTextToSpeechReturn {
    const [isSpeaking, setIsSpeaking] = useState(false);
    const [currentText, setCurrentText] = useState<string | null>(null);
    const speakingTextRef = useRef<string | null>(null);

    const cleanTextForSpeech = useCallback((text: string): string => {
        return text
            .replace(/#{1,6}\s?/g, '')
            .replace(/\*\*(.*?)\*\*/g, '$1')
            .replace(/\*(.*?)\*/g, '$1')
            .replace(/`(.*?)`/g, '$1')
            .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
            .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
            .replace(/https?:\/\/\S+/g, 'link')
            .replace(/\n{2,}/g, '. ')
            .replace(/\n/g, ', ')
            .replace(/\s+/g, ' ')
            .trim();
    }, []);

    const speak = useCallback((text: string, options?: { rate?: number; pitch?: number }) => {
        Speech.isSpeakingAsync().then(isSpeaking => {
            if (isSpeaking) {
                Speech.stop();
            }
        }).catch(() => {});

        const cleanText = cleanTextForSpeech(text);
        if (!cleanText) return;

        setCurrentText(cleanText);
        speakingTextRef.current = cleanText;
        setIsSpeaking(true);

        Speech.speak(cleanText, {
            rate: options?.rate || 1.0,
            pitch: options?.pitch || 1.0,
            volume: 1.0,
            language: 'en',
            onDone: () => {
                setIsSpeaking(false);
                setCurrentText(null);
                speakingTextRef.current = null;
            },
            onError: (error) => {
                console.error('TTS Error:', error);
                setIsSpeaking(false);
                setCurrentText(null);
                speakingTextRef.current = null;
            },
            onStopped: () => {
                setIsSpeaking(false);
                setCurrentText(null);
                speakingTextRef.current = null;
            },
            onPause: () => {
                setIsSpeaking(false);
            },
        });
    }, [cleanTextForSpeech]);

    const stop = useCallback(() => {
        Speech.stop();
        setIsSpeaking(false);
        setCurrentText(null);
        speakingTextRef.current = null;
    }, []);

    const pause = useCallback(() => {
        Speech.pause();
        setIsSpeaking(false);
    }, []);

    const resume = useCallback(() => {
        Speech.resume();
        setIsSpeaking(true);
    }, []);

    return {
        isSpeaking,
        currentText,
        speak,
        stop,
        pause,
        resume,
    };
}
