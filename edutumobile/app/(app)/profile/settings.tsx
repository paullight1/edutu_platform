import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    ScrollView,
    TouchableOpacity,
    Switch,
    StyleSheet,
    Alert,
    TextInput
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
    Moon,
    Shield,
    ChevronRight,
    Smartphone,
    Mail,
    Sun,
    Zap,
    Lock,
    Vibrate,
    ExternalLink
} from 'lucide-react-native';
import { Card } from '../../../components/ui/Card';
import { ScreenHeader } from "../../../components/ui/ScreenHeader";
import { useTheme, ThemePackage } from "../../../components/context/ThemeContext";
import { notificationService, NotificationSettings } from "../../../lib/notifications";
import * as WebBrowser from 'expo-web-browser';
import { useAuth, useUser } from '@clerk/clerk-expo';
import { useRouter } from 'expo-router';
import { supabase } from '../../../lib/supabase';

const THEME_PACKAGES: { id: ThemePackage, name: string, color: string }[] = [
    { id: 'default', name: 'Indigo Pulse', color: '#6366f1' },
    { id: 'ocean', name: 'Ocean Breeze', color: '#0ea5e9' },
    { id: 'sunset', name: 'African Sunset', color: '#f59e0b' },
    { id: 'forest', name: 'Emerald Forest', color: '#10b981' },
    { id: 'royal', name: 'Royal Velvet', color: '#3b82f6' },
];

