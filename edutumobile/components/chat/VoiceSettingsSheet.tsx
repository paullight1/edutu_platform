import React, { useMemo } from 'react';
import {
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { useAuth } from '@clerk/clerk-expo';
import { useTranslation } from 'react-i18next';
import { Check, Sparkles } from 'lucide-react-native';
import Animated, { FadeIn, FadeOut, SlideInDown, SlideOutDown } from 'react-native-reanimated';
import { speak as edutuSpeak } from '../../lib/edutuSpeech';
import {
    ORB_DESIGNS,
    OrbDesign,
    TTS_VOICES,
    setOrbDesign,
    setTtsVoice,
    useVoiceSettings,
} from '../../lib/voiceSettingsStore';

interface VoiceSettingsSheetProps {
    visible: boolean;
    onClose: () => void;
}

const PREVIEW = 64;

/** Stylized previews — the live orb behind the sheet is the real preview. */
function DesignPreview({ design }: { design: OrbDesign }) {
    switch (design) {
        case 'ring':
            return <View style={[p.base, p.ring]} />;
        case 'bubble':
            return (
                <LinearGradient
                    colors={['#8B5CF6', '#6D28D9', '#3B82F6']}
                    start={{ x: 0.1, y: 0.1 }}
                    end={{ x: 0.9, y: 0.9 }}
                    style={[p.base, p.round]}
                >
                    <Sparkles size={22} color="rgba(255,255,255,0.95)" />
                </LinearGradient>
            );
        case 'crystal':
            return (
                <LinearGradient
                    colors={['#E9D5FF', '#C7B9FF', '#93C5FD']}
                    start={{ x: 0.1, y: 0.1 }}
                    end={{ x: 0.9, y: 0.9 }}
                    style={[p.base, p.round]}
                >
                    <Sparkles size={24} color="rgba(255,255,255,0.98)" />
                </LinearGradient>
            );
        case 'glass':
            return (
                <LinearGradient
                    colors={['#2A1743', '#581C87', '#9333EA']}
                    start={{ x: 0.15, y: 0.1 }}
                    end={{ x: 0.85, y: 0.95 }}
                    style={[p.base, p.round, p.glass]}
                >
                    <View style={p.glassSwirl} />
                    <View style={p.glassSheen} />
                </LinearGradient>
            );
        case 'blob':
            return (
                <LinearGradient
                    colors={['#EAF6FF', '#EDE4FF', '#F7C8E6']}
                    start={{ x: 0.5, y: 0 }}
                    end={{ x: 0.5, y: 1 }}
                    style={[p.base, p.round, p.blobBody]}
                >
                    <View style={p.blobEyes}>
                        <View style={p.blobEye} />
                        <View style={p.blobEye} />
                    </View>
                </LinearGradient>
            );
        case 'petals': {
            const dots = Array.from({ length: 7 });
            return (
                <View style={[p.base, p.petals]}>
                    {dots.map((_, i) => {
                        const a = (i / 7) * Math.PI * 2 - Math.PI / 2;
                        const r = PREVIEW * 0.30;
                        return (
                            <View
                                key={i}
                                style={[
                                    p.petalDot,
                                    {
                                        backgroundColor: i < 3 ? '#EC4899' : i < 5 ? '#A855F7' : '#6D28D9',
                                        transform: [
                                            { translateX: Math.cos(a) * r },
                                            { translateY: Math.sin(a) * r },
                                            { rotate: `${a + Math.PI / 2}rad` },
                                        ],
                                    },
                                ]}
                            />
                        );
                    })}
                </View>
            );
        }
        case 'robot':
            return (
                <View style={[p.base, p.robot]}>
                    <View style={p.visor}>
                        <View style={p.eye} />
                        <View style={p.eye} />
                    </View>
                </View>
            );
        default:
            return <View style={[p.base, p.particles]} />;
    }
}

export function VoiceSettingsSheet({ visible, onClose }: VoiceSettingsSheetProps) {
    const { t } = useTranslation('chat');
    const insets = useSafeAreaInsets();
    const settings = useVoiceSettings();
    const { getToken } = useAuth();

    const designLabels: Record<OrbDesign, string> = useMemo(() => ({
        particles: t('voiceMode.designParticles'),
        ring: t('voiceMode.designRing'),
        bubble: t('voiceMode.designBubble'),
        robot: t('voiceMode.designRobot'),
        crystal: t('voiceMode.designCrystal'),
        glass: t('voiceMode.designGlass'),
        blob: t('voiceMode.designBlob'),
        petals: t('voiceMode.designPetals'),
    }), [t]);

    // Selecting a voice previews it immediately in Edutu's own voice so the
    // user hears the difference before committing.
    const previewVoice = (voiceId: string) => {
        setTtsVoice(voiceId);
        Haptics.selectionAsync().catch(() => {});
        void edutuSpeak(t('voiceMode.voiceSample'), {
            voice: voiceId,
            getAuthToken: getToken,
        });
    };

    if (!visible) return null;

    return (
        <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
            <Animated.View entering={FadeIn.duration(180)} exiting={FadeOut.duration(160)} style={styles.backdrop}>
                <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel={t('voiceMode.settingsDone')} />
            </Animated.View>

            <Animated.View
                entering={SlideInDown.duration(280)}
                exiting={SlideOutDown.duration(220)}
                style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 14) }]}
            >
                <View style={styles.handle} />
                <View style={styles.headerRow}>
                    <Text style={styles.title}>{t('voiceMode.settingsTitle')}</Text>
                    <TouchableOpacity onPress={onClose} activeOpacity={0.7} style={styles.doneBtn}>
                        <Text style={styles.doneText}>{t('voiceMode.settingsDone')}</Text>
                    </TouchableOpacity>
                </View>

                <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollBody}>
                    <Text style={styles.sectionLabel}>{t('voiceMode.settingsDesign')}</Text>
                    <View style={styles.designGrid}>
                        {ORB_DESIGNS.map((design) => {
                            const selected = settings.design === design;
                            return (
                                <TouchableOpacity
                                    key={design}
                                    onPress={() => {
                                        setOrbDesign(design);
                                        Haptics.selectionAsync().catch(() => {});
                                    }}
                                    activeOpacity={0.8}
                                    style={[styles.designCard, selected && styles.designCardSelected]}
                                    accessibilityRole="button"
                                    accessibilityState={{ selected }}
                                    accessibilityLabel={designLabels[design]}
                                >
                                    <DesignPreview design={design} />
                                    <Text style={[styles.designName, selected && styles.designNameSelected]} numberOfLines={1}>
                                        {designLabels[design]}
                                    </Text>
                                </TouchableOpacity>
                            );
                        })}
                    </View>

                    <Text style={styles.sectionLabel}>{t('voiceMode.settingsVoice')}</Text>
                    {TTS_VOICES.map((voice) => {
                        const selected = settings.ttsVoice === voice.id;
                        return (
                            <TouchableOpacity
                                key={voice.id}
                                onPress={() => previewVoice(voice.id)}
                                activeOpacity={0.7}
                                style={styles.voiceRow}
                                accessibilityRole="button"
                                accessibilityState={{ selected }}
                            >
                                <View style={styles.voiceCopy}>
                                    <Text style={styles.voiceName} numberOfLines={1}>{voice.label}</Text>
                                    <Text style={styles.voiceMeta} numberOfLines={1}>{voice.tone}</Text>
                                </View>
                                {selected ? <Check size={18} color="#818CF8" strokeWidth={2.6} /> : null}
                            </TouchableOpacity>
                        );
                    })}
                    <Text style={styles.voiceHint}>{t('voiceMode.voiceHint')}</Text>
                </ScrollView>
            </Animated.View>
        </View>
    );
}

