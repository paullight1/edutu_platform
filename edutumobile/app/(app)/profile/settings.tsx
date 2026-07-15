import React, { useState, useEffect, useCallback } from 'react';
import {
    View,
    Text,
    ScrollView,
    TouchableOpacity,
    Switch,
    StyleSheet,
    Alert,
    TextInput,
    Image,
    Modal,
    Share,
    Platform,
    Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Constants from 'expo-constants';
import * as Haptics from 'expo-haptics';
import {
    Moon,
    Shield,
    ChevronRight,
    Smartphone,
    Mail,
    Sun,
    Lock,
    Vibrate,
    ExternalLink,
    MonitorSmartphone,
    Check,
    MoonStar,
    LogOut,
    Star,
    Share2,
    Sparkles,
    Info,
    Clock,
    Wind,
    X,
} from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Card } from '../../../components/ui/Card';
import { ScreenHeader } from "../../../components/ui/ScreenHeader";
import { LanguageSelector } from "../../../components/ui/LanguageSelector";
import {
    useTheme,
    ThemeMode,
    THEME_ORDER,
    THEME_SWATCHES,
} from "../../../components/context/ThemeContext";
import {
    notificationService,
    NotificationSettings,
    registerForPushNotificationsAsync,
    getStoredPushToken,
    resetPushTokenSync,
} from "../../../lib/notifications";
import {
    getNotificationPreferences,
    saveNotificationPreferences,
    unregisterPushToken,
    isQuietHoursEnabled,
    QUIET_HOURS_OFF,
    type NotificationPreferencesInput,
} from "@edutu/core/src/services/notificationPreferences";
import * as WebBrowser from 'expo-web-browser';
import * as Notifications from 'expo-notifications';
import { useAuth, useUser } from '@clerk/clerk-expo';
import { useRouter } from 'expo-router';
import { supabase } from '../../../lib/supabase';
import { useToast } from '../../../components/context/ToastContext';
import { useNavStyleSettings, setNavBarStyle, type NavBarStyle } from '../../../lib/navStyleStore';

const APPEARANCE_MODES: { id: ThemeMode; labelKey: string; icon: React.ComponentType<{ size: number; color: string }> }[] = [
    { id: 'light', labelKey: 'display.modeLight', icon: Sun },
    { id: 'dark', labelKey: 'display.modeDark', icon: Moon },
    { id: 'system', labelKey: 'display.modeSystem', icon: MonitorSmartphone },
];

const NAV_BAR_STYLE_OPTIONS: { id: NavBarStyle; labelKey: string; descKey: string }[] = [
    { id: 'glass', labelKey: 'display.navBarGlass', descKey: 'display.navBarGlassDesc' },
    { id: 'fab', labelKey: 'display.navBarFab', descKey: 'display.navBarFabDesc' },
    { id: 'tabs', labelKey: 'display.navBarTabs', descKey: 'display.navBarTabsDesc' },
    { id: 'center', labelKey: 'display.navBarCenter', descKey: 'display.navBarCenterDesc' },
];

// A small true-to-life sketch of each nav style, so the choice is visible
// rather than a word. Mirrors the geometry in app/(app)/_layout.tsx.
function NavStylePreview({ id, accent, dim }: { id: NavBarStyle; accent: string; dim: string }) {
    const dot = (key: number) => <View key={key} style={[navPreviewStyles.dot, { backgroundColor: dim }]} />;
    const button = (style?: object) => <View style={[navPreviewStyles.button, { backgroundColor: accent }, style]} />;

    if (id === 'glass') {
        return (
            <View style={navPreviewStyles.frame}>
                <View style={navPreviewStyles.pillRow}>
                    <View style={[navPreviewStyles.pill, { borderColor: dim }]}>
                        {[0, 1, 2, 3].map(dot)}
                    </View>
                    {button(navPreviewStyles.pillButton)}
                </View>
            </View>
        );
    }

    return (
        <View style={navPreviewStyles.frame}>
            {id === 'fab' && button(navPreviewStyles.fabButton)}
            {id === 'center' && button(navPreviewStyles.centerButton)}
            <View style={[navPreviewStyles.bar, { borderTopColor: dim }]}>
                {id === 'center' ? (
                    <>
                        {[0, 1].map(dot)}
                        <View style={navPreviewStyles.centerGap} />
                        {[2, 3].map(dot)}
                    </>
                ) : (
                    <>
                        {[0, 1, 2, 3].map(dot)}
                        {id === 'tabs' && <View style={[navPreviewStyles.dot, { backgroundColor: accent }]} />}
                    </>
                )}
            </View>
        </View>
    );
}

// 30-minute increments across the day for the quiet-hours picker.
const TIME_OPTIONS: string[] = Array.from({ length: 48 }, (_, i) => {
    const h = Math.floor(i / 2);
    const m = i % 2 === 0 ? '00' : '30';
    return `${String(h).padStart(2, '0')}:${m}`;
});

function formatTimeLabel(value: string): string {
    const [hStr, m] = value.split(':');
    const h = Number(hStr);
    const suffix = h < 12 ? 'AM' : 'PM';
    const h12 = h % 12 === 0 ? 12 : h % 12;
    return `${h12}:${m} ${suffix}`;
}

