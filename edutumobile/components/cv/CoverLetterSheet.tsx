import React, { useEffect, useState } from 'react';
import {
    View,
    Text,
    TouchableOpacity,
    StyleSheet,
    Modal,
    ScrollView,
    ActivityIndicator,
    Platform,
    Share,
} from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useTranslation } from 'react-i18next';
import { X, FileText, Share2 } from 'lucide-react-native';
import { useTheme } from '../context/ThemeContext';
import { haptics } from '../../lib/haptics';
import { CvModalBackdrop } from './CvModalBackdrop';

interface Props {
    visible: boolean;
    onClose: () => void;
    /** The generated letter — empty string while loading. */
    letter: string;
    isLoading: boolean;
    /** Share-sheet title, e.g. "Amara Okafor - Cover Letter - Acme Health". */
    shareTitle?: string;
    opportunityTitle?: string;
}

const MONO_FONT = Platform.select({ ios: 'Menlo', default: 'monospace' });
const PHASE_MS = 2600;

/**
 * Presents the AI cover letter in a blurred sheet with a monospace-ish body
 * and a Share/Copy action (system share sheet — expo-clipboard isn't in the
 * dependency set). While generating, cycles phased loading copy.
 */
export function CoverLetterSheet({
    visible,
    onClose,
    letter,
    isLoading,
    shareTitle,
    opportunityTitle,
}: Props) {
    const { t } = useTranslation('cv');
    const { colors, isDark } = useTheme();
    const muted = isDark ? '#94A3B8' : '#64748B';
    const cardBg = isDark ? '#1E293B' : '#FFFFFF';

    // Phased loading copy: "Reading the opportunity…" → "Writing like a human…"
    const phases = [t('coverLetter.loadingPhase1'), t('coverLetter.loadingPhase2')];
    const [phaseIndex, setPhaseIndex] = useState(0);
    const loadingActive = visible && isLoading;
    // Adjust-during-render reset (not in the effect — avoids cascading renders).
    const [prevLoadingActive, setPrevLoadingActive] = useState(loadingActive);
    if (loadingActive !== prevLoadingActive) {
        setPrevLoadingActive(loadingActive);
        if (loadingActive) setPhaseIndex(0);
    }
    useEffect(() => {
        if (!loadingActive) return undefined;
        const timer = setInterval(
            () => setPhaseIndex((prev) => (prev + 1) % phases.length),
            PHASE_MS,
        );
        return () => clearInterval(timer);
    }, [loadingActive, phases.length]);

    const handleShare = async () => {
        if (!letter) return;
        haptics.light();
        try {
            await Share.share({ message: letter, title: shareTitle });
        } catch {
            // user dismissed the share sheet — nothing to do
        }
    };

    return (
        <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
            <View style={styles.overlay}>
                <CvModalBackdrop onPress={onClose} />
                <Animated.View
                    entering={FadeInDown.springify().damping(18)}
                    style={[styles.card, { backgroundColor: cardBg }]}
                >
                    <View
                        style={[
                            styles.header,
                            { borderBottomColor: isDark ? 'rgba(255,255,255,0.08)' : '#E2E8F0' },
                        ]}
                    >
                        <FileText size={18} color={colors.primary} />
                        <View style={styles.headerText}>
                            <Text style={[styles.title, { color: colors.foreground }]}>
                                {t('coverLetter.title')}
                            </Text>
                            {!!opportunityTitle && (
                                <Text style={[styles.subtitle, { color: muted }]} numberOfLines={1}>
                                    {opportunityTitle}
                                </Text>
                            )}
                        </View>
                        <TouchableOpacity
                            style={[
                                styles.close,
                                { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : '#F1F5F9' },
                            ]}
                            onPress={onClose}
                            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                        >
                            <X size={18} color={muted} />
                        </TouchableOpacity>
                    </View>

                    {isLoading ? (
                        <View style={styles.loading}>
                            <ActivityIndicator size="large" color={colors.primary} />
                            <Text style={[styles.loadingText, { color: muted }]}>
                                {phases[phaseIndex]}
                            </Text>
                        </View>
                    ) : (
                        <>
                            <ScrollView
                                style={styles.body}
                                contentContainerStyle={styles.bodyContent}
                                showsVerticalScrollIndicator={false}
                            >
                                <Text
                                    style={[
                                        styles.letter,
                                        { color: isDark ? '#E2E8F0' : '#1E293B' },
                                    ]}
                                    selectable
                                >
                                    {letter}
                                </Text>
                            </ScrollView>
                            <View
                                style={[
                                    styles.footer,
                                    { borderTopColor: isDark ? 'rgba(255,255,255,0.08)' : '#E2E8F0' },
                                ]}
                            >
                                <TouchableOpacity
                                    style={[styles.copyBtn, { backgroundColor: colors.primary }]}
                                    onPress={handleShare}
                                    activeOpacity={0.85}
                                >
                                    <Share2 size={16} color="#FFFFFF" />
                                    <Text style={styles.copyBtnText}>{t('coverLetter.copy')}</Text>
                                </TouchableOpacity>
                            </View>
                        </>
                    )}
                </Animated.View>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 18,
    },
    card: {
        width: '100%',
        maxWidth: 440,
        maxHeight: '86%',
        borderRadius: 28,
        overflow: 'hidden',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 12 },
        shadowOpacity: 0.28,
        shadowRadius: 24,
        elevation: 14,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        paddingHorizontal: 18,
        paddingVertical: 14,
        borderBottomWidth: 1,
    },
    headerText: {
        flex: 1,
    },
    title: {
        fontSize: 16,
        fontWeight: '800',
    },
    subtitle: {
        fontSize: 12.5,
        marginTop: 1,
    },
    close: {
        width: 30,
        height: 30,
        borderRadius: 15,
        alignItems: 'center',
        justifyContent: 'center',
    },
    loading: {
        paddingVertical: 56,
        paddingHorizontal: 24,
        alignItems: 'center',
        gap: 16,
    },
    loadingText: {
        fontSize: 14,
        fontWeight: '600',
        textAlign: 'center',
    },
    body: {
        flexGrow: 0,
    },
    bodyContent: {
        padding: 18,
    },
    letter: {
        fontFamily: MONO_FONT,
        fontSize: 12.5,
        lineHeight: 20,
    },
    footer: {
        padding: 14,
        borderTopWidth: 1,
    },
    copyBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        paddingVertical: 13,
        borderRadius: 16,
    },
    copyBtnText: {
        color: '#FFFFFF',
        fontSize: 14,
        fontWeight: '800',
    },
});
