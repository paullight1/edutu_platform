import React, { useCallback, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    FlatList,
    Pressable,
    RefreshControl,
    StyleSheet,
    Text,
    TextInput,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { useAuth, useUser } from '@clerk/clerk-expo';
import { useTranslation } from 'react-i18next';
import { CheckCircle2, Clock, MessageCircleQuestion, Plus, Send, XCircle } from 'lucide-react-native';
import {
    fetchMySubmissions,
    respondToSubmission,
    type OpportunitySubmission,
    type OpportunitySubmissionStatus,
} from '@edutu/core/src/services/opportunitySubmissions';
import { useTheme } from '../../../components/context/ThemeContext';
import { ScreenHeader } from '../../../components/ui/ScreenHeader';

const STATUS_STYLE: Record<
    OpportunitySubmissionStatus,
    { color: string; icon: typeof Clock; key: string }
> = {
    pending: { color: '#F59E0B', icon: Clock, key: 'pending' },
    needs_info: { color: '#6366F1', icon: MessageCircleQuestion, key: 'needsInfo' },
    approved: { color: '#10B981', icon: CheckCircle2, key: 'approved' },
    rejected: { color: '#EF4444', icon: XCircle, key: 'rejected' },
};

export default function MySubmissionsScreen() {
    const { t } = useTranslation('opps');
    const router = useRouter();
    const { user } = useUser();
    const { getToken } = useAuth();
    const { colors, isDark } = useTheme();

    const textSecondary = isDark ? '#94A3B8' : '#64748B';
    const borderColor = isDark ? 'rgba(255,255,255,0.08)' : '#E2E8F0';
    const inputBg = isDark ? 'rgba(255,255,255,0.06)' : '#F8FAFC';

    const [items, setItems] = useState<OpportunitySubmission[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [replyFor, setReplyFor] = useState<string | null>(null);
    const [replyText, setReplyText] = useState('');
    const [sending, setSending] = useState(false);

    const load = useCallback(async () => {
        if (!user) { setItems([]); setLoading(false); return; }
        try {
            const rows = await fetchMySubmissions(getToken);
            setItems(rows);
        } catch {
            /* keep whatever we have; pull-to-refresh to retry */
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [user, getToken]);

    useFocusEffect(useCallback(() => { load(); }, [load]));

    const onRefresh = () => { setRefreshing(true); load(); };

    const sendReply = async (id: string) => {
        if (replyText.trim().length < 1) return;
        setSending(true);
        try {
            await respondToSubmission(id, replyText.trim(), getToken);
            setReplyFor(null);
            setReplyText('');
            await load();
            Alert.alert(t('submissions.replySentTitle'), t('submissions.replySentMessage'));
        } catch (err: any) {
            Alert.alert(t('submissions.replyFailedTitle'), err?.message || t('submissions.replyFailedMessage'));
        } finally {
            setSending(false);
        }
    };

    const renderItem = ({ item }: { item: OpportunitySubmission }) => {
        const meta = STATUS_STYLE[item.status];
        const StatusIcon = meta.icon;
        const isReplying = replyFor === item.id;
        const lastAdminNote =
            item.admin_note ||
            (item.thread || []).filter((e) => e.role === 'admin').slice(-1)[0]?.message;

        return (
            <View style={[styles.card, { backgroundColor: colors.card, borderColor }]}>
                <View style={styles.cardHeader}>
                    <Text style={[styles.cardTitle, { color: colors.foreground }]} numberOfLines={2}>
                        {item.title}
                    </Text>
                    <View style={[styles.statusPill, { backgroundColor: meta.color + '1A' }]}>
                        <StatusIcon size={13} color={meta.color} />
                        <Text style={[styles.statusText, { color: meta.color }]}>
                            {t(`submissions.status.${meta.key}`)}
                        </Text>
                    </View>
                </View>

                {item.organization ? (
                    <Text style={[styles.cardOrg, { color: textSecondary }]}>{item.organization}</Text>
                ) : null}

                {/* Admin's message (query reason / rejection reason) */}
                {lastAdminNote ? (
                    <View style={[styles.noteBox, { backgroundColor: inputBg, borderColor }]}>
                        <Text style={[styles.noteLabel, { color: meta.color }]}>
                            {item.status === 'rejected'
                                ? t('submissions.rejectionReason')
                                : t('submissions.teamMessage')}
                        </Text>
                        <Text style={[styles.noteText, { color: colors.foreground }]}>{lastAdminNote}</Text>
                    </View>
                ) : null}

                {item.status === 'approved' ? (
                    <Text style={[styles.approvedNote, { color: textSecondary }]}>
                        {t('submissions.approvedNote')}
                    </Text>
                ) : null}

                {/* Respond CTA for needs_info */}
                {item.status === 'needs_info' && !isReplying ? (
                    <Pressable
                        style={[styles.respondBtn, { borderColor: meta.color }]}
                        onPress={() => { setReplyFor(item.id); setReplyText(''); }}
                    >
                        <MessageCircleQuestion size={15} color={meta.color} />
                        <Text style={[styles.respondText, { color: meta.color }]}>
                            {t('submissions.addInfo')}
                        </Text>
                    </Pressable>
                ) : null}

                {isReplying ? (
                    <View style={{ marginTop: 12 }}>
                        <TextInput
                            style={[styles.replyInput, { backgroundColor: inputBg, color: colors.foreground, borderColor }]}
                            value={replyText}
                            onChangeText={setReplyText}
                            placeholder={t('submissions.replyPlaceholder')}
                            placeholderTextColor={textSecondary}
                            multiline
                            autoFocus
                        />
                        <View style={styles.replyActions}>
                            <Pressable onPress={() => { setReplyFor(null); setReplyText(''); }} style={styles.cancelBtn}>
                                <Text style={[styles.cancelText, { color: textSecondary }]}>{t('submissions.cancel')}</Text>
                            </Pressable>
                            <Pressable
                                style={[styles.sendBtn, { backgroundColor: colors.accent }, (sending || !replyText.trim()) && { opacity: 0.6 }]}
                                onPress={() => sendReply(item.id)}
                                disabled={sending || !replyText.trim()}
                            >
                                {sending ? <ActivityIndicator size="small" color="#fff" /> : <Send size={14} color="#fff" />}
                                <Text style={styles.sendText}>{t('submissions.send')}</Text>
                            </Pressable>
                        </View>
                    </View>
                ) : null}
            </View>
        );
    };

    return (
        <SafeAreaView style={[styles.screen, { backgroundColor: colors.background }]} edges={['top', 'left', 'right']}>
            <ScreenHeader
                title={t('submissions.title')}
                subtitle={t('submissions.subtitle')}
                showBack
                right={
                    <Pressable onPress={() => router.push('/opportunities/submit')} hitSlop={10}>
                        <Plus size={22} color={colors.accent} />
                    </Pressable>
                }
            />
            {loading ? (
                <View style={styles.center}>
                    <ActivityIndicator color={colors.accent} />
                </View>
            ) : (
                <FlatList
                    data={items}
                    keyExtractor={(item) => item.id}
                    renderItem={renderItem}
                    contentContainerStyle={{ padding: 16, paddingBottom: 60, flexGrow: 1 }}
                    refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
                    ListEmptyComponent={
                        <View style={styles.empty}>
                            <MessageCircleQuestion size={34} color={textSecondary} />
                            <Text style={[styles.emptyTitle, { color: colors.foreground }]}>{t('submissions.emptyTitle')}</Text>
                            <Text style={[styles.emptyText, { color: textSecondary }]}>{t('submissions.emptyMessage')}</Text>
                            <Pressable style={[styles.emptyCta, { backgroundColor: colors.accent }]} onPress={() => router.push('/opportunities/submit')}>
                                <Plus size={16} color="#fff" />
                                <Text style={styles.emptyCtaText}>{t('submissions.submitCta')}</Text>
                            </Pressable>
                        </View>
                    }
                />
            )}
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    screen: { flex: 1 },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    card: { borderWidth: 1, borderRadius: 16, padding: 14, marginBottom: 12 },
    cardHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 },
    cardTitle: { flex: 1, fontSize: 15, fontWeight: '800', lineHeight: 20 },
    statusPill: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 4 },
    statusText: { fontSize: 11, fontWeight: '800' },
    cardOrg: { fontSize: 12.5, marginTop: 4, fontWeight: '600' },
    noteBox: { borderWidth: 1, borderRadius: 12, padding: 11, marginTop: 12 },
    noteLabel: { fontSize: 11, fontWeight: '800', marginBottom: 3 },
    noteText: { fontSize: 13.5, lineHeight: 19 },
    approvedNote: { fontSize: 12.5, marginTop: 10, lineHeight: 18 },
    respondBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, borderWidth: 1, borderRadius: 12, paddingVertical: 11, marginTop: 12 },
    respondText: { fontSize: 13.5, fontWeight: '800' },
    replyInput: { borderWidth: 1, borderRadius: 12, padding: 11, minHeight: 72, textAlignVertical: 'top', fontSize: 14 },
    replyActions: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 10, marginTop: 10 },
    cancelBtn: { paddingHorizontal: 14, paddingVertical: 10 },
    cancelText: { fontSize: 13, fontWeight: '700' },
    sendBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12 },
    sendText: { color: '#fff', fontSize: 13.5, fontWeight: '800' },
    empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, gap: 10 },
    emptyTitle: { fontSize: 17, fontWeight: '800', marginTop: 4 },
    emptyText: { fontSize: 13.5, textAlign: 'center', lineHeight: 20 },
    emptyCta: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 20, paddingVertical: 12, borderRadius: 14, marginTop: 8 },
    emptyCtaText: { color: '#fff', fontSize: 14, fontWeight: '800' },
});
