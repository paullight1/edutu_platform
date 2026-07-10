import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    Dimensions,
    Modal,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAudioPlayer } from 'expo-audio';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { useAuth, useUser } from '@clerk/clerk-expo';
import { useTranslation } from 'react-i18next';
import { MessageSquare, Mic, MicOff, Settings2, Sparkles, X } from 'lucide-react-native';
import Animated, {
    Easing,
    FadeIn,
    FadeInDown,
    cancelAnimation,
    useAnimatedStyle,
    useSharedValue,
    withRepeat,
    withSequence,
    withSpring,
    withTiming,
} from 'react-native-reanimated';
import { useTheme } from '../context/ThemeContext';
import { EdutuLogo } from '../branding/EdutuLogo';
import { ParticleOrb, OrbVisualState } from './ParticleOrb';
import { VoiceSettingsSheet } from './VoiceSettingsSheet';
import { useVoiceSession, VoiceSessionStatus } from '../../hooks/useVoiceSession';
import { closeVoiceMode, useVoiceModeState, VoiceModeKind } from '../../lib/voiceModeStore';
import { useVoiceSettings } from '../../lib/voiceSettingsStore';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
// The canvas is square; the sphere fills ~60% of it, so a full-width canvas
// yields a ball ~0.6×width with breathing room for deformation + pulses.
const ORB_CANVAS = Math.min(SCREEN_WIDTH, 430);

const START_CHIME = require('../../assets/sounds/voice-mode-start.wav');
const END_CHIME = require('../../assets/sounds/voice-mode-end.wav');