const p = StyleSheet.create({
    base: {
        width: PREVIEW,
        height: PREVIEW,
        borderRadius: PREVIEW / 2,
        alignItems: 'center',
        justifyContent: 'center',
    },
    round: {
        overflow: 'hidden',
    },
    particles: {
        borderWidth: 2.5,
        borderStyle: 'dotted',
        borderColor: '#7DD3FC',
    },
    ring: {
        borderWidth: 6,
        borderColor: '#EC4899',
        shadowColor: '#D946EF',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.9,
        shadowRadius: 10,
    },
    glass: {
        borderWidth: 1,
        borderColor: 'rgba(233,213,255,0.5)',
    },
    glassSwirl: {
        position: 'absolute',
        width: PREVIEW * 0.72,
        height: PREVIEW * 0.72,
        borderRadius: PREVIEW * 0.36,
        borderWidth: 3,
        borderColor: 'rgba(216,180,254,0.75)',
        borderLeftColor: 'transparent',
        transform: [{ rotate: '35deg' }],
    },
    glassSheen: {
        position: 'absolute',
        top: PREVIEW * 0.12,
        left: PREVIEW * 0.18,
        width: PREVIEW * 0.22,
        height: PREVIEW * 0.10,
        borderRadius: PREVIEW * 0.06,
        backgroundColor: 'rgba(255,255,255,0.65)',
        transform: [{ rotate: '-25deg' }],
    },
    blobBody: {
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.6)',
    },
    blobEyes: {
        flexDirection: 'row',
        gap: PREVIEW * 0.18,
        marginTop: -PREVIEW * 0.06,
    },
    blobEye: {
        width: PREVIEW * 0.09,
        height: PREVIEW * 0.14,
        borderRadius: PREVIEW * 0.05,
        backgroundColor: '#1E2A78',
    },
    petals: {
        position: 'relative',
    },
    petalDot: {
        position: 'absolute',
        width: PREVIEW * 0.24,
        height: PREVIEW * 0.16,
        borderRadius: PREVIEW * 0.08,
    },
    robot: {
        backgroundColor: '#F3F4F6',
    },
    visor: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        width: PREVIEW * 0.58,
        height: PREVIEW * 0.30,
        borderRadius: PREVIEW * 0.15,
        backgroundColor: '#0B0B10',
        borderWidth: 2,
        borderColor: '#EC4899',
    },
    eye: {
        width: 6,
        height: 6,
        borderRadius: 3,
        backgroundColor: '#FFFFFF',
    },
});