export default function SettingsScreen() {
    const { t } = useTranslation('settings');
    const { isDark, packageId, setPackage, colors, mode, setMode, reducedMotion, setReducedMotion } = useTheme();
    const { signOut, getToken } = useAuth();
    const { style: navBarStyle } = useNavStyleSettings();
    const { user } = useUser();
    const router = useRouter();
    const { show: showToast } = useToast();
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [passwordLoading, setPasswordLoading] = useState(false);
    const [timePicker, setTimePicker] = useState<null | 'quietHoursStart' | 'quietHoursEnd'>(null);
    const [notifBusy, setNotifBusy] = useState(false);
    const [notifSettings, setNotifSettings] = useState<NotificationSettings>(
        notificationService.getSettings(),
    );

    // The server owns push/email/quiet-hours (it enforces them when deciding
    // what to send), so it wins over the local cache on load. Haptics stay
    // local — they describe this device, not the account.
    useEffect(() => {
        let cancelled = false;

        (async () => {
            const local = await notificationService.loadSettings();
            if (!cancelled) setNotifSettings(local);

            // A granted preference means nothing if the OS is blocking us, so
            // the switch reflects the AND of both.
            const { status } = await Notifications.getPermissionsAsync().catch(
                () => ({ status: 'undetermined' as Notifications.PermissionStatus }),
            );

            let remote;
            try {
                remote = await getNotificationPreferences(getToken);
            } catch {
                // Offline or signed out: keep showing the last known settings
                // rather than snapping the switches to defaults.
                if (!cancelled && status !== 'granted' && local.pushEnabled) {
                    await notificationService.saveSettings({ pushEnabled: false });
                    setNotifSettings((prev) => ({ ...prev, pushEnabled: false }));
                }
                return;
            }
            if (cancelled) return;

            const quietOn = isQuietHoursEnabled(remote.quietHours);
            const merged: NotificationSettings = {
                ...local,
                pushEnabled: remote.pushNotifications && status === 'granted',
                emailEnabled: remote.emailNotifications,
                quietHoursEnabled: quietOn,
                // While quiet hours are off the stored window is 00:00–00:00,
                // which would be meaningless in the chips — keep the last real
                // window the user picked so re-enabling restores it.
                quietHoursStart: quietOn ? remote.quietHours.start : local.quietHoursStart,
                quietHoursEnd: quietOn ? remote.quietHours.end : local.quietHoursEnd,
            };

            setNotifSettings(merged);
            await notificationService.saveSettings(merged);
        })();

        return () => {
            cancelled = true;
        };
    }, [getToken]);

    const haptic = useCallback(() => {
        if (notifSettings.hapticsEnabled) {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => { });
        }
    }, [notifSettings.hapticsEnabled]);

    /**
     * Applies a settings change optimistically, then persists it. `remote` is
     * the matching server patch; if it fails the switch snaps back and says so,
     * because a toggle that looks saved but isn't is the whole problem here.
     */
    const commitNotifSettings = useCallback(
        async (
            patch: Partial<NotificationSettings>,
            remote?: NotificationPreferencesInput,
            beforeRemote?: () => Promise<void>,
        ): Promise<boolean> => {
            const previous = notificationService.getSettings();
            setNotifSettings({ ...previous, ...patch });
            setNotifBusy(true);
            try {
                await notificationService.saveSettings(patch);
                if (beforeRemote) await beforeRemote();
                if (remote) await saveNotificationPreferences(getToken, remote);
                return true;
            } catch {
                setNotifSettings(previous);
                await notificationService.saveSettings(previous).catch(() => undefined);
                showToast({
                    emoji: '⚠️',
                    variant: 'error',
                    message: t('notifications.saveFailed'),
                });
                return false;
            } finally {
                setNotifBusy(false);
            }
        },
        [getToken, showToast, t],
    );

    /**
     * Push needs three things to agree: OS permission, a registered device
     * token, and the server-side preference. Flipping only the last one (what
     * this screen used to do) leaves the other two contradicting it.
     */
    const handlePushToggle = useCallback(
        async (value: boolean) => {
            haptic();
            if (!value) {
                const token = await getStoredPushToken();
                await commitNotifSettings({ pushEnabled: false }, { pushNotifications: false }, async () => {
                    // Drop this device's token so it stops receiving pushes even
                    // if another device keeps the account preference on.
                    if (token) await unregisterPushToken(getToken, token).catch(() => undefined);
                    await resetPushTokenSync();
                });
                return;
            }

            const granted = await notificationService.requestPermissions();
            if (!granted) {
                // The OS only prompts once — after a denial the only way back
                // is system settings, so send them there instead of silently
                // leaving a switch that can never turn on.
                Alert.alert(
                    t('notifications.permissionTitle'),
                    t('notifications.permissionMessage'),
                    [
                        { text: t('common:actions.cancel'), style: 'cancel' },
                        { text: t('notifications.openSettings'), onPress: () => Linking.openSettings() },
                    ],
                );
                return;
            }

            await commitNotifSettings({ pushEnabled: true }, { pushNotifications: true }, async () => {
                await registerForPushNotificationsAsync(user?.id, getToken);
            });
        },
        [commitNotifSettings, getToken, haptic, t, user?.id],
    );

    const handleQuietHoursToggle = useCallback(
        async (value: boolean) => {
            haptic();
            await commitNotifSettings(
                { quietHoursEnabled: value },
                {
                    quietHours: value
                        ? {
                            start: notifSettings.quietHoursStart,
                            end: notifSettings.quietHoursEnd,
                        }
                        : QUIET_HOURS_OFF,
                },
            );
        },
        [commitNotifSettings, haptic, notifSettings.quietHoursStart, notifSettings.quietHoursEnd],
    );

    const handleQuietHoursTimeChange = useCallback(
        async (key: 'quietHoursStart' | 'quietHoursEnd', value: string) => {
            const next = { ...notifSettings, [key]: value };
            await commitNotifSettings(
                { [key]: value },
                { quietHours: { start: next.quietHoursStart, end: next.quietHoursEnd } },
            );
        },
        [commitNotifSettings, notifSettings],
    );

    const textPrimary = colors.foreground;
    const textSecondary = isDark ? '#94A3B8' : '#64748B';
    const sectionText = isDark ? '#64748B' : '#94A3B8';
    const cardBg = colors.card;
    const borderColor = colors.border;
    const appVersion = Constants.expoConfig?.version ?? '1.0.0';
    const displayName = user?.fullName || user?.firstName || user?.primaryEmailAddress?.emailAddress?.split('@')[0] || 'Edutu member';
    const email = user?.primaryEmailAddress?.emailAddress ?? '';
    const initials = (displayName || 'E').trim().split(/\s+/).map(p => p[0]).slice(0, 2).join('').toUpperCase();

    const shouldShowPasswordSetup = Boolean(
        user &&
        !user.passwordEnabled &&
        user.externalAccounts.some(account => ['google', 'apple'].includes(String(account.provider)))
    );

    const handleSetPassword = async () => {
        if (!user || passwordLoading) return;
        if (newPassword.length < 8) {
            Alert.alert(t('security.passwordTooShortTitle'), t('security.passwordTooShortMessage'));
            return;
        }
        if (newPassword !== confirmPassword) {
            Alert.alert(t('security.passwordMismatchTitle'), t('security.passwordMismatchMessage'));
            return;
        }
        setPasswordLoading(true);
        try {
            await user.updatePassword({ newPassword, signOutOfOtherSessions: false });
            setNewPassword('');
            setConfirmPassword('');
            Alert.alert(t('security.passwordAddedTitle'), t('security.passwordAddedMessage'));
        } catch (error: any) {
            Alert.alert(t('security.passwordErrorTitle'), error?.errors?.[0]?.message || t('security.passwordErrorMessage'));
        } finally {
            setPasswordLoading(false);
        }
    };

    const handleSignOut = () => {
        Alert.alert(t('account.signOut'), t('account.signOutConfirm'), [
            { text: t('common:actions.cancel'), style: 'cancel' },
            { text: t('account.signOut'), style: 'destructive', onPress: () => signOut() },
        ]);
    };

    const handleShareApp = async () => {
        haptic();
        try {
            await Share.share({
                message: t('support.shareMessage'),
            });
        } catch { /* user dismissed */ }
    };

    const handleDeleteAccount = () => {
        Alert.alert(
            t('account.deleteAccount'),
            t('account.deleteConfirmMessage'),
            [
                { text: t('common:actions.cancel'), style: 'cancel' },
                {
                    text: t('account.deleteAccount'),
                    style: 'destructive',
                    onPress: async () => {
                        try {
                            const userId = user?.id;
                            if (!userId) {
                                Alert.alert(t('common:states.error'), t('account.userNotFound'));
                                return;
                            }
                            const token = await getToken();
                            const { error: dbError } = await supabase.functions.invoke('delete-account', {
                                headers: token ? { Authorization: `Bearer ${token}` } : undefined,
                                body: { user_id: userId },
                            });
                            if (dbError) {
                                if (__DEV__) console.error('Supabase data deletion failed:', dbError);
                                Alert.alert(t('common:states.error'), t('account.dataDeleteError'));
                                return;
                            }
                            await user?.delete();
                            await signOut();
                            router.replace('/(auth)/sign-in');
                        } catch (error) {
                            Alert.alert(t('common:states.error'), t('account.deleteError'));
                        }
                    },
                },
            ],
        );
    };

    const openUrl = async (url: string) => {
        await WebBrowser.openBrowserAsync(url);
    };

    /**
     * Opens the native store review sheet. The store URLs only exist once the
     * app is published, so this falls back to the website when the listing
     * isn't configured yet — better than a dead link that errors out.
     */
    const handleRate = async () => {
        haptic();
        const iosAppStoreId = Constants.expoConfig?.extra?.iosAppStoreId;
        const androidPackage = Constants.expoConfig?.android?.package;

        const storeUrl = Platform.OS === 'ios'
            ? (iosAppStoreId ? `itms-apps://apps.apple.com/app/id${iosAppStoreId}?action=write-review` : null)
            : (androidPackage ? `market://details?id=${androidPackage}` : null);

        if (storeUrl) {
            const canOpen = await Linking.canOpenURL(storeUrl).catch(() => false);
            if (canOpen) {
                await Linking.openURL(storeUrl).catch(() => openUrl('https://edutu.org'));
                return;
            }
        }
        await openUrl('https://edutu.org');
    };

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top', 'left', 'right']}>
            <ScreenHeader title={t('title')} showBack />

            <ScrollView
                style={styles.scrollView}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={styles.scrollContent}
            >
                {/* Account summary */}
                <TouchableOpacity
                    activeOpacity={0.85}
                    onPress={() => { haptic(); router.push('/profile/edit'); }}
                    style={[styles.accountCard, { backgroundColor: cardBg, borderColor }]}
                >
                    {user?.imageUrl ? (
                        <Image source={{ uri: user.imageUrl }} style={styles.avatar} />
                    ) : (
                        <View style={[styles.avatar, styles.avatarFallback, { backgroundColor: colors.accent }]}>
                            <Text style={styles.avatarInitials}>{initials}</Text>
                        </View>
                    )}
                    <View style={styles.accountInfo}>
                        <Text style={[styles.accountName, { color: textPrimary }]} numberOfLines={1}>{displayName}</Text>
                        {email ? <Text style={[styles.accountEmail, { color: textSecondary }]} numberOfLines={1}>{email}</Text> : null}
                        <View style={[styles.managePill, { backgroundColor: `${colors.accent}18` }]}>
                            <Text style={[styles.managePillText, { color: colors.accent }]}>{t('account.manage')}</Text>
                        </View>
                    </View>
                    <ChevronRight size={20} color={textSecondary} />
                </TouchableOpacity>

                {/* Appearance */}
                <View style={styles.section}>
                    <SectionLabel color={sectionText}>{t('sections.display')}</SectionLabel>

                    {/* Mode segmented control */}
                    <Text style={[styles.subTitle, { color: textSecondary }]}>{t('display.appearance')}</Text>
                    <View style={[styles.segmented, { backgroundColor: colors.muted, borderColor }]}>
                        {APPEARANCE_MODES.map((m) => {
                            const active = mode === m.id;
                            const Icon = m.icon;
                            return (
                                <TouchableOpacity
                                    key={m.id}
                                    activeOpacity={0.85}
                                    onPress={() => { haptic(); setMode(m.id); }}
                                    style={[styles.segment, active && { backgroundColor: cardBg, shadowColor: '#000', shadowOpacity: isDark ? 0.4 : 0.12, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 2 }]}
                                >
                                    <Icon size={17} color={active ? colors.accent : textSecondary} />
                                    <Text style={[styles.segmentText, { color: active ? textPrimary : textSecondary }]}>
                                        {t(m.labelKey)}
                                    </Text>
                                </TouchableOpacity>
                            );
                        })}
                    </View>

                    {/* Theme gallery */}
                    <Text style={[styles.subTitle, { color: textSecondary, marginTop: 20 }]}>{t('display.selectTheme')}</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.themeScrollContent}>
                        {THEME_ORDER.map((id) => {
                            const sw = THEME_SWATCHES[id];
                            const isActive = packageId === id;
                            return (
                                <TouchableOpacity
                                    key={id}
                                    onPress={() => { haptic(); setPackage(id); }}
                                    activeOpacity={0.85}
                                    style={[
                                        styles.themeCard,
                                        { backgroundColor: cardBg, borderColor: isActive ? sw.accent : borderColor },
                                        isActive && styles.themeCardActive,
                                    ]}
                                >
                                    <View style={[styles.themePreview, { backgroundColor: sw.bg }]}>
                                        <View style={[styles.themePreviewBar, { backgroundColor: sw.accent }]} />
                                        <View style={styles.themePreviewRow}>
                                            <View style={[styles.themePreviewChip, { backgroundColor: sw.card }]} />
                                            <View style={[styles.themePreviewDot, { backgroundColor: sw.accentLight }]} />
                                        </View>
                                        {isActive && (
                                            <View style={[styles.themeCheck, { backgroundColor: sw.accent }]}>
                                                <Check size={12} color="#fff" strokeWidth={3} />
                                            </View>
                                        )}
                                    </View>
                                    <Text style={[styles.themeName, { color: isActive ? textPrimary : textSecondary }]} numberOfLines={1}>
                                        {t(`display.themes.${id}`)}
                                    </Text>
                                </TouchableOpacity>
                            );
                        })}
                    </ScrollView>

                    {/* Bottom nav bar style */}
                    <Text style={[styles.subTitle, { color: textSecondary, marginTop: 20 }]}>{t('display.navBar')}</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.themeScrollContent}>
                        {NAV_BAR_STYLE_OPTIONS.map((opt) => {
                            const active = navBarStyle === opt.id;
                            return (
                                <TouchableOpacity
                                    key={opt.id}
                                    onPress={() => { haptic(); setNavBarStyle(opt.id); }}
                                    activeOpacity={0.85}
                                    accessibilityRole="radio"
                                    accessibilityState={{ selected: active }}
                                    accessibilityLabel={`${t(opt.labelKey)}. ${t(opt.descKey)}`}
                                    style={[
                                        styles.themeCard,
                                        { backgroundColor: cardBg, borderColor: active ? colors.accent : borderColor },
                                        active && styles.themeCardActive,
                                    ]}
                                >
                                    <View style={[styles.themePreview, { backgroundColor: colors.background }]}>
                                        <NavStylePreview
                                            id={opt.id}
                                            accent={colors.accent || '#6366F1'}
                                            dim={isDark ? '#475569' : '#CBD5E1'}
                                        />
                                        {active && (
                                            <View style={[styles.themeCheck, { backgroundColor: colors.accent }]}>
                                                <Check size={12} color="#fff" strokeWidth={3} />
                                            </View>
                                        )}
                                    </View>
                                    <Text style={[styles.themeName, { color: active ? textPrimary : textSecondary }]} numberOfLines={1}>
                                        {t(opt.labelKey)}
                                    </Text>
                                </TouchableOpacity>
                            );
                        })}
                    </ScrollView>
                    <Text style={[styles.settingDesc, { color: textSecondary, marginTop: 8 }]}>
                        {t(NAV_BAR_STYLE_OPTIONS.find((o) => o.id === navBarStyle)?.descKey ?? 'display.navBarGlassDesc')}
                    </Text>
                </View>

                {/* Language */}
                <View style={styles.section}>
                    <SectionLabel color={sectionText}>{t('sections.language')}</SectionLabel>
                    <Card variant="solid" style={[styles.card, { backgroundColor: cardBg, borderColor }]}>
                        <LanguageSelector />
                    </Card>
                </View>

                {/* Notifications */}
                <View style={styles.section}>
                    <SectionLabel color={sectionText}>{t('sections.notifications')}</SectionLabel>
                    <Card variant="solid" style={[styles.card, { backgroundColor: cardBg, borderColor }]}>
                        <SettingRow
                            icon={<Smartphone size={20} color="#3b82f6" />} iconBg="rgba(59,130,246,0.12)"
                            label={t('notifications.push')} desc={t('notifications.pushDesc')}
                            textPrimary={textPrimary} textSecondary={textSecondary} borderColor={borderColor}
                            right={<Switch value={notifSettings.pushEnabled} disabled={notifBusy} onValueChange={handlePushToggle} trackColor={{ false: isDark ? '#334155' : '#e2e8f0', true: colors.accent }} thumbColor="white" />}
                        />
                        <SettingRow
                            icon={<Mail size={20} color="#10b981" />} iconBg="rgba(16,185,129,0.12)"
                            label={t('notifications.email')} desc={t('notifications.emailDesc')}
                            textPrimary={textPrimary} textSecondary={textSecondary} borderColor={borderColor}
                            right={<Switch value={notifSettings.emailEnabled} disabled={notifBusy} onValueChange={(v) => { haptic(); commitNotifSettings({ emailEnabled: v }, { emailNotifications: v }); }} trackColor={{ false: isDark ? '#334155' : '#e2e8f0', true: colors.accent }} thumbColor="white" />}
                        />
                        <SettingRow
                            icon={<Vibrate size={20} color="#f59e0b" />} iconBg="rgba(245,158,11,0.12)"
                            label={t('notifications.haptics')} desc={t('notifications.hapticsDesc')}
                            textPrimary={textPrimary} textSecondary={textSecondary} borderColor={borderColor}
                            right={<Switch value={notifSettings.hapticsEnabled} onValueChange={async (v) => { await commitNotifSettings({ hapticsEnabled: v }); if (v) await notificationService.triggerHaptic('light'); }} trackColor={{ false: isDark ? '#334155' : '#e2e8f0', true: colors.accent }} thumbColor="white" />}
                        />
                        <SettingRow
                            icon={<MoonStar size={20} color="#8b5cf6" />} iconBg="rgba(139,92,246,0.12)"
                            label={t('notifications.quietHours')} desc={t('notifications.quietHoursDesc')}
                            textPrimary={textPrimary} textSecondary={textSecondary} borderColor={borderColor}
                            isLast={!notifSettings.quietHoursEnabled}
                            right={<Switch value={notifSettings.quietHoursEnabled} disabled={notifBusy} onValueChange={handleQuietHoursToggle} trackColor={{ false: isDark ? '#334155' : '#e2e8f0', true: colors.accent }} thumbColor="white" />}
                        />
                        {notifSettings.quietHoursEnabled && (
                            <View style={styles.quietRow}>
                                <TouchableOpacity
                                    style={[styles.timeChip, { backgroundColor: colors.muted, borderColor }]}
                                    onPress={() => { haptic(); setTimePicker('quietHoursStart'); }}
                                >
                                    <Clock size={13} color={textSecondary} />
                                    <Text style={[styles.timeChipLabel, { color: textSecondary }]}>{t('notifications.from')}</Text>
                                    <Text style={[styles.timeChipValue, { color: textPrimary }]}>{formatTimeLabel(notifSettings.quietHoursStart)}</Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    style={[styles.timeChip, { backgroundColor: colors.muted, borderColor }]}
                                    onPress={() => { haptic(); setTimePicker('quietHoursEnd'); }}
                                >
                                    <Clock size={13} color={textSecondary} />
                                    <Text style={[styles.timeChipLabel, { color: textSecondary }]}>{t('notifications.to')}</Text>
                                    <Text style={[styles.timeChipValue, { color: textPrimary }]}>{formatTimeLabel(notifSettings.quietHoursEnd)}</Text>
                                </TouchableOpacity>
                            </View>
                        )}
                    </Card>
                </View>

                {/* Accessibility */}
                <View style={styles.section}>
                    <SectionLabel color={sectionText}>{t('sections.accessibility')}</SectionLabel>
                    <Card variant="solid" style={[styles.card, { backgroundColor: cardBg, borderColor }]}>
                        <SettingRow
                            icon={<Wind size={20} color="#06b6d4" />} iconBg="rgba(6,182,212,0.12)"
                            label={t('accessibility.reduceMotion')} desc={t('accessibility.reduceMotionDesc')}
                            textPrimary={textPrimary} textSecondary={textSecondary} borderColor={borderColor} isLast
                            right={<Switch value={reducedMotion} onValueChange={(v) => { haptic(); setReducedMotion(v); }} trackColor={{ false: isDark ? '#334155' : '#e2e8f0', true: colors.accent }} thumbColor="white" />}
                        />
                    </Card>
                </View>

                {/* Privacy & Security */}
                <View style={styles.section}>
                    <SectionLabel color={sectionText}>{t('sections.privacySecurity')}</SectionLabel>
                    <Card variant="solid" style={[styles.card, { backgroundColor: cardBg, borderColor }]}>
                        <SettingRow
                            icon={<Lock size={20} color="#ef4444" />} iconBg="rgba(239,68,68,0.12)"
                            label={t('security.passwordKeys')} desc={t('security.passwordKeysDesc')}
                            textPrimary={textPrimary} textSecondary={textSecondary} borderColor={borderColor}
                            onPress={() => { haptic(); router.push('/profile/security'); }}
                            right={<ChevronRight size={16} color={textSecondary} />}
                        />
                        {shouldShowPasswordSetup ? (
                            <View style={[styles.passwordSetup, styles.borderBottom, { borderBottomColor: borderColor }]}>
                                <Text style={[styles.passwordSetupTitle, { color: textPrimary }]}>{t('security.addEmailPassword')}</Text>
                                <Text style={[styles.passwordSetupDesc, { color: textSecondary }]}>{t('security.addEmailPasswordDesc')}</Text>
                                <TextInput value={newPassword} onChangeText={setNewPassword} secureTextEntry placeholder={t('security.newPassword')} placeholderTextColor={textSecondary} style={[styles.passwordInput, { color: textPrimary, borderColor, backgroundColor: colors.background }]} />
                                <TextInput value={confirmPassword} onChangeText={setConfirmPassword} secureTextEntry placeholder={t('security.confirmPassword')} placeholderTextColor={textSecondary} style={[styles.passwordInput, { color: textPrimary, borderColor, backgroundColor: colors.background }]} />
                                <TouchableOpacity onPress={handleSetPassword} disabled={passwordLoading} style={[styles.passwordButton, { backgroundColor: colors.accent }, passwordLoading && styles.passwordButtonDisabled]}>
                                    <Text style={styles.passwordButtonText}>{passwordLoading ? t('security.addingPassword') : t('security.addPassword')}</Text>
                                </TouchableOpacity>
                            </View>
                        ) : null}
                        <SettingRow
                            icon={<Shield size={20} color="#3b82f6" />} iconBg="rgba(59,130,246,0.12)"
                            label={t('security.privacy')} desc={t('security.privacyDesc')}
                            textPrimary={textPrimary} textSecondary={textSecondary} borderColor={borderColor} isLast
                            onPress={() => { haptic(); router.push('/privacy'); }}
                            right={<ChevronRight size={16} color={textSecondary} />}
                        />
                    </Card>
                </View>

                {/* Support & About */}
                <View style={styles.section}>
                    <SectionLabel color={sectionText}>{t('sections.support')}</SectionLabel>
                    <Card variant="solid" style={[styles.card, { backgroundColor: cardBg, borderColor }]}>
                        <SettingRow
                            icon={<Sparkles size={20} color="#f59e0b" />} iconBg="rgba(245,158,11,0.12)"
                            label={t('support.help')} desc={t('support.helpDesc')}
                            textPrimary={textPrimary} textSecondary={textSecondary} borderColor={borderColor}
                            onPress={() => router.push('/help')}
                            right={<ChevronRight size={16} color={textSecondary} />}
                        />
                        <SettingRow
                            icon={<Star size={20} color="#eab308" />} iconBg="rgba(234,179,8,0.12)"
                            label={t('support.rate')} desc={t('support.rateDesc')}
                            textPrimary={textPrimary} textSecondary={textSecondary} borderColor={borderColor}
                            onPress={handleRate}
                            right={<ExternalLink size={16} color={textSecondary} />}
                        />
                        <SettingRow
                            icon={<Share2 size={20} color="#10b981" />} iconBg="rgba(16,185,129,0.12)"
                            label={t('support.share')} desc={t('support.shareDesc')}
                            textPrimary={textPrimary} textSecondary={textSecondary} borderColor={borderColor}
                            onPress={handleShareApp}
                            right={<ChevronRight size={16} color={textSecondary} />}
                        />
                        <SettingRow
                            icon={<Info size={20} color="#64748b" />} iconBg="rgba(100,116,139,0.12)"
                            label={t('support.version')} desc={t('support.versionValue', { version: appVersion })}
                            textPrimary={textPrimary} textSecondary={textSecondary} borderColor={borderColor} isLast
                            right={<Text style={[styles.versionTag, { color: textSecondary }]}>v{appVersion}</Text>}
                        />
                    </Card>
                </View>

                {/* Legal */}
                <View style={styles.section}>
                    <SectionLabel color={sectionText}>{t('sections.legal')}</SectionLabel>
                    <Card variant="solid" style={[styles.card, { backgroundColor: cardBg, borderColor }]}>
                        <SettingRow
                            icon={<Shield size={20} color="#3b82f6" />} iconBg="rgba(59,130,246,0.12)"
                            label={t('legal.privacyPolicy')} desc={t('legal.privacyPolicyDesc')}
                            textPrimary={textPrimary} textSecondary={textSecondary} borderColor={borderColor}
                            onPress={() => openUrl('https://edutu.org/privacy')}
                            right={<ExternalLink size={16} color={textSecondary} />}
                        />
                        <SettingRow
                            icon={<Lock size={20} color="#3b82f6" />} iconBg="rgba(59,130,246,0.12)"
                            label={t('legal.terms')} desc={t('legal.termsDesc')}
                            textPrimary={textPrimary} textSecondary={textSecondary} borderColor={borderColor} isLast
                            onPress={() => openUrl('https://edutu.org/terms')}
                            right={<ExternalLink size={16} color={textSecondary} />}
                        />
                    </Card>
                </View>

                {/* Sign out */}
                <TouchableOpacity style={[styles.signOutBtn, { backgroundColor: cardBg, borderColor }]} onPress={handleSignOut}>
                    <LogOut size={18} color={textPrimary} />
                    <Text style={[styles.signOutText, { color: textPrimary }]}>{t('account.signOut')}</Text>
                </TouchableOpacity>

                {/* Danger Zone */}
                <View style={styles.section}>
                    <SectionLabel color="#ef4444">{t('sections.dangerZone')}</SectionLabel>
                    <TouchableOpacity
                        style={[styles.dangerBtn, { backgroundColor: isDark ? 'rgba(239,68,68,0.1)' : 'rgba(239,68,68,0.05)' }]}
                        onPress={handleDeleteAccount}
                    >
                        <Text style={[styles.dangerBtnText, { color: '#ef4444' }]}>{t('account.deleteAccount')}</Text>
                    </TouchableOpacity>
                    <Text style={[styles.dangerHint, { color: textSecondary }]}>{t('account.deleteHint')}</Text>
                </View>
            </ScrollView>

            {/* Time picker modal */}
            <Modal visible={timePicker !== null} transparent animationType="fade" onRequestClose={() => setTimePicker(null)}>
                <TouchableOpacity style={styles.modalBackdrop} activeOpacity={1} onPress={() => setTimePicker(null)}>
                    <View style={[styles.timeSheet, { backgroundColor: cardBg, borderColor }]} onStartShouldSetResponder={() => true}>
                        <View style={styles.timeSheetHeader}>
                            <Text style={[styles.timeSheetTitle, { color: textPrimary }]}>
                                {timePicker === 'quietHoursStart' ? t('notifications.quietStartTitle') : t('notifications.quietEndTitle')}
                            </Text>
                            <TouchableOpacity onPress={() => setTimePicker(null)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                                <X size={20} color={textSecondary} />
                            </TouchableOpacity>
                        </View>
                        <ScrollView style={styles.timeList} showsVerticalScrollIndicator={false}>
                            {TIME_OPTIONS.map((opt) => {
                                const selected = timePicker && notifSettings[timePicker] === opt;
                                return (
                                    <TouchableOpacity
                                        key={opt}
                                        style={[styles.timeOption, selected && { backgroundColor: `${colors.accent}18` }]}
                                        onPress={() => {
                                            if (timePicker) {
                                                haptic();
                                                handleQuietHoursTimeChange(timePicker, opt);
                                            }
                                            setTimePicker(null);
                                        }}
                                    >
                                        <Text style={[styles.timeOptionText, { color: selected ? colors.accent : textPrimary, fontWeight: selected ? '800' : '500' }]}>
                                            {formatTimeLabel(opt)}
                                        </Text>
                                        {selected ? <Check size={18} color={colors.accent} strokeWidth={3} /> : null}
                                    </TouchableOpacity>
                                );
                            })}
                        </ScrollView>
                    </View>
                </TouchableOpacity>
            </Modal>
        </SafeAreaView>
    );
}

