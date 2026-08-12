import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    AccessibilityInfo,
    Linking,
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
import { haptics } from '../../lib/haptics';
import { useRouter } from 'expo-router';
import { useAuth, useUser } from '@clerk/clerk-expo';
import { useProStatus } from '@edutu/core/src/hooks/useProStatus';
import { supabase } from '../../lib/supabase';
import { premiumVoiceEnabledForEntitlement, setPremiumVoiceEnabled } from '../../lib/edutuSpeech';
import { useTranslation } from 'react-i18next';
import { MessageSquare, Mic, MicOff, Settings2, AudioLines, RotateCcw, SlidersHorizontal, X } from 'lucide-react-native';
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
import { usePromptProUpgrade } from '../../lib/upsell';

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

// A live meter of what the mic is actually hearing. The orb reacts to level
// too, but it also breathes when idle — this is the one element on screen
// that moves ONLY when Edutu is really picking up sound, which is what makes
// "is it hearing me?" answerable at a glance.
function LevelMeter({ level, tint }: { level: number; tint: string }) {
    // Weighted per bar so the middle bars lead — reads as a voice meter, not
    // a progress bar.
    const weights = [0.55, 0.85, 1, 0.7];
    return (
        <View style={styles.meter}>
            {weights.map((weight, i) => {
                const height = 4 + Math.min(1, level * weight * 1.35) * 12;
                return <View key={i} style={[styles.meterBar, { height, backgroundColor: tint }]} />;
            })}
        </View>
    );
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
    const promptProUpgrade = usePromptProUpgrade();
    const { user } = useUser();
    const { getToken } = useAuth();
    // Premium branded voices are a Pro perk; free users hear the device
    // synthesizer. Fail closed until this account has an explicit loaded Pro
    // result so a stale entitlement can never spend premium TTS credits.
    const { isPro, isLoading: proLoading } = useProStatus(supabase, user?.id ?? null);
    useEffect(() => {
        setPremiumVoiceEnabled(premiumVoiceEnabledForEntitlement(isPro, proLoading));
    }, [isPro, proLoading]);
    const { reducedMotion, colors } = useTheme();
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
        haptics.medium();
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

    // The session has spoken at least once — used to tell "still connecting"
    // apart from "waiting for you", which the old copy conflated (live mode
    // said "Starting…" for the entire session).
    const hasStarted = Boolean(session.assistantReply || session.userTranscript);

    const statusLabel = useMemo(() => {
        if (session.errorCode === 'permission') return t('voiceMode.errorPermission');
        if (session.errorCode === 'limit') return t('voiceMode.errorLimit');
        if (session.errorCode === 'network') return t('voiceMode.errorNetwork');
        if (session.paused) return t('voiceMode.statusPaused');
        const labels: Record<VoiceSessionStatus, string> = {
            idle: session.muted
                ? t('voiceMode.statusMuted')
                : mode === 'live'
                    ? hasStarted
                        ? t('voiceMode.statusReady')
                        : t('voiceMode.statusConnecting')
                    : t('voiceMode.statusIdle'),
            listening: t('voiceMode.statusListening'),
            transcribing: t('voiceMode.statusTranscribing'),
            thinking: t('voiceMode.statusThinking'),
            speaking: t('voiceMode.statusSpeaking'),
            error: t('voiceMode.errorNetwork'),
        };
        return labels[session.status];
    }, [session.status, session.errorCode, session.muted, session.paused, hasStarted, mode, t]);

    // One colour per state, so "listening / thinking / speaking" is readable
    // without parsing the sentence. Accent carries the live state per DESIGN.md
    // §1; only genuine failure gets the error red.
    const statusTone = useMemo(() => {
        if (session.errorCode || session.status === 'error') return colors.error;
        if (session.muted || session.paused) return '#9CA3AF';
        switch (session.status) {
            case 'listening':
                return colors.accentLight;
            case 'transcribing':
            case 'thinking':
                return colors.warning;
            case 'speaking':
                return colors.success;
            default:
                return '#9CA3AF';
        }
    }, [session.status, session.errorCode, session.muted, session.paused, colors]);

    // Status changes are the whole interface here, and a screen-reader user
    // can't see the orb change colour — announce every transition.
    useEffect(() => {
        AccessibilityInfo.announceForAccessibility?.(statusLabel);
    }, [statusLabel]);

    const handleEnd = useCallback(() => {
        end();
        onRequestClose();
    }, [end, onRequestClose]);

    const handleOpenChat = useCallback(() => {
        end();
        onRequestClose();
        router.push('/chat' as never);
    }, [end, onRequestClose, router]);

    // Shared upsell (lib/upsell). The overlay already shows the limit copy next
    // to this pill, so it opens the paywall directly.
    const handleUpgrade = useCallback(() => {
        end();
        onRequestClose();
        promptProUpgrade({ direct: true });
    }, [end, onRequestClose, promptProUpgrade]);

    /**
     * One contextual action that always answers "so what do I do now?".
     * Every state that used to be a dead end (permission denied with an
     * instruction and no button, a dropped turn with nothing but "tap the
     * orb") now has a real control here.
     */
    const primaryAction = useMemo(() => {
        if (session.errorCode === 'permission') {
            return {
                label: t('voiceMode.actionOpenSettings'),
                Icon: SlidersHorizontal,
                onPress: () => { void Linking.openSettings(); },
            };
        }
        if (session.errorCode === 'network') {
            return { label: t('voiceMode.actionTryAgain'), Icon: RotateCcw, onPress: session.retry };
        }
        if (session.paused) {
            return { label: t('voiceMode.actionResume'), Icon: RotateCcw, onPress: session.retry };
        }
        if (session.status === 'speaking') {
            return { label: t('voiceMode.actionInterrupt'), Icon: Mic, onPress: session.bargeIn };
        }
        return null;
    }, [session.errorCode, session.paused, session.status, session.retry, session.bargeIn, t]);

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

            {/* The orb lives INSIDE this zone (not behind the whole screen), so
                it centres between the header and the transcript instead of at
                the screen's midpoint — which is what used to leave a dead gap
                under the pill and push the ball down into the caption. The
                whole zone is the hit target: the orb reads as tappable edge to
                edge, so a tap next to the ball no longer does nothing. */}
            <View style={styles.orbZone}>
                <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, orbStyle]}>
                    <ParticleOrb
                        fill
                        design={design}
                        state={orbState}
                        level={session.status === 'listening' ? session.level : 0}
                        reducedMotion={reducedMotion}
                    />
                </Animated.View>

                <Pressable
                    onPress={session.onOrbPress}
                    style={StyleSheet.absoluteFill}
                    accessibilityRole="button"
                    accessibilityLabel={statusLabel}
                    accessibilityHint={t('voiceMode.orbHint')}
                />

                {/* Status sits at the FOOT of the orb zone — legible on its own
                    chip, never printed across the particles. */}
                <View pointerEvents="none" style={styles.statusDock}>
                    <Animated.View
                        key={statusLabel}
                        entering={reducedMotion ? undefined : FadeInDown.duration(260)}
                        style={[styles.statusChip, { borderColor: `${statusTone}66` }]}
                    >
                        <View style={[styles.statusDot, { backgroundColor: statusTone }]} />
                        <Text style={styles.statusText} numberOfLines={3}>
                            {statusLabel}
                        </Text>
                        {session.status === 'listening' ? (
                            <LevelMeter level={session.level} tint={statusTone} />
                        ) : null}
                    </Animated.View>
                </View>
            </View>

            {/* Transcript + the one contextual action for the current state */}
            <View style={styles.captions}>
                {session.userTranscript ? (
                    <Text style={styles.captionUser} numberOfLines={2}>
                        {t('voiceMode.youLabel')} · {session.userTranscript}
                    </Text>
                ) : null}
                {session.assistantReply ? (
                    <ScrollView style={styles.captionScroll} showsVerticalScrollIndicator={false}>
                        <Animated.View entering={reducedMotion ? undefined : FadeIn.duration(300)}>
                            <SyncedCaption
                                text={session.assistantReply}
                                ratio={session.spokenRatio}
                                active={session.status === 'speaking'}
                            />
                        </Animated.View>
                    </ScrollView>
                ) : null}
                {session.errorCode === 'limit' ? (
                    <TouchableOpacity onPress={handleUpgrade} activeOpacity={0.85} style={[styles.upgradePill, { backgroundColor: colors.accent }]}>
                        <AudioLines size={14} color="#FFFFFF" />
                        <Text style={styles.upgradePillText}>{t('limit.upgradeCta')}</Text>
                    </TouchableOpacity>
                ) : primaryAction ? (
                    <TouchableOpacity
                        onPress={primaryAction.onPress}
                        activeOpacity={0.85}
                        style={styles.actionPill}
                        accessibilityRole="button"
                        accessibilityLabel={primaryAction.label}
                    >
                        <primaryAction.Icon size={15} color="#F9FAFB" strokeWidth={2.2} />
                        <Text style={styles.actionPillText}>{primaryAction.label}</Text>
                    </TouchableOpacity>
                ) : null}
            </View>

            {/* Controls — ChatGPT voice-mode grammar: neutral circles + red end.
                Captions are SHORT verbs ("Mute", "End", "Chat"); the full
                sentence stays on accessibilityLabel. The old captions reused
                the long a11y strings and clipped to "Mute micropho…". */}
            <View style={[styles.controls, { paddingBottom: Math.max(insets.bottom, 16) + 6 }]}>
                <View style={[styles.controlCol, styles.controlColSide]}>
                    <TouchableOpacity
                        onPress={session.toggleMute}
                        activeOpacity={0.8}
                        style={[styles.controlBtn, session.muted && styles.controlBtnMuted]}
                        accessibilityRole="button"
                        accessibilityState={{ selected: session.muted }}
                        accessibilityLabel={session.muted ? t('voiceMode.unmute') : t('voiceMode.mute')}
                    >
                        {session.muted ? (
                            <MicOff size={22} color="#0A0A0A" strokeWidth={2.1} />
                        ) : (
                            <Mic size={22} color="#E5E7EB" strokeWidth={2.1} />
                        )}
                    </TouchableOpacity>
                    <Text style={styles.controlLabel} numberOfLines={2}>
                        {session.muted ? t('voiceMode.unmuteShort') : t('voiceMode.muteShort')}
                    </Text>
                </View>

                <View style={styles.controlCol}>
                    <TouchableOpacity
                        onPress={handleEnd}
                        activeOpacity={0.85}
                        style={styles.endBtn}
                        accessibilityRole="button"
                        accessibilityLabel={t('voiceMode.end')}
                    >
                        <X size={26} color="#FFFFFF" strokeWidth={2.4} />
                    </TouchableOpacity>
                    <Text style={styles.controlLabel} numberOfLines={2}>
                        {t('voiceMode.endShort')}
                    </Text>
                </View>

                <View style={[styles.controlCol, styles.controlColSide]}>
                    <TouchableOpacity
                        onPress={handleOpenChat}
                        activeOpacity={0.8}
                        style={styles.controlBtn}
                        accessibilityRole="button"
                        accessibilityLabel={t('voiceMode.openChat')}
                    >
                        <MessageSquare size={22} color="#E5E7EB" strokeWidth={2.1} />
                    </TouchableOpacity>
                    <Text style={styles.controlLabel} numberOfLines={2}>
                        {t('voiceMode.chatShort')}
                    </Text>
                </View>
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
    // The orb's own canvas. It centres in here, so the ball sits optically
    // between the pill and the transcript instead of at the screen midpoint.
    orbZone: {
        flex: 1,
        justifyContent: 'flex-end',
        alignItems: 'center',
    },
    statusDock: {
        paddingBottom: 6,
        alignItems: 'center',
        width: '100%',
    },
    statusChip: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 9,
        maxWidth: 320,
        paddingHorizontal: 14,
        paddingVertical: 9,
        borderRadius: 999,
        borderCurve: 'continuous',
        borderWidth: StyleSheet.hairlineWidth,
        // Opaque enough to stay readable over the orb's brightest core.
        backgroundColor: 'rgba(8,9,13,0.72)',
    },
    statusDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
    },
    statusText: {
        color: '#E5E7EB',
        fontSize: 14.5,
        fontWeight: '600',
        textAlign: 'center',
        lineHeight: 20,
        flexShrink: 1,
    },
    meter: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 3,
        height: 16,
    },
    meterBar: {
        width: 3,
        borderRadius: 2,
    },
    captions: {
        minHeight: 104,
        maxHeight: 190,
        paddingHorizontal: 32,
        paddingTop: 8,
        gap: 10,
    },
    captionUser: {
        color: '#9CA3AF',
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
        paddingHorizontal: 18,
        paddingVertical: 10,
        borderRadius: 999,
    },
    upgradePillText: {
        color: '#FFFFFF',
        fontSize: 14,
        fontWeight: '700',
    },
    actionPill: {
        alignSelf: 'center',
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        paddingHorizontal: 18,
        paddingVertical: 10,
        borderRadius: 999,
        borderCurve: 'continuous',
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: 'rgba(255,255,255,0.22)',
        backgroundColor: 'rgba(255,255,255,0.10)',
    },
    actionPillText: {
        color: '#F9FAFB',
        fontSize: 14,
        fontWeight: '700',
    },
    controls: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        justifyContent: 'center',
        gap: 20,
        paddingTop: 14,
    },
    controlCol: {
        alignItems: 'center',
        gap: 7,
        // Wide enough for a two-word verb in every locale (German/Swahili
        // "Unmute" is long) without the columns colliding.
        width: 96,
    },
    // Optically centres the 60px side circles against the 72px end button.
    controlColSide: {
        paddingTop: 6,
    },
    controlLabel: {
        color: '#9CA3AF',
        fontSize: 12,
        fontWeight: '600',
        lineHeight: 15,
        textAlign: 'center',
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