const styles = StyleSheet.create({
    backdrop: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0,0,0,0.55)',
    },
    sheet: {
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: '#0D0D14',
        borderTopLeftRadius: 28,
        borderTopRightRadius: 28,
        borderCurve: 'continuous',
        paddingHorizontal: 20,
        paddingTop: 10,
        maxHeight: '82%',
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: 'rgba(255,255,255,0.12)',
    },
    handle: {
        alignSelf: 'center',
        width: 40,
        height: 4,
        borderRadius: 2,
        backgroundColor: 'rgba(255,255,255,0.22)',
        marginBottom: 12,
    },
    headerRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 6,
    },
    title: {
        color: '#F3F4F6',
        fontSize: 18,
        fontWeight: '700',
    },
    doneBtn: {
        paddingVertical: 6,
        paddingHorizontal: 4,
    },
    doneText: {
        color: '#818CF8',
        fontSize: 15,
        fontWeight: '700',
    },
    scrollBody: {
        paddingBottom: 16,
    },
    sectionLabel: {
        color: '#9CA3AF',
        fontSize: 13,
        fontWeight: '600',
        marginTop: 14,
        marginBottom: 10,
    },
    groupLabel: {
        color: '#6B7280',
        fontSize: 11.5,
        fontWeight: '700',
        textTransform: 'uppercase',
        letterSpacing: 0.6,
        marginTop: 14,
        marginBottom: 4,
    },
    designGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 10,
    },
    designCard: {
        width: '31%',
        flexGrow: 1,
        alignItems: 'center',
        gap: 10,
        paddingVertical: 14,
        borderRadius: 18,
        borderCurve: 'continuous',
        backgroundColor: 'rgba(255,255,255,0.05)',
        borderWidth: 1.5,
        borderColor: 'transparent',
    },
    designCardSelected: {
        borderColor: '#818CF8',
        backgroundColor: 'rgba(99,102,241,0.12)',
    },
    designName: {
        color: '#9CA3AF',
        fontSize: 12,
        fontWeight: '600',
        paddingHorizontal: 4,
    },
    designNameSelected: {
        color: '#C7D2FE',
    },
    voiceRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: 12,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: 'rgba(255,255,255,0.07)',
        gap: 12,
    },
    voiceCopy: {
        flex: 1,
    },
    voiceName: {
        color: '#E5E7EB',
        fontSize: 15,
        fontWeight: '500',
    },
    voiceMeta: {
        color: '#6B7280',
        fontSize: 12,
        marginTop: 1,
    },
    voiceHint: {
        color: '#6B7280',
        fontSize: 12,
        lineHeight: 17,
        marginTop: 14,
    },
});