/* ---------- Reusable subcomponents ---------- */

function SectionLabel({ children, color }: { children: React.ReactNode; color: string }) {
    return <Text style={[styles.sectionTitle, { color }]}>{children}</Text>;
}

function RowIcon({ children, bg }: { children: React.ReactNode; bg: string }) {
    return <View style={[styles.iconContainer, { backgroundColor: bg }]}>{children}</View>;
}

function SettingRow({
    icon, iconBg, label, desc, right, onPress, isLast, textPrimary, textSecondary, borderColor,
}: {
    icon: React.ReactNode; iconBg: string; label: string; desc?: string; right?: React.ReactNode;
    onPress?: () => void; isLast?: boolean; textPrimary: string; textSecondary: string; borderColor: string;
}) {
    const content = (
        <View style={[styles.settingRow, !isLast && styles.borderBottom, !isLast && { borderBottomColor: borderColor }]}>
            <View style={styles.settingLeft}>
                <RowIcon bg={iconBg}>{icon}</RowIcon>
                <View style={styles.rowTextWrap}>
                    <Text style={[styles.settingLabel, { color: textPrimary }]}>{label}</Text>
                    {desc ? <Text style={[styles.settingDesc, { color: textSecondary }]}>{desc}</Text> : null}
                </View>
            </View>
            {right}
        </View>
    );
    if (onPress) {
        return <TouchableOpacity activeOpacity={0.7} onPress={onPress}>{content}</TouchableOpacity>;
    }
    return content;
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    scrollView: { flex: 1 },
    scrollContent: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 120 },

    /* Account card */
    accountCard: {
        flexDirection: 'row', alignItems: 'center', gap: 14,
        padding: 16, borderRadius: 20, borderWidth: 1, marginBottom: 28,
    },
    avatar: { width: 56, height: 56, borderRadius: 18 },
    avatarFallback: { alignItems: 'center', justifyContent: 'center' },
    avatarInitials: { color: '#fff', fontSize: 20, fontWeight: '800' },
    accountInfo: { flex: 1, gap: 2 },
    accountName: { fontSize: 17, fontWeight: '800' },
    accountEmail: { fontSize: 13 },
    managePill: { alignSelf: 'flex-start', marginTop: 6, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
    managePillText: { fontSize: 11, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5 },

    section: { marginBottom: 28 },
    sectionTitle: {
        fontSize: 11, fontWeight: '900', textTransform: 'uppercase',
        letterSpacing: 2, marginLeft: 4, marginBottom: 14,
    },
    subTitle: {
        fontSize: 11, fontWeight: '700', textTransform: 'uppercase',
        letterSpacing: 1, marginLeft: 4, marginBottom: 10,
    },
    card: { padding: 0 },

    /* Segmented control */
    segmented: {
        flexDirection: 'row', borderRadius: 14, padding: 4, borderWidth: 1, gap: 4,
    },
    segment: {
        flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
        gap: 6, paddingVertical: 10, borderRadius: 10,
    },
    segmentText: { fontSize: 13, fontWeight: '700' },

    /* Theme gallery */
    themeScrollContent: { paddingRight: 20, gap: 12 },
    themeCard: { width: 116, borderRadius: 16, borderWidth: 2, padding: 8, alignItems: 'center' },
    themeCardActive: {
        shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 3,
    },
    themePreview: { width: '100%', height: 74, borderRadius: 10, padding: 9, justifyContent: 'space-between', overflow: 'hidden' },
    themePreviewBar: { height: 8, width: '58%', borderRadius: 4 },
    themePreviewRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    themePreviewChip: { flex: 1, height: 20, borderRadius: 6 },
    themePreviewDot: { width: 20, height: 20, borderRadius: 10 },
    themeCheck: {
        position: 'absolute', top: 6, right: 6, width: 20, height: 20, borderRadius: 10,
        alignItems: 'center', justifyContent: 'center',
    },
    themeName: { fontSize: 12, fontWeight: '700', textAlign: 'center', marginTop: 8 },

    /* Rows */
    settingRow: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingVertical: 14, paddingHorizontal: 16,
    },
    borderBottom: { borderBottomWidth: 1 },
    settingLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 },
    rowTextWrap: { flex: 1, paddingRight: 8 },
    iconContainer: {
        width: 40, height: 40, borderRadius: 11, alignItems: 'center', justifyContent: 'center', marginRight: 14,
    },
    settingLabel: { fontSize: 15, fontWeight: '600' },
    settingDesc: { fontSize: 12, marginTop: 2 },

    /* Quiet hours */
    quietRow: { flexDirection: 'row', gap: 10, paddingHorizontal: 16, paddingBottom: 14, paddingTop: 2 },
    timeChip: {
        flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6,
        paddingVertical: 12, paddingHorizontal: 14, borderRadius: 12, borderWidth: 1,
    },
    timeChipLabel: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
    timeChipValue: { fontSize: 14, fontWeight: '800', marginLeft: 'auto' },

    /* Password setup */
    passwordSetup: { paddingHorizontal: 16, paddingVertical: 14, gap: 10 },
    passwordSetupTitle: { fontSize: 14, fontWeight: '800' },
    passwordSetupDesc: { fontSize: 12, lineHeight: 18 },
    passwordInput: { height: 48, borderRadius: 12, borderWidth: 1, paddingHorizontal: 14, fontSize: 14 },
    passwordButton: { height: 46, borderRadius: 999, alignItems: 'center', justifyContent: 'center', marginTop: 2 },
    passwordButtonDisabled: { opacity: 0.55 },
    passwordButtonText: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' },

    versionTag: { fontSize: 13, fontWeight: '700' },

    /* Sign out + danger */
    signOutBtn: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
        paddingVertical: 16, borderRadius: 16, borderWidth: 1, marginBottom: 28,
    },
    signOutText: { fontSize: 15, fontWeight: '700' },
    dangerBtn: { paddingVertical: 16, borderRadius: 16, borderWidth: 1, borderColor: '#ef444433', alignItems: 'center' },
    dangerBtnText: { fontSize: 15, fontWeight: '700' },
    dangerHint: { fontSize: 12, textAlign: 'center', marginTop: 10, lineHeight: 17, paddingHorizontal: 12 },

    /* Time picker modal */
    modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
    timeSheet: {
        maxHeight: '62%', borderTopLeftRadius: 24, borderTopRightRadius: 24, borderWidth: 1,
        paddingHorizontal: 8, paddingTop: 8, paddingBottom: Platform.OS === 'ios' ? 32 : 16,
    },
    timeSheetHeader: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingHorizontal: 12, paddingVertical: 14,
    },
    timeSheetTitle: { fontSize: 16, fontWeight: '800' },
    timeList: { paddingHorizontal: 4 },
    timeOption: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingVertical: 14, paddingHorizontal: 14, borderRadius: 12,
    },
    timeOptionText: { fontSize: 15 },
});

// Sketch geometry for the nav-style cards. Sits inside styles.themePreview,
// whose 9px padding the bar deliberately bleeds through to read as full-width.
const navPreviewStyles = StyleSheet.create({
    frame: { flex: 1, justifyContent: 'flex-end' },
    dot: { width: 4, height: 4, borderRadius: 2 },
    button: { width: 15, height: 15, borderRadius: 8 },

    // glass
    pillRow: { flexDirection: 'row', alignItems: 'center', gap: 3, marginBottom: 2 },
    pill: {
        flex: 1, height: 15, borderRadius: 8, borderWidth: 1,
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around',
        paddingHorizontal: 4,
    },
    pillButton: {},

    // fab / tabs / center
    bar: {
        height: 16, borderTopWidth: 1,
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around',
        marginHorizontal: -9, marginBottom: -9, paddingHorizontal: 5,
    },
    fabButton: { position: 'absolute', right: 2, bottom: 11 },
    centerButton: { position: 'absolute', bottom: 0, alignSelf: 'center' },
    centerGap: { width: 16 },
});
