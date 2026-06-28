import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
    View,
    Text,
    Modal,
    TouchableOpacity,
    StyleSheet,
    Dimensions,
    Platform,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withRepeat,
    withSequence,
    withTiming,
    cancelAnimation,
    FadeIn,
    FadeOut,
} from 'react-native-reanimated';
import { Mic, X, Send, Loader2, AlertCircle } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface WaveformBarProps {
    index: number;
    isActive: boolean;
    isDark: boolean;
}

function WaveformBar({ index, isActive, isDark }: WaveformBarProps) {
    const height = useSharedValue(8);

    useEffect(() => {
        if (isActive) {
            const delay = index * 80;
            const baseHeight = 8 + Math.random() * 32;

            height.value = withRepeat(
                withSequence(
                    withTiming(baseHeight, { duration: 400 + Math.random() * 200 }),
                    withTiming(8 + Math.random() * 16, { duration: 300 + Math.random() * 200 }),
                    withTiming(baseHeight + Math.random() * 12, { duration: 350 + Math.random() * 200 })
                ),
                -1,
                true
            );
        } else {
            cancelAnimation(height);
            height.value = withTiming(8, { duration: 200 });
        }
    }, [isActive, index]);

    const animatedStyle = useAnimatedStyle(() => ({
        height: height.value,
    }));

    return (
        <Animated.View
            style={[
                styles.waveformBar,
                {
                    backgroundColor: isActive
                        ? (isDark ? '#818CF8' : '#6366F1')
                        : (isDark ? '#334155' : '#CBD5E1'),
                },
                animatedStyle,
            ]}
        />
    );
}

interface VoiceRecordingModalProps {
    visible: boolean;
    isDark: boolean;
    onSendTranscript: (transcript: string) => void;
    onClose: () => void;
    recordingState: 'idle' | 'recording' | 'processing' | 'error';
    duration: number;
    transcript: string | null;
    error: string | null;
    onStartRecording: () => void;
    onStopRecording: () => void;
    onReset: () => void;
}

const WAVEFORM_BAR_COUNT = 32;

