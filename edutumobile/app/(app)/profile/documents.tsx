import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    View,
    Text,
    ScrollView,
    TouchableOpacity,
    StyleSheet,
    ActivityIndicator,
    Alert,
    Share,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import {
    Download,
    FileText,
    FolderOpen,
    GraduationCap,
    Paperclip,
    PenLine,
    ChevronRight,
    RefreshCw,
} from 'lucide-react-native';
import { useUser, useAuth } from '@clerk/clerk-expo';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { ScreenHeader } from '../../../components/ui/ScreenHeader';
import { BrandedLoader } from '../../../components/ui/BrandedLoader';
import { useTheme } from '../../../components/context/ThemeContext';
import { supabase } from '../../../lib/supabase';
import { fetchUserCVs } from '@edutu/core/src/services/cv';
import { listUploads, type UploadRecord } from '@edutu/core/src/services/uploads';
import {
    getUploadDownloadUrl,
    displayNameForUpload,
    sanitizeFileName,
} from '@edutu/core/src/services/documents';
import type { UserCV } from '@edutu/core/src/types/cv';

// Icon + tint per upload kind, matching the rest of the app's tinted circles.
const UPLOAD_KIND_META: Record<string, { icon: typeof Paperclip; color: string; bg: string }> = {
    cv: { icon: FileText, color: '#10B981', bg: 'rgba(16,185,129,0.15)' },
    transcript: { icon: GraduationCap, color: '#6366F1', bg: 'rgba(99,102,241,0.15)' },
    essay: { icon: PenLine, color: '#F59E0B', bg: 'rgba(245,158,11,0.15)' },
    other: { icon: Paperclip, color: '#06B6D4', bg: 'rgba(6,182,212,0.15)' },
};

function formatDate(input?: string | null): string {
    if (!input) return '';
    const date = new Date(input);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleDateString(undefined, {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
    });
}