function LiveDot({ reducedMotion }: { reducedMotion: boolean }) {
    const pulse = useSharedValue(1);

    useEffect(() => {
        if (reducedMotion) return;
        pulse.value = withRepeat(
            withSequence(
                withTiming(0.35, { duration: 700, easing: Easing.inOut(Easing.quad) }),
                withTiming(1, { duration: 700, easing: Easing.inOut(Easing.quad) }),
            ),
            -1,
            true,
        );
        return () => cancelAnimation(pulse);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [reducedMotion]);

    const style = useAnimatedStyle(() => ({ opacity: pulse.value }));
    return <Animated.View style={[styles.liveDot, style]} />;
}

// Reveals Edutu's reply word-by-word in step with the voice: spoken words are
// bright, not-yet-spoken words dim. `ratio` is the 0→1 playback position.
function SyncedCaption({ text, ratio, active }: { text: string; ratio: number; active: boolean }) {
    const words = useMemo(() => text.split(/\s+/).filter(Boolean), [text]);
    const revealed = active ? Math.round(ratio * words.length) : words.length;
    return (
        <Text style={styles.captionReply}>
            {words.map((word, i) => (
                <Text
                    key={`${i}-${word}`}
                    style={i < revealed ? styles.captionWordSpoken : styles.captionWordPending}
                >
                    {word}
                    {i < words.length - 1 ? ' ' : ''}
                </Text>
            ))}
        </Text>
    );
}

// ─── The session screen (mounted fresh for every voice session) ─────────────
function VoiceSessionScreen({
    mode,
    onRequestClose,
}: {
    mode: VoiceModeKind;
    onRequestClose: () => void;
}) {
    const { t } = useTranslation('chat');
    const insets = useSafeAreaInsets();
    const router = useRouter();
    const { user } = useUser();
    const { getToken } = useAuth();
    const { reducedMotion } = useTheme();
    const { design } = useVoiceSettings();
    const [settingsOpen, setSettingsOpen] = useState(false);
    const settingsPausedMicRef = useRef(false);

    const startPlayer = useAudioPlayer(START_CHIME);

    const session = useVoiceSession({
        mode,
        userId: user?.id ?? null,
        getAuthToken: getToken,
        greeting: t('voiceMode.greeting'),
    });
    const { begin, end } = session;

    // Entry choreography: haptic + chime, the ball blooms in, then the mic
    // arms. The chime plays before allowsRecording flips so iOS routes it to
    // the main speaker.
    useEffect(() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
        try {
            startPlayer.seekTo(0);
            startPlayer.play();
        } catch {}
        const timer = setTimeout(() => begin(), 750);
        return () => {
            clearTimeout(timer);
            end();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Entrance bloom for the whole field — a gentle swell + fade, not a big
    // zoom (it now fills the screen, so start close to 1).
    const orbScale = useSharedValue(0.9);
    const orbOpacity = useSharedValue(0);
    useEffect(() => {
        orbOpacity.value = withTiming(1, { duration: 420 });
        orbScale.value = reducedMotion
            ? withTiming(1, { duration: 220 })
            : withSpring(1, { damping: 16, stiffness: 90 });
        return () => {
            cancelAnimation(orbScale);
            cancelAnimation(orbOpacity);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    const orbStyle = useAnimatedStyle(() => ({
        opacity: orbOpacity.value,
        transform: [{ scale: orbScale.value }],
    }));

    const orbState: OrbVisualState = useMemo(() => {
        if (session.status === 'error') return 'error';
        if (session.muted && session.status === 'idle') return 'muted';
        return session.status as OrbVisualState;
    }, [session.status, session.muted]);

    const statusLabel = useMemo(() => {
        if (session.errorCode === 'permission') return t('voiceMode.errorPermission');
        if (session.errorCode === 'limit') return t('voiceMode.errorLimit');
        if (session.errorCode === 'network') return t('voiceMode.errorNetwork');
        const labels: Record<VoiceSessionStatus, string> = {
            idle: session.muted
                ? t('voiceMode.statusMuted')
                : mode === 'live'
                    ? t('voiceMode.statusConnecting')
                    : t('voiceMode.statusIdle'),
            listening: t('voiceMode.statusListening'),
            transcribing: t('voiceMode.statusTranscribing'),
            thinking: t('voiceMode.statusThinking'),
            speaking: t('voiceMode.statusSpeaking'),
            error: t('voiceMode.errorNetwork'),
        };
        return labels[session.status];
    }, [session.status, session.errorCode, session.muted, mode, t]);

    const handleEnd = useCallback(() => {
        end();
        onRequestClose();
    }, [end, onRequestClose]);

    const handleOpenChat = useCallback(() => {
        end();
        onRequestClose();
        router.push('/chat' as never);
    }, [end, onRequestClose, router]);

    const handleUpgrade = useCallback(() => {
        end();
        onRequestClose();
        router.push('/paywall' as never);
    }, [end, onRequestClose, router]);

    // Settings pauses the mic (voice previews would be transcribed otherwise)
    // and restores it on close.
    const handleOpenSettings = useCallback(() => {
        if (!session.muted && session.status === 'listening') {
            session.toggleMute();
            settingsPausedMicRef.current = true;
        }
        setSettingsOpen(true);
    }, [session]);

    const handleCloseSettings = useCallback(() => {
        setSettingsOpen(false);
        if (settingsPausedMicRef.current) {
            settingsPausedMicRef.current = false;
            session.toggleMute();
        }
    }, [session]);

    return (
        <View style={styles.root}>
            {/* Full-bleed animated field — the orb's colour washes edge-to-edge
                across the whole room instead of sitting in a square. Purely
                decorative: taps pass through to the centred hit target below. */}
            <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, orbStyle]}>
                <ParticleOrb
                    fill
                    size={ORB_CANVAS}
                    design={design}
                    state={orbState}
                    level={session.status === 'listening' ? session.level : 0}
                    reducedMotion={reducedMotion}
                />
            </Animated.View>

            {/* Header — Edutu logo badge + settings */}
            <View style={[styles.header, { paddingTop: insets.top + 14 }]}>
                <Animated.View entering={FadeIn.duration(400)} style={styles.badge}>
                    <EdutuLogo frameless size={18} />
                    {mode === 'live' ? <LiveDot reducedMotion={reducedMotion} /> : null}
                    <Text style={styles.badgeText}>
                        {mode === 'live' ? t('voiceMode.badgeLive') : t('voiceMode.badgeVoice')}
                    </Text>
                </Animated.View>
                <TouchableOpacity
                    onPress={handleOpenSettings}
                    activeOpacity={0.7}
                    style={[styles.settingsBtn, { top: insets.top + 10 }]}
                    accessibilityRole="button"
                    accessibilityLabel={t('voiceMode.settingsTitle')}
                >
                    <Settings2 size={20} color="#9CA3AF" strokeWidth={2} />
                </TouchableOpacity>
            </View>

            {/* Tap-to-talk hit target, centred over the orb in the field behind. */}
            <View style={styles.orbZone}>
                <Pressable
                    onPress={session.onOrbPress}
                    style={styles.tapTarget}
                    accessibilityRole="button"
                    accessibilityLabel={statusLabel}
                />

                <Animated.Text entering={FadeInDown.duration(320)} key={statusLabel} style={styles.statusText}>
                    {statusLabel}
                </Animated.Text>
            </View>

            {/* Captions */}
            <View style={styles.captions}>
                {session.userTranscript ? (
                    <Text style={styles.captionUser} numberOfLines={2}>
                        {t('voiceMode.youLabel')} · {session.userTranscript}
                    </Text>
                ) : null}
                {session.assistantReply ? (
                    <ScrollView style={styles.captionScroll} showsVerticalScrollIndicator={false}>
                        <Animated.View entering={FadeIn.duration(300)}>
                            <SyncedCaption
                                text={session.assistantReply}
                                ratio={session.spokenRatio}
                                active={session.status === 'speaking'}
                            />
                        </Animated.View>
                    </ScrollView>
                ) : null}
                {session.errorCode === 'limit' ? (
                    <TouchableOpacity onPress={handleUpgrade} activeOpacity={0.85} style={styles.upgradePill}>
                        <Sparkles size={14} color="#FFFFFF" />
                        <Text style={styles.upgradePillText}>{t('limit.upgradeCta')}</Text>
                    </TouchableOpacity>
                ) : null}
            </View>

            {/* Controls — ChatGPT voice-mode grammar: neutral circles + red end */}
            <View style={[styles.controls, { paddingBottom: Math.max(insets.bottom, 16) + 14 }]}>
                <TouchableOpacity
                    onPress={session.toggleMute}
                    activeOpacity={0.8}
                    style={[styles.controlBtn, session.muted && styles.controlBtnMuted]}
                    accessibilityRole="button"
                    accessibilityLabel={session.muted ? t('voiceMode.unmute') : t('voiceMode.mute')}
                >
                    {session.muted ? (
                        <MicOff size={22} color="#0A0A0A" strokeWidth={2.1} />
                    ) : (
                        <Mic size={22} color="#E5E7EB" strokeWidth={2.1} />
                    )}
                </TouchableOpacity>

                <TouchableOpacity
                    onPress={handleEnd}
                    activeOpacity={0.85}
                    style={styles.endBtn}
                    accessibilityRole="button"
                    accessibilityLabel={t('voiceMode.end')}
                >
                    <X size={26} color="#FFFFFF" strokeWidth={2.4} />
                </TouchableOpacity>

                <TouchableOpacity
                    onPress={handleOpenChat}
                    activeOpacity={0.8}
                    style={styles.controlBtn}
                    accessibilityRole="button"
                    accessibilityLabel={t('voiceMode.openChat')}
                >
                    <MessageSquare size={22} color="#E5E7EB" strokeWidth={2.1} />
                </TouchableOpacity>
            </View>

            <VoiceSettingsSheet visible={settingsOpen} onClose={handleCloseSettings} />
        </View>
    );
}

// ─── Overlay shell (always mounted at the layout root) ──────────────────────
export function VoiceModeOverlay() {
    const { visible, mode } = useVoiceModeState();
    const endPlayer = useAudioPlayer(END_CHIME);
    const wasVisibleRef = useRef(false);

    const handleClose = useCallback(() => {
        closeVoiceMode();
    }, []);

    // Exit chime — played by the shell (not the session screen) so it isn't
    // cut off when the Modal unmounts the session.
    useEffect(() => {
        if (wasVisibleRef.current && !visible) {
            try {
                endPlayer.seekTo(0);
                endPlayer.play();
            } catch {}
        }
        wasVisibleRef.current = visible;
    }, [visible, endPlayer]);

    return (
        <Modal
            visible={visible}
            animationType="fade"
            transparent
            statusBarTranslucent
            onRequestClose={handleClose}
        >
            {visible ? <VoiceSessionScreen mode={mode} onRequestClose={handleClose} /> : null}
        </Modal>
    );
}

// ─── Styles ──────────────────────────────────────────────────────────────────
// The reference aesthetic is a particle sphere on pure black, so the room is
// black in both app themes — the ball needs the void to glow against.
const styles = StyleSheet.create({
    root: {
        flex: 1,
        backgroundColor: '#000000',
    },
    header: {
        alignItems: 'center',
    },
    settingsBtn: {
        position: 'absolute',
        right: 16,
        width: 40,
        height: 40,
        borderRadius: 20,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(255,255,255,0.06)',
    },
    badge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 7,
        paddingHorizontal: 13,
        paddingVertical: 6,
        borderRadius: 999,
        backgroundColor: 'rgba(255,255,255,0.06)',
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: 'rgba(255,255,255,0.14)',
    },
    badgeText: {
        color: '#D1D5DB',
        fontSize: 12.5,
        fontWeight: '600',
        letterSpacing: 0.2,
    },
    liveDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: '#F87171',
    },
    orbZone: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 24,
    },
    tapTarget: {
        width: 260,
        height: 260,
        borderRadius: 130,
    },
    statusText: {
        color: '#9CA3AF',
        fontSize: 15,
        fontWeight: '500',
        textAlign: 'center',
        paddingHorizontal: 40,
        lineHeight: 22,
    },
    captions: {
        minHeight: 92,
        maxHeight: 186,
        paddingHorizontal: 32,
        gap: 10,
    },
    captionUser: {
        color: '#6B7280',
        fontSize: 13.5,
        fontWeight: '600',
        textAlign: 'center',
        lineHeight: 19,
    },
    captionScroll: {
        maxHeight: 130,
    },
    captionReply: {
        fontSize: 15.5,
        fontWeight: '400',
        textAlign: 'center',
        lineHeight: 23,
    },
    captionWordSpoken: {
        color: '#F3F4F6',
    },
    captionWordPending: {
        color: 'rgba(243,244,246,0.32)',
    },
    upgradePill: {
        alignSelf: 'center',
        flexDirection: 'row',
        alignItems: 'center',
        gap: 7,
        backgroundColor: '#6366F1',
        paddingHorizontal: 18,
        paddingVertical: 10,
        borderRadius: 999,
    },
    upgradePillText: {
        color: '#FFFFFF',
        fontSize: 14,
        fontWeight: '700',
    },
    controls: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 28,
        paddingTop: 18,
    },
    controlBtn: {
        width: 60,
        height: 60,
        borderRadius: 30,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(255,255,255,0.10)',
    },
    controlBtnMuted: {
        backgroundColor: '#FFFFFF',
    },
    endBtn: {
        width: 72,
        height: 72,
        borderRadius: 36,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#DC2626',
    },
});
