import React, { useCallback, useEffect, useState } from 'react';
import {
    View,
    Text,
    ScrollView,
    TouchableOpacity,
    StyleSheet,
    TextInput,
    Alert,
    ActivityIndicator,
    RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useUser, useAuth } from '@clerk/clerk-expo';
import { useTranslation } from 'react-i18next';
import {
    Lock,
    Smartphone,
    Monitor,
    Check,
    LogOut,
    MapPin,
} from 'lucide-react-native';
import type { SessionWithActivitiesResource } from '@clerk/shared/types';
import { ScreenHeader } from '../../../components/ui/ScreenHeader';
import { Card } from '../../../components/ui/Card';
import { useTheme } from '../../../components/context/ThemeContext';
import { useToast } from '../../../components/context/ToastContext';
import { notificationService } from '../../../lib/notifications';

/** "2 hours ago"-style relative label, falling back to a plain date. */
function useRelativeTime() {
    const { t } = useTranslation('settings');
    return useCallback(
        (date: Date | null | undefined) => {
            if (!date) return '';
            const diffMs = Date.now() - date.getTime();
            const mins = Math.round(diffMs / 60_000);
            if (mins < 1) return t('security.sessions.now');
            if (mins < 60) return t('security.sessions.minutesAgo', { count: mins });
            const hours = Math.round(mins / 60);
            if (hours < 24) return t('security.sessions.hoursAgo', { count: hours });
            const days = Math.round(hours / 24);
            if (days <= 30) return t('security.sessions.daysAgo', { count: days });
            return date.toLocaleDateString();
        },
        [t],
    );
}

function describeDevice(session: SessionWithActivitiesResource): string {
    const activity = session.latestActivity;
    if (!activity) return '';
    const device = activity.deviceType || (activity.isMobile ? 'Mobile' : 'Desktop');
    const browser = activity.browserName;
    return browser ? `${device} · ${browser}` : device;
}

function describeLocation(session: SessionWithActivitiesResource): string {
    const activity = session.latestActivity;
    if (!activity) return '';
    return [activity.city, activity.country].filter(Boolean).join(', ');
}

