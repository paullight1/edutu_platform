import React, { useState } from 'react';
import { View, Text, StyleSheet, Image, Modal, Dimensions, ActivityIndicator, TouchableOpacity } from 'react-native';
import { WebView } from 'react-native-webview';
import { Play, X } from 'lucide-react-native';
import { AnimatedPressable } from './AnimatedPressable';
import { useTheme } from '../context/ThemeContext';

const { width: screenWidth } = Dimensions.get('window');

interface VideoCardProps {
    videoId: string;
    title: string;
    subtitle?: string;
    thumbnailUrl?: string;
}

export default function VideoCard({ videoId, title, subtitle, thumbnailUrl }: VideoCardProps) {
    const { colors } = useTheme();
    const [isExpanded, setIsExpanded] = useState(false);

    const thumbnail = thumbnailUrl || `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;
    const embedUrl = `https://www.youtube.com/embed/${videoId}?autoplay=1&rel=0`;

    return (
        <>
            <AnimatedPressable
                style={styles.card}
                onPress={() => setIsExpanded(true)}
            >
                <View style={styles.thumbnailContainer}>
                    <Image
                        source={{ uri: thumbnail }}
                        style={styles.thumbnail}
                        resizeMode="cover"
                    />
                    <View style={[styles.playButton, { backgroundColor: colors.accent }]}>
                        <Play color="#ffffff" size={24} fill="#ffffff" />
                    </View>
                </View>
                <View style={styles.content}>
                    <Text style={[styles.title, { color: colors.foreground }]} numberOfLines={2}>
                        {title}
                    </Text>
                    {subtitle && (
                        <Text style={[styles.subtitle, { color: colors.textSecondary }]} numberOfLines={1}>
                            {subtitle}
                        </Text>
                    )}
                </View>
            </AnimatedPressable>

            <Modal
                visible={isExpanded}
                animationType="fade"
                transparent={true}
                onRequestClose={() => setIsExpanded(false)}
            >
                <View style={styles.modalOverlay}>
                    <View style={[styles.modalContent, { backgroundColor: colors.background }]}>
                        <View style={styles.modalHeader}>
                            <Text style={[styles.modalTitle, { color: colors.foreground }]} numberOfLines={1}>
                                {title}
                            </Text>
                            <TouchableOpacity
                                style={[styles.closeButton, { backgroundColor: colors.card }]}
                                onPress={() => setIsExpanded(false)}
                                activeOpacity={0.7}
                            >
                                <X color={colors.foreground} size={20} />
                            </TouchableOpacity>
                        </View>
                        <View style={styles.webviewWrapper}>
                            <WebView
                                source={{ uri: embedUrl }}
                                style={styles.webview}
                                allowsFullscreenVideo
                                mediaPlaybackRequiresUserAction={false}
                                startInLoadingState
                                renderLoading={() => (
                                    <View style={[styles.loadingContainer, { backgroundColor: colors.card }]}>
                                        <ActivityIndicator size="large" color={colors.accent} />
                                    </View>
                                )}
                            />
                        </View>
                    </View>
                </View>
            </Modal>
        </>
    );
}

const styles = StyleSheet.create({
    card: {
        borderRadius: 16,
        overflow: 'hidden',
        marginBottom: 16,
    },
    thumbnailContainer: {
        position: 'relative',
        width: '100%',
        aspectRatio: 16 / 9,
    },
    thumbnail: {
        width: '100%',
        height: '100%',
    },
    playButton: {
        position: 'absolute',
        top: '50%',
        left: '50%',
        transform: [{ translateX: -28 }, { translateY: -28 }],
        width: 56,
        height: 56,
        borderRadius: 28,
        justifyContent: 'center',
        alignItems: 'center',
    },
    content: {
        padding: 12,
    },
    title: {
        fontSize: 16,
        fontWeight: '700',
        marginBottom: 4,
    },
    subtitle: {
        fontSize: 14,
    },
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.85)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    modalContent: {
        width: screenWidth * 0.95,
        borderRadius: 20,
        overflow: 'hidden',
    },
    modalHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: 16,
    },
    modalTitle: {
        fontSize: 16,
        fontWeight: '700',
        flex: 1,
        marginRight: 12,
    },
    closeButton: {
        width: 36,
        height: 36,
        borderRadius: 18,
        justifyContent: 'center',
        alignItems: 'center',
    },
    webviewWrapper: {
        width: '100%',
        aspectRatio: 16 / 9,
    },
    webview: {
        flex: 1,
    },
    loadingContainer: {
        ...StyleSheet.absoluteFillObject,
        justifyContent: 'center',
        alignItems: 'center',
    },
});