export default function SettingsScreen() {
    const { isDark, packageId, setPackage, colors } = useTheme();
    const { signOut, getToken } = useAuth();
    const { user } = useUser();
    const router = useRouter();
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [passwordLoading, setPasswordLoading] = useState(false);
    const [notifSettings, setNotifSettings] = useState<NotificationSettings>({
        pushEnabled: true,
        emailEnabled: false,
        hapticsEnabled: true,
        quietHoursEnabled: false,
        quietHoursStart: "22:00",
        quietHoursEnd: "08:00",
    });

    useEffect(() => {
        // Load notification settings
        notificationService.loadSettings().then(settings => {
            setNotifSettings(settings);
        });
    }, []);

    const updateNotifSetting = async <K extends keyof NotificationSettings>(
        key: K,
        value: NotificationSettings[K]
    ) => {
        const newSettings = { ...notifSettings, [key]: value };
        setNotifSettings(newSettings);
        await notificationService.saveSettings({ [key]: value });

        // Trigger haptic feedback on toggle
        if (key === 'hapticsEnabled' && value === true) {
            await notificationService.triggerHaptic('light');
        }
    };

    const textPrimary = colors.foreground;
    const textSecondary = isDark ? '#94A3B8' : '#64748B';
    const sectionText = isDark ? '#475569' : '#94A3B8';
    const cardBg = colors.card;
    const borderColor = colors.border;
    const shouldShowPasswordSetup = Boolean(
        user &&
        !user.passwordEnabled &&
        user.externalAccounts.some(account => ['google', 'apple'].includes(String(account.provider)))
    );

    const handleSetPassword = async () => {
        if (!user || passwordLoading) {
            return;
        }

        if (newPassword.length < 8) {
            Alert.alert('Password too short', 'Use at least 8 characters.');
            return;
        }

        if (newPassword !== confirmPassword) {
            Alert.alert('Passwords do not match', 'Enter the same password in both fields.');
            return;
        }

        setPasswordLoading(true);
        try {
            await user.updatePassword({
                newPassword,
                signOutOfOtherSessions: false,
            });
            setNewPassword('');
            setConfirmPassword('');
            Alert.alert('Password added', 'You can now sign in with email and password too.');
        } catch (error: any) {
            Alert.alert('Could not add password', error?.errors?.[0]?.message || 'Please try again.');
        } finally {
            setPasswordLoading(false);
        }
    };

    const handleDeleteAccount = () => {
        Alert.alert(
            'Delete Account',
            'Are you sure you want to delete your account? This action cannot be undone. All your data, goals, and progress will be permanently removed.',
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Delete Account',
                    style: 'destructive',
                    onPress: async () => {
                        try {
                            const userId = user?.id;
                            if (!userId) {
                                Alert.alert('Error', 'User not found. Please try again.');
                                return;
                            }

                            // Delete Supabase data first (before Clerk session is invalidated)
                            const token = await getToken();
                            const { error: dbError } = await supabase.functions.invoke('delete-account', {
                                headers: token ? { Authorization: `Bearer ${token}` } : undefined,
                                body: { user_id: userId },
                            });

                            if (dbError) {
                                if (__DEV__) {
                                    console.error('Supabase data deletion failed:', dbError);
                                }
                                Alert.alert('Error', 'We could not delete your app data. Please try again before deleting your account.');
                                return;
                            }

                            // Then delete Clerk account
                            await user?.delete();
                            await signOut();
                            router.replace('/(auth)/sign-in');
                        } catch (error) {
                            Alert.alert('Error', 'Failed to delete account. Please contact support at support@edutu.org');
                        }
                    },
                },
            ],
        );
    };

    const openUrl = async (url: string) => {
        await WebBrowser.openBrowserAsync(url);
    };

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top', 'left', 'right']}>
            <ScreenHeader title="Settings" showBack />

            <ScrollView
                style={styles.scrollView}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={styles.scrollContent}
            >
                {/* Display Preferences */}
                <View style={styles.section}>
                    <Text style={[styles.sectionTitle, { color: sectionText }]}>
                        Display Preferences
                    </Text>

                    <Card variant="glass" style={[styles.card, { marginBottom: 16 }]}>
                        <View style={styles.settingRow}>
                            <View style={styles.settingLeft}>
                                <View style={[styles.iconContainer, { backgroundColor: isDark ? 'rgba(99,102,241,0.1)' : 'rgba(245,158,11,0.1)' }]}>
                                    {isDark ? <Moon size={20} color="#818cf8" /> : <Sun size={20} color="#f59e0b" />}
                                </View>
                                <View>
                                    <Text style={[styles.settingLabel, { color: textPrimary }]}>System Appearance</Text>
                                    <Text style={[styles.settingDesc, { color: textSecondary }]}>
                                        Matches your device settings
                                    </Text>
                                </View>
                            </View>
                            <View style={[styles.systemBadge, { backgroundColor: `${colors.accent}18` }]}>
                                <Text style={[styles.systemBadgeText, { color: colors.accent }]}>Auto</Text>
                            </View>
                        </View>
                    </Card>

                    <Text style={[styles.subTitle, { color: textSecondary }]}>
                        Select Theme
                    </Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.themeScroll}>
                        {THEME_PACKAGES.map((pkg) => {
                            const isActive = packageId === pkg.id;
                            return (
                                <TouchableOpacity
                                    key={pkg.id}
                                    onPress={() => setPackage(pkg.id)}
                                    activeOpacity={0.8}
                                    style={styles.themeItem}
                                >
                                    <Card
                                        variant={isActive ? "elevated" : "glass"}
                                        style={[
                                            styles.themeCard,
                                            { borderColor: isActive ? pkg.color : 'transparent', backgroundColor: isActive ? `${pkg.color}20` : cardBg }
                                        ]}
                                    >
                                        <View style={[styles.themeCircle, { backgroundColor: pkg.color }]}>
                                            <View style={styles.themeInner} />
                                        </View>
                                        <Text style={[styles.themeName, { color: isActive ? colors.accent : textPrimary }]}>{pkg.name}</Text>
                                    </Card>
                                </TouchableOpacity>
                            );
                        })}
                    </ScrollView>
                </View>

                {/* Notification Settings */}
                <View style={styles.section}>
                    <Text style={[styles.sectionTitle, { color: sectionText }]}>
                        Notifications
                    </Text>

                    <Card variant="solid" style={[styles.card, { backgroundColor: cardBg, borderColor }]}>
                        <View style={[styles.settingRow, styles.borderBottom, { borderBottomColor: borderColor }]}>
                            <View style={styles.settingLeft}>
                                <View style={[styles.iconContainer, { backgroundColor: 'rgba(59,130,246,0.1)' }]}>
                                    <Smartphone size={20} color="#3b82f6" />
                                </View>
                                <View>
                                    <Text style={[styles.settingLabel, { color: textPrimary }]}>Push Notifications</Text>
                                    <Text style={[styles.settingDesc, { color: textSecondary }]}>Real-time updates</Text>
                                </View>
                            </View>
                            <Switch
                                value={notifSettings.pushEnabled}
                                onValueChange={(v) => updateNotifSetting('pushEnabled', v)}
                                trackColor={{ false: '#e2e8f0', true: colors.accent }}
                                thumbColor="white"
                            />
                        </View>

                        <View style={[styles.settingRow, styles.borderBottom, { borderBottomColor: borderColor }]}>
                            <View style={styles.settingLeft}>
                                <View style={[styles.iconContainer, { backgroundColor: 'rgba(16,185,129,0.1)' }]}>
                                    <Mail size={20} color="#10b981" />
                                </View>
                                <View>
                                    <Text style={[styles.settingLabel, { color: textPrimary }]}>Email Alerts</Text>
                                    <Text style={[styles.settingDesc, { color: textSecondary }]}>Weekly digest & updates</Text>
                                </View>
                            </View>
                            <Switch
                                value={notifSettings.emailEnabled}
                                onValueChange={(v) => updateNotifSetting('emailEnabled', v)}
                                trackColor={{ false: '#e2e8f0', true: colors.accent }}
                                thumbColor="white"
                            />
                        </View>

                        <View style={styles.settingRow}>
                            <View style={styles.settingLeft}>
                                <View style={[styles.iconContainer, { backgroundColor: 'rgba(59,130,246,0.1)' }]}>
                                    <Vibrate size={20} color="#3b82f6" />
                                </View>
                                <View>
                                    <Text style={[styles.settingLabel, { color: textPrimary }]}>Haptics</Text>
                                    <Text style={[styles.settingDesc, { color: textSecondary }]}>Vibration feedback</Text>
                                </View>
                            </View>
                            <Switch
                                value={notifSettings.hapticsEnabled}
                                onValueChange={(v) => updateNotifSetting('hapticsEnabled', v)}
                                trackColor={{ false: '#e2e8f0', true: colors.accent }}
                                thumbColor="white"
                            />
                        </View>
                    </Card>
                </View>

                {/* Privacy & Security */}
                <View style={styles.section}>
                    <Text style={[styles.sectionTitle, { color: sectionText }]}>
                        Privacy & Security
                    </Text>
                    <Card variant="solid" style={[styles.card, { backgroundColor: cardBg, borderColor }]}>
                        <TouchableOpacity style={[styles.settingRow, styles.borderBottom, { borderBottomColor: borderColor }]}>
                            <View style={styles.settingLeft}>
                                <View style={[styles.iconContainer, { backgroundColor: 'rgba(239,68,68,0.1)' }]}>
                                    <Lock size={20} color="#ef4444" />
                                </View>
                                <View>
                                    <Text style={[styles.settingLabel, { color: textPrimary }]}>Password & Keys</Text>
                                    <Text style={[styles.settingDesc, { color: textSecondary }]}>Manage account access</Text>
                                </View>
                            </View>
                            <ChevronRight size={16} color={textSecondary} />
                        </TouchableOpacity>
                        {shouldShowPasswordSetup ? (
                            <View style={[styles.passwordSetup, styles.borderBottom, { borderBottomColor: borderColor }]}>
                                <Text style={[styles.passwordSetupTitle, { color: textPrimary }]}>Add email password</Text>
                                <Text style={[styles.passwordSetupDesc, { color: textSecondary }]}>
                                    You use Google or Apple today. Add a password so email sign-in works too.
                                </Text>
                                <TextInput
                                    value={newPassword}
                                    onChangeText={setNewPassword}
                                    secureTextEntry
                                    placeholder="New password"
                                    placeholderTextColor={textSecondary}
                                    style={[styles.passwordInput, { color: textPrimary, borderColor, backgroundColor: colors.background }]}
                                />
                                <TextInput
                                    value={confirmPassword}
                                    onChangeText={setConfirmPassword}
                                    secureTextEntry
                                    placeholder="Confirm password"
                                    placeholderTextColor={textSecondary}
                                    style={[styles.passwordInput, { color: textPrimary, borderColor, backgroundColor: colors.background }]}
                                />
                                <TouchableOpacity
                                    onPress={handleSetPassword}
                                    disabled={passwordLoading}
                                    style={[styles.passwordButton, passwordLoading && styles.passwordButtonDisabled]}
                                >
                                    <Text style={styles.passwordButtonText}>
                                        {passwordLoading ? 'Adding password...' : 'Add password'}
                                    </Text>
                                </TouchableOpacity>
                            </View>
                        ) : null}
                        <TouchableOpacity style={styles.settingRow}>
                            <View style={styles.settingLeft}>
                                <View style={[styles.iconContainer, { backgroundColor: 'rgba(59,130,246,0.1)' }]}>
                                    <Shield size={20} color="#3b82f6" />
                                </View>
                                <View>
                                    <Text style={[styles.settingLabel, { color: textPrimary }]}>Privacy</Text>
                                    <Text style={[styles.settingDesc, { color: textSecondary }]}>Data visibility settings</Text>
                                </View>
                            </View>
                            <ChevronRight size={16} color={textSecondary} />
                        </TouchableOpacity>
                    </Card>
                </View>

                {/* Legal */}
                <View style={styles.section}>
                    <Text style={[styles.sectionTitle, { color: sectionText }]}>
                        Legal
                    </Text>
                    <Card variant="solid" style={[styles.card, { backgroundColor: cardBg, borderColor }]}>
                        <TouchableOpacity
                            style={[styles.settingRow, styles.borderBottom, { borderBottomColor: borderColor }]}
                            onPress={() => openUrl('https://edutu.org/privacy')}
                        >
                            <View style={styles.settingLeft}>
                                <View style={[styles.iconContainer, { backgroundColor: 'rgba(59,130,246,0.1)' }]}>
                                    <Shield size={20} color="#3b82f6" />
                                </View>
                                <View>
                                    <Text style={[styles.settingLabel, { color: textPrimary }]}>Privacy Policy</Text>
                                    <Text style={[styles.settingDesc, { color: textSecondary }]}>How we handle your data</Text>
                                </View>
                            </View>
                            <ExternalLink size={16} color={textSecondary} />
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={styles.settingRow}
                            onPress={() => openUrl('https://edutu.org/terms')}
                        >
                            <View style={styles.settingLeft}>
                                <View style={[styles.iconContainer, { backgroundColor: 'rgba(59,130,246,0.1)' }]}>
                                    <Lock size={20} color="#3b82f6" />
                                </View>
                                <View>
                                    <Text style={[styles.settingLabel, { color: textPrimary }]}>Terms of Service</Text>
                                    <Text style={[styles.settingDesc, { color: textSecondary }]}>User agreement & policies</Text>
                                </View>
                            </View>
                            <ExternalLink size={16} color={textSecondary} />
                        </TouchableOpacity>
                    </Card>
                </View>

                {/* Danger Zone */}
                <View style={styles.section}>
                    <Text style={[styles.sectionTitle, { color: '#ef4444' }]}>
                        Danger Zone
                    </Text>
                    <TouchableOpacity
                        style={[styles.dangerBtn, { backgroundColor: isDark ? 'rgba(239,68,68,0.1)' : 'rgba(239,68,68,0.05)' }]}
                        onPress={handleDeleteAccount}
                    >
                        <Text style={[styles.dangerBtnText, { color: '#ef4444' }]}>Delete Account</Text>
                    </TouchableOpacity>
                </View>

                <TouchableOpacity
                    style={[styles.helpBtn, { backgroundColor: cardBg, borderColor }]
                    }
                    onPress={() => router.push('/help')}
                >
                    <Zap size={14} color={colors.accent} style={{ marginRight: 8 }} />
                    <Text style={[styles.helpText, { color: textSecondary }]}>Help Center</Text>
                </TouchableOpacity>
            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    scrollView: {
        flex: 1,
    },
    scrollContent: {
        paddingHorizontal: 20,
        paddingTop: 20,
        paddingBottom: 120,
    },
    section: {
        marginBottom: 32,
    },
    sectionTitle: {
        fontSize: 11,
        fontWeight: '900',
        textTransform: 'uppercase',
        letterSpacing: 2,
        marginLeft: 4,
        marginBottom: 16,
    },
    subTitle: {
        fontSize: 11,
        fontWeight: '700',
        textTransform: 'uppercase',
        letterSpacing: 1,
        marginLeft: 4,
        marginBottom: 12,
    },
    card: {
        padding: 4,
    },
    settingRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: 12,
        paddingHorizontal: 16,
    },
    borderBottom: {
        borderBottomWidth: 1,
    },
    settingLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        flex: 1,
    },
    iconContainer: {
        width: 40,
        height: 40,
        borderRadius: 10,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 14,
    },
    settingLabel: {
        fontSize: 15,
        fontWeight: '600',
    },
    settingDesc: {
        fontSize: 12,
        marginTop: 2,
    },
    passwordSetup: {
        paddingHorizontal: 16,
        paddingVertical: 14,
        gap: 10,
    },
    passwordSetupTitle: {
        fontSize: 14,
        fontWeight: '800',
    },
    passwordSetupDesc: {
        fontSize: 12,
        lineHeight: 18,
    },
    passwordInput: {
        height: 48,
        borderRadius: 12,
        borderWidth: 1,
        paddingHorizontal: 14,
        fontSize: 14,
    },
    passwordButton: {
        height: 46,
        borderRadius: 999,
        backgroundColor: '#2563EB',
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: 2,
    },
    passwordButtonDisabled: {
        opacity: 0.55,
    },
    passwordButtonText: {
        color: '#FFFFFF',
        fontSize: 14,
        fontWeight: '800',
    },
    systemBadge: {
        paddingHorizontal: 12,
        paddingVertical: 7,
        borderRadius: 999,
    },
    systemBadgeText: {
        fontSize: 12,
        fontWeight: '800',
    },
    themeScroll: {
        marginBottom: 8,
    },
    themeItem: {
        marginRight: 12,
    },
    themeCard: {
        padding: 16,
        alignItems: 'center',
        width: 110,
        borderWidth: 2,
    },
    themeCircle: {
        width: 40,
        height: 40,
        borderRadius: 20,
        marginBottom: 10,
        position: 'relative',
    },
    themeInner: {
        width: 16,
        height: 16,
        borderRadius: 8,
        backgroundColor: 'rgba(255,255,255,0.3)',
        position: 'absolute',
        top: 8,
        left: 8,
    },
    themeName: {
        fontSize: 11,
        fontWeight: '600',
        textAlign: 'center',
    },
    helpBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 16,
        borderRadius: 16,
        borderWidth: 1,
        marginBottom: 20,
    },
    helpText: {
        fontSize: 11,
        fontWeight: '900',
        textTransform: 'uppercase',
        letterSpacing: 2,
    },
    dangerBtn: {
        paddingVertical: 16,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: '#ef444433',
        alignItems: 'center',
    },
    dangerBtnText: {
        fontSize: 15,
        fontWeight: '600',
    },
});