export default function VoiceRecordingModal({
    visible,
    isDark,
    onSendTranscript,
    onClose,
    recordingState,
    duration,
    transcript,
    error,
    onStartRecording,
    onStopRecording,
    onReset,
}: VoiceRecordingModalProps) {
    const [autoSendTimeout, setAutoSendTimeout] = useState<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        if (transcript && recordingState === 'idle') {
            const timeout = setTimeout(() => {
                onSendTranscript(transcript);
            }, 1500);
            setAutoSendTimeout(timeout);
            return () => clearTimeout(timeout);
        }
    }, [transcript, recordingState, onSendTranscript]);

    const handleSend = useCallback(() => {
        if (autoSendTimeout) {
            clearTimeout(autoSendTimeout);
            setAutoSendTimeout(null);
        }
        if (transcript) {
            onSendTranscript(transcript);
        }
    }, [transcript, onSendTranscript, autoSendTimeout]);

    const handleClose = useCallback(() => {
        if (autoSendTimeout) {
            clearTimeout(autoSendTimeout);
            setAutoSendTimeout(null);
        }
        onReset();
        onClose();
    }, [onReset, onClose, autoSendTimeout]);

    const handleMicPress = useCallback(() => {
        if (recordingState === 'idle' || recordingState === 'error') {
            onStartRecording();
        } else if (recordingState === 'recording') {
            onStopRecording();
        }
    }, [recordingState, onStartRecording, onStopRecording]);

    const formatDuration = (seconds: number): string => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    };

    const isRecording = recordingState === 'recording';
    const isProcessing = recordingState === 'processing';
    const hasError = recordingState === 'error';
    const hasTranscript = !!transcript;

    return (
        <Modal
            visible={visible}
            animationType="fade"
            transparent
            statusBarTranslucent
        >
            <View style={styles.overlay}>
                <BlurView
                    intensity={isDark ? 80 : 90}
                    tint={isDark ? 'dark' : 'light'}
                    style={StyleSheet.absoluteFill}
                />

                <View style={styles.content}>
                    <Animated.View entering={FadeIn.duration(300)} exiting={FadeOut.duration(200)} style={styles.innerContent}>
                        <View style={styles.header}>
                            <Text style={[styles.title, { color: isDark ? '#FFFFFF' : '#0F172A' }]}>
                                {hasTranscript ? 'Voice Message' : (isRecording ? 'Listening...' : (isProcessing ? 'Processing...' : 'Tap to Speak'))}
                            </Text>
                            <TouchableOpacity onPress={handleClose} style={styles.closeBtn}>
                                <X size={24} color={isDark ? '#94A3B8' : '#64748B'} />
                            </TouchableOpacity>
                        </View>

                        <View style={styles.waveformContainer}>
                            {Array.from({ length: WAVEFORM_BAR_COUNT }).map((_, i) => (
                                <WaveformBar
                                    key={i}
                                    index={i}
                                    isActive={isRecording}
                                    isDark={isDark}
                                />
                            ))}
                        </View>

                        {isRecording && (
                            <View style={styles.durationContainer}>
                                <View style={[styles.recordingDot, { backgroundColor: '#EF4444' }]} />
                                <Text style={[styles.durationText, { color: isDark ? '#FFFFFF' : '#0F172A' }]}>
                                    {formatDuration(duration)}
                                </Text>
                            </View>
                        )}

                        {hasTranscript && (
                            <Animated.View entering={FadeIn.duration(300).delay(100)} style={styles.transcriptContainer}>
                                <View style={[styles.transcriptBubble, {
                                    backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)',
                                    borderColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.1)',
                                }]}>
                                    <Text style={[styles.transcriptText, { color: isDark ? '#E2E8F0' : '#334155' }]}>
                                        {transcript}
                                    </Text>
                                </View>
                                <View style={styles.autoSendHint}>
                                    <Loader2 size={14} color={isDark ? '#64748B' : '#94A3B8'} />
                                    <Text style={[styles.autoSendText, { color: isDark ? '#64748B' : '#94A3B8' }]}>
                                        Sending automatically...
                                    </Text>
                                </View>
                            </Animated.View>
                        )}

                        {hasError && (
                            <Animated.View entering={FadeIn.duration(300)} style={styles.errorContainer}>
                                <View style={[styles.errorBubble, {
                                    backgroundColor: 'rgba(239,68,68,0.1)',
                                    borderColor: 'rgba(239,68,68,0.2)',
                                }]}>
                                    <AlertCircle size={18} color="#EF4444" />
                                    <Text style={styles.errorText}>{error || 'Something went wrong'}</Text>
                                </View>
                            </Animated.View>
                        )}

                        <View style={styles.controls}>
                            <TouchableOpacity
                                onPress={handleMicPress}
                                disabled={isProcessing}
                                style={[
                                    styles.micButton,
                                    {
                                        backgroundColor: isRecording
                                            ? '#EF4444'
                                            : (isDark ? '#1E293B' : '#F1F5F9'),
                                        borderColor: isRecording
                                            ? '#EF4444'
                                            : (isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'),
                                        transform: [{ scale: isRecording ? 1.1 : 1 }],
                                    },
                                ]}
                            >
                                {isRecording ? (
                                    <LinearGradient
                                        colors={['#EF4444', '#DC2626']}
                                        style={StyleSheet.absoluteFill}
                                    />
                                ) : null}
                                <Mic
                                    size={28}
                                    color={isRecording ? '#FFFFFF' : (isDark ? '#E2E8F0' : '#334155')}
                                    strokeWidth={2.5}
                                />
                            </TouchableOpacity>

                            {hasTranscript && (
                                <Animated.View entering={FadeIn.duration(200)}>
                                    <TouchableOpacity
                                        onPress={handleSend}
                                        style={[styles.sendButton, { backgroundColor: '#6366F1' }]}
                                    >
                                        <Send size={22} color="#FFFFFF" />
                                    </TouchableOpacity>
                                </Animated.View>
                            )}
                        </View>

                        <Text style={[styles.hintText, { color: isDark ? '#64748B' : '#94A3B8' }]}>
                            {isRecording
                                ? 'Tap microphone to stop'
                                : (hasTranscript ? 'Tap send or wait' : (isProcessing ? 'Transcribing your message...' : 'Tap microphone to start recording'))}
                        </Text>
                    </Animated.View>
                </View>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.5)',
    },
    content: {
        flex: 1,
        justifyContent: 'flex-end',
    },
    innerContent: {
        backgroundColor: 'transparent',
        borderTopLeftRadius: 32,
        borderTopRightRadius: 32,
        padding: 28,
        paddingBottom: 40,
        alignItems: 'center',
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        width: '100%',
        marginBottom: 32,
    },
    title: {
        fontSize: 22,
        fontWeight: '700',
    },
    closeBtn: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: 'rgba(255,255,255,0.1)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    waveformContainer: {
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        gap: 3,
        height: 60,
        width: '100%',
        marginBottom: 24,
    },
    waveformBar: {
        width: 4,
        borderRadius: 2,
        minHeight: 8,
    },
    durationContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        marginBottom: 24,
    },
    recordingDot: {
        width: 10,
        height: 10,
        borderRadius: 5,
    },
    durationText: {
        fontSize: 18,
        fontWeight: '600',
        fontVariant: ['tabular-nums'],
    },
    transcriptContainer: {
        width: '100%',
        marginBottom: 24,
    },
    transcriptBubble: {
        padding: 18,
        borderRadius: 20,
        borderWidth: 1,
        marginBottom: 12,
    },
    transcriptText: {
        fontSize: 16,
        lineHeight: 24,
    },
    autoSendHint: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
    },
    autoSendText: {
        fontSize: 13,
        fontWeight: '500',
    },
    errorContainer: {
        width: '100%',
        marginBottom: 24,
    },
    errorBubble: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        padding: 14,
        borderRadius: 16,
        borderWidth: 1,
    },
    errorText: {
        color: '#FCA5A5',
        fontSize: 14,
        fontWeight: '500',
        flex: 1,
    },
    controls: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 20,
        marginBottom: 20,
    },
    micButton: {
        width: 72,
        height: 72,
        borderRadius: 36,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 2,
        overflow: 'hidden',
    },
    sendButton: {
        width: 56,
        height: 56,
        borderRadius: 28,
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: '#6366F1',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 6,
    },
    hintText: {
        fontSize: 14,
        fontWeight: '500',
        textAlign: 'center',
    },
});