export default function SecurityScreen() {
    const { t } = useTranslation('settings');
    const { colors, isDark } = useTheme();
    const { user } = useUser();
    const { sessionId } = useAuth();
    const { show: showToast } = useToast();
    const relativeTime = useRelativeTime();

    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [signOutOthers, setSignOutOthers] = useState(false);
    const [saving, setSaving] = useState(false);

    const [sessions, setSessions] = useState<SessionWithActivitiesResource[] | null>(null);
    const [sessionsError, setSessionsError] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const [revokingId, setRevokingId] = useState<string | null>(null);

    const textPrimary = colors.foreground;
    const textSecondary = isDark ? '#94A3B8' : '#64748B';
    const sectionText = isDark ? '#64748B' : '#94A3B8';
    const cardBg = colors.card;
    const borderColor = colors.border;

    const hasPassword = Boolean(user?.passwordEnabled);

    const loadSessions = useCallback(async () => {
        if (!user) return;
        try {
            const result = await user.getSessions();
            // Revoked/ended sessions aren't devices the user can act on.
            setSessions(result.filter((session) => session.status === 'active'));
            setSessionsError(false);
        } catch {
            setSessionsError(true);
        }
    }, [user]);

    useEffect(() => {
        loadSessions();
    }, [loadSessions]);

    const onRefresh = useCallback(async () => {
        setRefreshing(true);
        await loadSessions();
        setRefreshing(false);
    }, [loadSessions]);

    const handleSavePassword = useCallback(async () => {
        if (!user || saving) return;

        if (newPassword.length < 8) {
            Alert.alert(t('security.passwordTooShortTitle'), t('security.passwordTooShortMessage'));
            return;
        }
        if (newPassword !== confirmPassword) {
            Alert.alert(t('security.passwordMismatchTitle'), t('security.passwordMismatchMessage'));
            return;
        }
        if (hasPassword && !currentPassword) {
            Alert.alert(t('security.currentRequiredTitle'), t('security.currentRequiredMessage'));
            return;
        }

        setSaving(true);
        try {
            await user.updatePassword({
                newPassword,
                // Clerk only accepts (and requires) the current password when
                // one is already set; sending it during first-time setup fails.
                ...(hasPassword ? { currentPassword } : {}),
                signOutOfOtherSessions: signOutOthers,
            });
            setCurrentPassword('');
            setNewPassword('');
            setConfirmPassword('');
            await notificationService.triggerHaptic('success');
            showToast({
                emoji: '🔒',
                variant: 'success',
                message: hasPassword ? t('security.passwordChanged') : t('security.passwordAddedTitle'),
            });
            await loadSessions();
        } catch (error: any) {
            Alert.alert(
                t('security.passwordErrorTitle'),
                error?.errors?.[0]?.longMessage || error?.errors?.[0]?.message || t('security.passwordErrorMessage'),
            );
        } finally {
            setSaving(false);
        }
    }, [
        confirmPassword,
        currentPassword,
        hasPassword,
        loadSessions,
        newPassword,
        saving,
        showToast,
        signOutOthers,
        t,
        user,
    ]);

    const handleRevoke = useCallback(
        (session: SessionWithActivitiesResource) => {
            Alert.alert(
                t('security.sessions.revokeTitle'),
                t('security.sessions.revokeMessage', { device: describeDevice(session) }),
                [
                    { text: t('common:actions.cancel'), style: 'cancel' },
                    {
                        text: t('security.sessions.revoke'),
                        style: 'destructive',
                        onPress: async () => {
                            setRevokingId(session.id);
                            try {
                                await session.revoke();
                                await loadSessions();
                                showToast({
                                    emoji: '✅',
                                    variant: 'success',
                                    message: t('security.sessions.revoked'),
                                });
                            } catch {
                                showToast({
                                    emoji: '⚠️',
                                    variant: 'error',
                                    message: t('security.sessions.revokeFailed'),
                                });
                            } finally {
                                setRevokingId(null);
                            }
                        },
                    },
                ],
            );
        },
        [loadSessions, showToast, t],
    );

    const sessionList = sessions ?? [];
    const otherSessions = sessionList.filter((session) => session.id !== sessionId);

    const handleRevokeAll = useCallback(() => {
        Alert.alert(
            t('security.sessions.revokeAllTitle'),
            t('security.sessions.revokeAllMessage', { count: otherSessions.length }),
            [
                { text: t('common:actions.cancel'), style: 'cancel' },
                {
                    text: t('security.sessions.revokeAll'),
                    style: 'destructive',
                    onPress: async () => {
                        setRevokingId('all');
                        try {
                            await Promise.all(otherSessions.map((session) => session.revoke()));
                            await loadSessions();
                            showToast({
                                emoji: '✅',
                                variant: 'success',
                                message: t('security.sessions.revokedAll'),
                            });
                        } catch {
                            showToast({
                                emoji: '⚠️',
                                variant: 'error',
                                message: t('security.sessions.revokeFailed'),
                            });
                        } finally {
                            setRevokingId(null);
                        }
                    },
                },
            ],
        );
    }, [loadSessions, otherSessions, showToast, t]);

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top', 'left', 'right']}>
            <ScreenHeader title={t('security.passwordKeys')} showBack />

            <ScrollView
                style={styles.scrollView}
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                refreshControl={
                    <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />
                }
            >
                {/* Password */}
                <Text style={[styles.sectionTitle, { color: sectionText }]}>
                    {hasPassword ? t('security.changePassword') : t('security.addEmailPassword')}
                </Text>
                <Card variant="solid" style={[styles.card, { backgroundColor: cardBg, borderColor }]}>
                    <Text style={[styles.cardDesc, { color: textSecondary }]}>
                        {hasPassword ? t('security.changePasswordDesc') : t('security.addEmailPasswordDesc')}
                    </Text>

                    {hasPassword ? (
                        <TextInput
                            value={currentPassword}
                            onChangeText={setCurrentPassword}
                            secureTextEntry
                            autoCapitalize="none"
                            placeholder={t('security.currentPassword')}
                            placeholderTextColor={textSecondary}
                            style={[styles.input, { color: textPrimary, borderColor, backgroundColor: colors.background }]}
                        />
                    ) : null}
                    <TextInput
                        value={newPassword}
                        onChangeText={setNewPassword}
                        secureTextEntry
                        autoCapitalize="none"
                        placeholder={t('security.newPassword')}
                        placeholderTextColor={textSecondary}
                        style={[styles.input, { color: textPrimary, borderColor, backgroundColor: colors.background }]}
                    />
                    <TextInput
                        value={confirmPassword}
                        onChangeText={setConfirmPassword}
                        secureTextEntry
                        autoCapitalize="none"
                        placeholder={t('security.confirmPassword')}
                        placeholderTextColor={textSecondary}
                        style={[styles.input, { color: textPrimary, borderColor, backgroundColor: colors.background }]}
                    />

                    <TouchableOpacity
                        style={styles.checkRow}
                        activeOpacity={0.7}
                        onPress={() => setSignOutOthers((prev) => !prev)}
                        accessibilityRole="checkbox"
                        accessibilityState={{ checked: signOutOthers }}
                    >
                        <View
                            style={[
                                styles.checkbox,
                                { borderColor: signOutOthers ? colors.accent : borderColor },
                                signOutOthers && { backgroundColor: colors.accent },
                            ]}
                        >
                            {signOutOthers ? <Check size={13} color="#fff" strokeWidth={3} /> : null}
                        </View>
                        <Text style={[styles.checkLabel, { color: textSecondary }]}>
                            {t('security.signOutOtherDevices')}
                        </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                        onPress={handleSavePassword}
                        disabled={saving}
                        style={[styles.button, { backgroundColor: colors.accent }, saving && styles.buttonDisabled]}
                    >
                        {saving ? (
                            <ActivityIndicator size="small" color="#fff" />
                        ) : (
                            <Text style={styles.buttonText}>
                                {hasPassword ? t('security.updatePassword') : t('security.addPassword')}
                            </Text>
                        )}
                    </TouchableOpacity>
                </Card>

                {/* Connected accounts */}
                {user?.externalAccounts?.length ? (
                    <>
                        <Text style={[styles.sectionTitle, { color: sectionText }]}>
                            {t('security.connectedAccounts')}
                        </Text>
                        <Card variant="solid" style={[styles.card, { backgroundColor: cardBg, borderColor }]}>
                            {user.externalAccounts.map((account, index) => (
                                <View
                                    key={account.id}
                                    style={[
                                        styles.row,
                                        index < user.externalAccounts.length - 1 && [
                                            styles.rowBorder,
                                            { borderBottomColor: borderColor },
                                        ],
                                    ]}
                                >
                                    <View style={[styles.iconWrap, { backgroundColor: `${colors.accent}18` }]}>
                                        <Lock size={18} color={colors.accent} />
                                    </View>
                                    <View style={styles.rowText}>
                                        <Text style={[styles.rowTitle, { color: textPrimary }]}>
                                            {String(account.provider).replace(/^oauth_/, '').replace(/^\w/, (c) => c.toUpperCase())}
                                        </Text>
                                        <Text style={[styles.rowSub, { color: textSecondary }]} numberOfLines={1}>
                                            {account.emailAddress || t('security.connected')}
                                        </Text>
                                    </View>
                                </View>
                            ))}
                        </Card>
                    </>
                ) : null}

                {/* Active devices */}
                <View style={styles.sessionsHeader}>
                    <Text style={[styles.sectionTitle, { color: sectionText, marginBottom: 0 }]}>
                        {t('security.sessions.title')}
                    </Text>
                    {otherSessions.length > 0 ? (
                        <TouchableOpacity onPress={handleRevokeAll} disabled={revokingId === 'all'}>
                            <Text style={[styles.revokeAll, { color: '#ef4444' }]}>
                                {t('security.sessions.revokeAll')}
                            </Text>
                        </TouchableOpacity>
                    ) : null}
                </View>

                <Card variant="solid" style={[styles.card, { backgroundColor: cardBg, borderColor }]}>
                    {sessions === null && !sessionsError ? (
                        <View style={styles.sessionsLoading}>
                            <ActivityIndicator size="small" color={colors.accent} />
                        </View>
                    ) : sessionsError ? (
                        <Text style={[styles.cardDesc, { color: textSecondary, marginBottom: 0 }]}>
                            {t('security.sessions.loadFailed')}
                        </Text>
                    ) : sessionList.length === 0 ? (
                        <Text style={[styles.cardDesc, { color: textSecondary, marginBottom: 0 }]}>
                            {t('security.sessions.empty')}
                        </Text>
                    ) : (
                        sessionList.map((session, index) => {
                            const isCurrent = session.id === sessionId;
                            const location = describeLocation(session);
                            const mobile = session.latestActivity?.isMobile;
                            return (
                                <View
                                    key={session.id}
                                    style={[
                                        styles.row,
                                        index < sessionList.length - 1 && [styles.rowBorder, { borderBottomColor: borderColor }],
                                    ]}
                                >
                                    <View style={[styles.iconWrap, { backgroundColor: `${colors.accent}18` }]}>
                                        {mobile ? (
                                            <Smartphone size={18} color={colors.accent} />
                                        ) : (
                                            <Monitor size={18} color={colors.accent} />
                                        )}
                                    </View>
                                    <View style={styles.rowText}>
                                        <View style={styles.rowTitleLine}>
                                            <Text style={[styles.rowTitle, { color: textPrimary }]} numberOfLines={1}>
                                                {describeDevice(session) || t('security.sessions.unknownDevice')}
                                            </Text>
                                            {isCurrent ? (
                                                <View style={[styles.currentPill, { backgroundColor: `${colors.accent}20` }]}>
                                                    <Text style={[styles.currentPillText, { color: colors.accent }]}>
                                                        {t('security.sessions.thisDevice')}
                                                    </Text>
                                                </View>
                                            ) : null}
                                        </View>
                                        {location ? (
                                            <View style={styles.locationLine}>
                                                <MapPin size={11} color={textSecondary} />
                                                <Text style={[styles.rowSub, { color: textSecondary }]} numberOfLines={1}>
                                                    {location}
                                                </Text>
                                            </View>
                                        ) : null}
                                        <Text style={[styles.rowSub, { color: textSecondary }]}>
                                            {t('security.sessions.lastActive', {
                                                time: relativeTime(session.lastActiveAt),
                                            })}
                                        </Text>
                                    </View>
                                    {!isCurrent ? (
                                        revokingId === session.id ? (
                                            <ActivityIndicator size="small" color={textSecondary} />
                                        ) : (
                                            <TouchableOpacity
                                                onPress={() => handleRevoke(session)}
                                                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                                                accessibilityLabel={t('security.sessions.revoke')}
                                            >
                                                <LogOut size={17} color="#ef4444" />
                                            </TouchableOpacity>
                                        )
                                    ) : null}
                                </View>
                            );
                        })
                    )}
                </Card>

                <Text style={[styles.footnote, { color: textSecondary }]}>{t('security.sessions.hint')}</Text>
            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    scrollView: { flex: 1 },
    scrollContent: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 120 },

    sectionTitle: {
        fontSize: 11, fontWeight: '900', textTransform: 'uppercase',
        letterSpacing: 2, marginLeft: 4, marginBottom: 14, marginTop: 8,
    },
    card: { padding: 16, gap: 10, marginBottom: 12 },
    cardDesc: { fontSize: 12, lineHeight: 18, marginBottom: 4 },

    input: { height: 48, borderRadius: 12, borderWidth: 1, paddingHorizontal: 14, fontSize: 14 },

    checkRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 4 },
    checkbox: {
        width: 20, height: 20, borderRadius: 6, borderWidth: 2,
        alignItems: 'center', justifyContent: 'center',
    },
    checkLabel: { fontSize: 13, flex: 1 },

    button: { height: 46, borderRadius: 999, alignItems: 'center', justifyContent: 'center', marginTop: 2 },
    buttonDisabled: { opacity: 0.55 },
    buttonText: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' },

    sessionsHeader: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 14, marginTop: 8,
    },
    revokeAll: { fontSize: 12, fontWeight: '800' },
    sessionsLoading: { paddingVertical: 12, alignItems: 'center' },

    row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
    rowBorder: { borderBottomWidth: 1 },
    iconWrap: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
    rowText: { flex: 1, gap: 2 },
    rowTitleLine: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    rowTitle: { fontSize: 14, fontWeight: '700', flexShrink: 1 },
    rowSub: { fontSize: 12 },
    locationLine: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    currentPill: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999 },
    currentPillText: { fontSize: 9, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.5 },

    footnote: { fontSize: 11, lineHeight: 16, textAlign: 'center', marginTop: 6, paddingHorizontal: 12 },
});