export default function MyDocumentsScreen() {
    const { isDark, colors } = useTheme();
    const { user } = useUser();
    const { getToken } = useAuth();
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const { t } = useTranslation('profile');

    const textSecondary = isDark ? '#94A3B8' : '#64748B';

    const [loading, setLoading] = useState(true);
    const [failed, setFailed] = useState(false);
    const [cvs, setCvs] = useState<UserCV[]>([]);
    const [uploads, setUploads] = useState<UploadRecord[]>([]);
    const [downloadingId, setDownloadingId] = useState<string | null>(null);

    // Bumping refreshKey re-runs the fetch effect (retry button).
    const [refreshKey, setRefreshKey] = useState(0);

    const userId = user?.id;
    useEffect(() => {
        if (!userId) return;
        let cancelled = false;
        (async () => {
            try {
                const [cvRows, uploadRows] = await Promise.all([
                    fetchUserCVs(supabase, userId),
                    listUploads(getToken),
                ]);
                if (cancelled) return;
                setCvs(cvRows);
                setUploads(uploadRows);
                setFailed(false);
            } catch {
                if (!cancelled) setFailed(true);
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [userId, getToken, refreshKey]);

    const retry = useCallback(() => {
        setLoading(true);
        setFailed(false);
        setRefreshKey((key) => key + 1);
    }, []);

    // Professional owner name for exports: prefer what the CV itself says,
    // fall back to the Clerk display name.
    const ownerName = useMemo(() => {
        const fromCv = cvs
            .map((cv) => cv.data_json?.header?.full_name?.trim())
            .find(Boolean);
        return fromCv || user?.fullName || '';
    }, [cvs, user?.fullName]);

    const downloadUpload = useCallback(
        async (upload: UploadRecord) => {
            setDownloadingId(upload.id);
            try {
                const signed = await getUploadDownloadUrl(upload.id, getToken);
                if (!signed?.url) throw new Error('no-url');
                const target = new File(Paths.cache, sanitizeFileName(signed.fileName || upload.fileName));
                if (target.exists) target.delete();
                const file = await File.downloadFileAsync(signed.url, target);
                if (await Sharing.isAvailableAsync()) {
                    await Sharing.shareAsync(file.uri, {
                        mimeType: signed.mimeType || undefined,
                        dialogTitle: displayNameForUpload(upload.fileName),
                    });
                } else {
                    await Share.share({ url: file.uri, message: file.uri });
                }
            } catch {
                Alert.alert(
                    t('documents.downloadFailedTitle'),
                    t('documents.downloadFailedDesc'),
                );
            } finally {
                setDownloadingId(null);
            }
        },
        [getToken, t],
    );

    const isEmpty = !loading && !failed && cvs.length === 0 && uploads.length === 0;

    const uploadStatusLabel = (status: string) => {
        if (status === 'done') return t('documents.status.done');
        if (status === 'failed') return t('documents.status.failed');
        return t('documents.status.pending');
    };

    const renderRow = (opts: {
        key: string;
        icon: typeof FileText;
        color: string;
        bg: string;
        title: string;
        meta: string;
        isLast: boolean;
        busy?: boolean;
        onDownload: () => void;
        onPress?: () => void;
    }) => (
        <TouchableOpacity
            key={opts.key}
            activeOpacity={0.6}
            onPress={opts.onPress ?? opts.onDownload}
            style={[
                styles.row,
                !opts.isLast && { borderBottomWidth: 1, borderBottomColor: colors.border },
            ]}
        >
            <View style={[styles.rowIcon, { backgroundColor: opts.bg }]}>
                <opts.icon size={18} color={opts.color} />
            </View>
            <View style={styles.rowText}>
                <Text style={[styles.rowTitle, { color: colors.foreground }]} numberOfLines={1}>
                    {opts.title}
                </Text>
                <Text style={[styles.rowMeta, { color: textSecondary }]} numberOfLines={1}>
                    {opts.meta}
                </Text>
            </View>
            <TouchableOpacity
                onPress={opts.onDownload}
                disabled={opts.busy}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                style={[styles.downloadBtn, { backgroundColor: isDark ? 'rgba(148,163,184,0.12)' : 'rgba(100,116,139,0.08)' }]}
                accessibilityLabel={t('documents.download')}
            >
                {opts.busy ? (
                    <ActivityIndicator size="small" color={colors.primary} />
                ) : (
                    <Download size={16} color={colors.primary} />
                )}
            </TouchableOpacity>
        </TouchableOpacity>
    );

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top', 'left', 'right']}>
            <ScreenHeader title={t('documents.title')} showBack />
            <ScrollView
                style={styles.scroll}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 40 }]}
            >
                {loading && (
                    <View style={styles.centerBlock}>
                        <BrandedLoader label={t('documents.loading')} />
                    </View>
                )}

                {failed && !loading && (
                    <View style={styles.centerBlock}>
                        <Text style={[styles.emptyTitle, { color: colors.foreground }]}>
                            {t('documents.error.title')}
                        </Text>
                        <TouchableOpacity
                            onPress={retry}
                            activeOpacity={0.7}
                            style={[styles.ctaBtn, { backgroundColor: colors.primary }]}
                        >
                            <RefreshCw size={15} color="#fff" />
                            <Text style={styles.ctaText}>{t('documents.error.retry')}</Text>
                        </TouchableOpacity>
                    </View>
                )}

                {isEmpty && (
                    <View style={styles.centerBlock}>
                        <FolderOpen size={34} color={textSecondary} style={{ opacity: 0.5 }} />
                        <Text style={[styles.emptyTitle, { color: colors.foreground }]}>
                            {t('documents.empty.title')}
                        </Text>
                        <Text style={[styles.emptyDesc, { color: textSecondary }]}>
                            {t('documents.empty.desc')}
                        </Text>
                        <TouchableOpacity
                            onPress={() => router.push('/cv')}
                            activeOpacity={0.7}
                            style={[styles.ctaBtn, { backgroundColor: colors.primary }]}
                        >
                            <FileText size={15} color="#fff" />
                            <Text style={styles.ctaText}>{t('documents.empty.cta')}</Text>
                        </TouchableOpacity>
                    </View>
                )}

                {!loading && !failed && cvs.length > 0 && (
                    <View style={styles.section}>
                        <Text style={[styles.sectionTitle, { color: textSecondary }]}>
                            {t('documents.sections.cvs')}
                        </Text>
                        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
                            {cvs.map((cv, idx) =>
                                renderRow({
                                    key: cv.id,
                                    icon: FileText,
                                    color: '#10B981',
                                    bg: 'rgba(16,185,129,0.15)',
                                    title: cv.name || t('documents.untitledCv'),
                                    meta: [formatDate(cv.updated_at), t('documents.cvHint')]
                                        .filter(Boolean)
                                        .join(' · '),
                                    isLast: idx === cvs.length - 1,
                                    // PDF generation lives in the CV Builder — route there
                                    // instead of duplicating the export pipeline.
                                    onDownload: () => router.push('/cv'),
                                }),
                            )}
                        </View>
                        <View style={styles.hintRow}>
                            <ChevronRight size={12} color={textSecondary} />
                            <Text style={[styles.hintText, { color: textSecondary }]}>
                                {t('documents.cvExportHint', { name: ownerName || t('documents.you') })}
                            </Text>
                        </View>
                    </View>
                )}

                {!loading && !failed && uploads.length > 0 && (
                    <View style={styles.section}>
                        <Text style={[styles.sectionTitle, { color: textSecondary }]}>
                            {t('documents.sections.uploads')}
                        </Text>
                        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
                            {uploads.map((upload, idx) => {
                                const meta = UPLOAD_KIND_META[upload.kind] || UPLOAD_KIND_META.other;
                                return renderRow({
                                    key: upload.id,
                                    icon: meta.icon,
                                    color: meta.color,
                                    bg: meta.bg,
                                    title: displayNameForUpload(upload.fileName),
                                    meta: [formatDate(upload.createdAt), uploadStatusLabel(upload.parseStatus)]
                                        .filter(Boolean)
                                        .join(' · '),
                                    isLast: idx === uploads.length - 1,
                                    busy: downloadingId === upload.id,
                                    onDownload: () => downloadUpload(upload),
                                });
                            })}
                        </View>
                    </View>
                )}
            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    scroll: {
        flex: 1,
    },
    scrollContent: {
        paddingTop: 16,
        paddingHorizontal: 20,
    },
    centerBlock: {
        alignItems: 'center',
        paddingTop: 90,
        paddingHorizontal: 24,
        gap: 12,
    },
    emptyTitle: {
        fontSize: 16,
        fontWeight: '700',
        textAlign: 'center',
        marginTop: 8,
    },
    emptyDesc: {
        fontSize: 13,
        lineHeight: 19,
        textAlign: 'center',
    },
    ctaBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        paddingHorizontal: 18,
        paddingVertical: 12,
        borderRadius: 14,
        marginTop: 8,
    },
    ctaText: {
        color: '#fff',
        fontSize: 14,
        fontWeight: '700',
    },
    section: {
        marginBottom: 24,
    },
    sectionTitle: {
        fontSize: 11,
        fontWeight: '700',
        textTransform: 'uppercase',
        letterSpacing: 1,
        marginBottom: 12,
    },
    card: {
        borderRadius: 16,
        overflow: 'hidden',
        borderWidth: 1,
    },
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 14,
    },
    rowIcon: {
        width: 40,
        height: 40,
        borderRadius: 10,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 12,
    },
    rowText: {
        flex: 1,
        marginRight: 10,
    },
    rowTitle: {
        fontSize: 14,
        fontWeight: '600',
        marginBottom: 2,
    },
    rowMeta: {
        fontSize: 12,
    },
    downloadBtn: {
        width: 34,
        height: 34,
        borderRadius: 10,
        alignItems: 'center',
        justifyContent: 'center',
    },
    hintRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        marginTop: 8,
        paddingHorizontal: 4,
    },
    hintText: {
        fontSize: 11,
        flex: 1,
    },
});
