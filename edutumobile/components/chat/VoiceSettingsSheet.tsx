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
import { haptics } from '../../lib/haptics';
import { useAuth } from '@clerk/clerk-expo';
import { useTranslation } from 'react-i18next';
import { Check, Lock } from 'lucide-react-native';
import Animated, { FadeIn, FadeOut, SlideInDown, SlideOutDown } from 'react-native-reanimated';
import { OrbPreview } from '../ui/OrbPreview';
import { speak as edutuSpeak, isPremiumVoiceEnabled } from '../../lib/edutuSpeech';
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


export function VoiceSettingsSheet({ visible, onClose }: VoiceSettingsSheetProps) {
    const { t } = useTranslation('chat');
    const insets = useSafeAreaInsets();
    const settings = useVoiceSettings();
    const { getToken } = useAuth();
    // Premium neural voices are Pro-only (the overlay sets this flag from the
    // user's entitlements before the sheet can open).
    const premiumUnlocked = isPremiumVoiceEnabled();

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
        haptics.selection();
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
                                        haptics.selection();
                                    }}
                                    activeOpacity={0.8}
                                    style={[styles.designCard, selected && styles.designCardSelected]}
                                    accessibilityRole="button"
                                    accessibilityState={{ selected }}
                                    accessibilityLabel={designLabels[design]}
                                >
                                    <OrbPreview design={design} size={76} />
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
                                style={[styles.voiceRow, !premiumUnlocked && styles.voiceRowLocked]}
                                accessibilityRole="button"
                                accessibilityState={{ selected }}
                            >
                                <View style={styles.voiceCopy}>
                                    <Text style={styles.voiceName} numberOfLines={1}>{voice.label}</Text>
                                    <Text style={styles.voiceMeta} numberOfLines={1}>{voice.tone}</Text>
                                </View>
                                {!premiumUnlocked ? (
                                    <View style={styles.proPill}>
                                        <Lock size={10} color="#FBBF24" strokeWidth={2.6} />
                                        <Text style={styles.proPillText}>PRO</Text>
                                    </View>
                                ) : null}
                                {selected ? <Check size={18} color="#818CF8" strokeWidth={2.6} /> : null}
                            </TouchableOpacity>
                        );
                    })}
                    <Text style={styles.voiceHint}>
                        {premiumUnlocked
                            ? t('voiceMode.voiceHint')
                            : t('voiceMode.voiceProHint', { defaultValue: 'Premium voices are an Edutu Pro perk — upgrade to hear Edutu in these natural neural voices. Free plan uses your device voice.' })}
                    </Text>
                </ScrollView>
            </Animated.View>
        </View>
    );
}


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
    voiceRowLocked: {
        opacity: 0.75,
    },
    proPill: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 3,
        backgroundColor: 'rgba(251,191,36,0.14)',
        borderColor: 'rgba(251,191,36,0.4)',
        borderWidth: StyleSheet.hairlineWidth,
        borderRadius: 999,
        paddingHorizontal: 7,
        paddingVertical: 3,
        marginRight: 8,
    },
    proPillText: {
        color: '#FBBF24',
        fontSize: 9,
        fontWeight: '800',
        letterSpacing: 0.6,
    },
    voiceHint: {
        color: '#6B7280',
        fontSize: 12,
        lineHeight: 17,
        marginTop: 14,
    },
});
