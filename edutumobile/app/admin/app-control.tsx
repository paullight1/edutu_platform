import React, { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    ScrollView,
    StyleSheet,
    Switch,
    Text,
    TextInput,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '@clerk/clerk-expo';
import Constants from 'expo-constants';
import {
    MonitorSmartphone,
    Rocket,
    Save,
    ShieldAlert,
    ToggleLeft,
    Wrench,
} from 'lucide-react-native';
import { requestProductApi } from '@edutu/core/src/services/productApi';
import { ScreenHeader } from '../../components/ui/ScreenHeader';
import { Card } from '../../components/ui/Card';
import { AnimatedPressable } from '../../components/ui/AnimatedPressable';
import { BrandedLoader } from '../../components/ui/BrandedLoader';
import { AdminGuard } from '../../components/auth/AdminGuard';
import { useTheme } from '../../components/context/ThemeContext';
import {
    LOCKABLE_MODULES,
    OPEN_APP_CONTROL,
    type AppControlConfig,
    type ModuleAccess,
} from '../../lib/appControl';

// Admin console for remote app control: trigger a forced upgrade, flip
// maintenance lockout, or lock feature modules to Pro / off entirely.
// State lives in admin_settings.mobileApp (GET/PUT /admin/settings); the app
// reads it from the public /mobile-control/config payload at launch and on
// foreground, so changes reach users without any store release.

interface AdminSettingsPayload {
    success: boolean;
    settings: Record<string, unknown> & { mobileApp?: AppControlConfig };
    error?: string;
}

const ACCESS_OPTIONS: Array<{ value: ModuleAccess; label: string; color: string }> = [
    { value: 'free', label: 'Free', color: '#10B981' },
    { value: 'pro', label: 'Pro', color: '#F59E0B' },
    { value: 'disabled', label: 'Off', color: '#EF4444' },
];

function AppControlAdminContent() {
    const { getToken } = useAuth();
    const { colors, isDark } = useTheme();

    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [fullSettings, setFullSettings] = useState<Record<string, unknown> | null>(null);
    const [control, setControl] = useState<AppControlConfig>(OPEN_APP_CONTROL);

    const textPrimary = colors.foreground;
    const textSecondary = isDark ? '#94A3B8' : '#64748B';
    const inputBg = isDark ? 'rgba(255,255,255,0.05)' : '#F8FAFC';
    const inputBorder = isDark ? 'rgba(255,255,255,0.10)' : '#E2E8F0';

    // Loading starts true and the effect-local loader only sets state after
    // the await, so nothing is set synchronously during the effect.
    useEffect(() => {
        const load = async () => {
            const response = await requestProductApi<AdminSettingsPayload>(
                '/admin/settings',
                {},
                getToken,
            );
            if (response?.settings) {
                setFullSettings(response.settings);
                const mobileApp = response.settings.mobileApp;
                setControl({
                    forceUpdate: { ...OPEN_APP_CONTROL.forceUpdate, ...(mobileApp?.forceUpdate ?? {}) },
                    maintenance: { ...OPEN_APP_CONTROL.maintenance, ...(mobileApp?.maintenance ?? {}) },
                    moduleLocks: mobileApp?.moduleLocks ?? {},
                    // This screen doesn't edit the server-driven layout / custom
                    // features / reveal flags (managed in the web admin). Keep
                    // them empty here and preserve the stored values on save.
                    featureFlags: {},
                    homeLayout: [],
                    customFeatures: [],
                });
            } else {
                Alert.alert('Error', 'Could not load app control settings. Check your connection and admin access.');
            }
            setLoading(false);
        };
        void load();
    }, [getToken]);

    const handleSave = async () => {
        if (!fullSettings) return;
        if (control.forceUpdate.enabled && !/^\d+(\.\d+){0,3}$/.test(control.forceUpdate.minVersion.trim())) {
            Alert.alert('Invalid version', 'Minimum version must look like 1.2.3');
            return;
        }
        setSaving(true);
        // Preserve the server-driven layout / custom features / reveal flags
        // exactly as stored — the client-side `control` holds only the flattened
        // published view of those, which must never be written back over the
        // full {draft, published, lastPublished} settings shape.
        const storedMobileApp =
            (fullSettings.mobileApp as Record<string, unknown> | undefined) ?? {};
        const payload = {
            ...fullSettings,
            mobileApp: {
                ...storedMobileApp,
                forceUpdate: {
                    ...control.forceUpdate,
                    minVersion: control.forceUpdate.minVersion.trim(),
                },
                maintenance: control.maintenance,
                moduleLocks: control.moduleLocks,
            },
        };
        const response = await requestProductApi<AdminSettingsPayload>(
            '/admin/settings',
            { method: 'PUT', body: JSON.stringify(payload) },
            getToken,
        );
        setSaving(false);
        if (response?.success) {
            Alert.alert('Saved', 'App control settings are live. Apps pick them up on next launch or foreground.');
        } else {
            Alert.alert('Error', response?.error || 'Settings could not be saved.');
        }
    };

    const setForceUpdate = <K extends keyof AppControlConfig['forceUpdate']>(
        key: K,
        value: AppControlConfig['forceUpdate'][K],
    ) => setControl((prev) => ({ ...prev, forceUpdate: { ...prev.forceUpdate, [key]: value } }));

    const setMaintenance = <K extends keyof AppControlConfig['maintenance']>(
        key: K,
        value: AppControlConfig['maintenance'][K],
    ) => setControl((prev) => ({ ...prev, maintenance: { ...prev.maintenance, [key]: value } }));

    const setModuleLock = (moduleKey: string, access: ModuleAccess) =>
        setControl((prev) => {
            const moduleLocks = { ...prev.moduleLocks };
            if (access === 'free') delete moduleLocks[moduleKey];
            else moduleLocks[moduleKey] = access;
            return { ...prev, moduleLocks };
        });

    const renderInput = (
        label: string,
        value: string,
        onChange: (v: string) => void,
        placeholder?: string,
        multiline = false,
    ) => (
        <View style={styles.inputBlock}>
            <Text style={[styles.inputLabel, { color: textSecondary }]}>{label}</Text>
            <TextInput
                style={[
                    styles.input,
                    multiline && styles.inputMultiline,
                    { color: textPrimary, backgroundColor: inputBg, borderColor: inputBorder },
                ]}
                value={value}
                onChangeText={onChange}
                placeholder={placeholder}
                placeholderTextColor={textSecondary}
                autoCapitalize="none"
                multiline={multiline}
            />
        </View>
    );

    if (loading) {
        return (
            <View style={styles.loadingContainer}>
                <BrandedLoader label="Loading app control…" />
            </View>
        );
    }

    return (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
            {/* Force update */}
            <Card variant="solid" style={styles.sectionCard}>
                <View style={styles.sectionHeader}>
                    <View style={[styles.sectionIcon, { backgroundColor: 'rgba(99,102,241,0.12)' }]}>
                        <Rocket size={18} color="#6366F1" />
                    </View>
                    <View style={{ flex: 1 }}>
                        <Text style={[styles.sectionTitle, { color: textPrimary }]}>Force update</Text>
                        <Text style={[styles.sectionDesc, { color: textSecondary }]}>
                            Block versions older than the minimum until users update. OTA-first tries an instant
                            over-the-air update before sending them to the store.
                        </Text>
                    </View>
                    <Switch
                        value={control.forceUpdate.enabled}
                        onValueChange={(v) => setForceUpdate('enabled', v)}
                    />
                </View>
                {control.forceUpdate.enabled && (
                    <View style={styles.sectionBody}>
                        {renderInput('Minimum version', control.forceUpdate.minVersion, (v) => setForceUpdate('minVersion', v), 'e.g. 1.2.0')}
                        <Text style={[styles.hint, { color: textSecondary }]}>
                            This build: {Constants.expoConfig?.version ?? 'unknown'}
                        </Text>
                        {renderInput('Title', control.forceUpdate.title, (v) => setForceUpdate('title', v))}
                        {renderInput('Message', control.forceUpdate.message, (v) => setForceUpdate('message', v), undefined, true)}
                        {renderInput('Android store URL', control.forceUpdate.androidStoreUrl, (v) => setForceUpdate('androidStoreUrl', v), 'https://play.google.com/…')}
                        {renderInput('iOS store URL', control.forceUpdate.iosStoreUrl, (v) => setForceUpdate('iosStoreUrl', v), 'https://apps.apple.com/…')}
                        <View style={styles.switchRow}>
                            <Text style={[styles.switchLabel, { color: textPrimary }]}>Try OTA update first</Text>
                            <Switch
                                value={control.forceUpdate.otaFirst}
                                onValueChange={(v) => setForceUpdate('otaFirst', v)}
                            />
                        </View>
                    </View>
                )}
            </Card>

            {/* Maintenance */}
            <Card variant="solid" style={styles.sectionCard}>
                <View style={styles.sectionHeader}>
                    <View style={[styles.sectionIcon, { backgroundColor: 'rgba(245,158,11,0.12)' }]}>
                        <Wrench size={18} color="#F59E0B" />
                    </View>
                    <View style={{ flex: 1 }}>
                        <Text style={[styles.sectionTitle, { color: textPrimary }]}>Maintenance lockout</Text>
                        <Text style={[styles.sectionDesc, { color: textSecondary }]}>
                            Blocks the entire app with a message. Admin accounts bypass the gate, so you can
                            always come back here and switch it off.
                        </Text>
                    </View>
                    <Switch
                        value={control.maintenance.enabled}
                        onValueChange={(v) => setMaintenance('enabled', v)}
                    />
                </View>
                {control.maintenance.enabled && (
                    <View style={styles.sectionBody}>
                        {renderInput('Title', control.maintenance.title, (v) => setMaintenance('title', v))}
                        {renderInput('Message', control.maintenance.message, (v) => setMaintenance('message', v), undefined, true)}
                        <View style={[styles.warningRow, { backgroundColor: 'rgba(239,68,68,0.08)' }]}>
                            <ShieldAlert size={16} color="#EF4444" />
                            <Text style={[styles.warningText, { color: '#EF4444' }]}>
                                Every non-admin user is locked out while this is on.
                            </Text>
                        </View>
                    </View>
                )}
            </Card>

            {/* Module locks */}
            <Card variant="solid" style={styles.sectionCard}>
                <View style={styles.sectionHeader}>
                    <View style={[styles.sectionIcon, { backgroundColor: 'rgba(16,185,129,0.12)' }]}>
                        <ToggleLeft size={18} color="#10B981" />
                    </View>
                    <View style={{ flex: 1 }}>
                        <Text style={[styles.sectionTitle, { color: textPrimary }]}>Module locks</Text>
                        <Text style={[styles.sectionDesc, { color: textSecondary }]}>
                            Free = everyone. Pro = paywalled (non-Pro users see an upgrade prompt). Off = module
                            hidden behind an &quot;unavailable&quot; notice for everyone.
                        </Text>
                    </View>
                </View>
                <View style={styles.sectionBody}>
                    {Object.entries(LOCKABLE_MODULES).map(([key, def]) => {
                        const current: ModuleAccess = control.moduleLocks[key] ?? 'free';
                        return (
                            <View key={key} style={[styles.moduleRow, { borderBottomColor: inputBorder }]}>
                                <View style={{ flex: 1 }}>
                                    <Text style={[styles.moduleLabel, { color: textPrimary }]}>{def.label}</Text>
                                    <Text style={[styles.moduleKey, { color: textSecondary }]}>{def.prefixes.join('  ')}</Text>
                                </View>
                                <View style={styles.segment}>
                                    {ACCESS_OPTIONS.map((option) => {
                                        const active = current === option.value;
                                        return (
                                            <AnimatedPressable
                                                key={option.value}
                                                onPress={() => setModuleLock(key, option.value)}
                                                hapticFeedback="light"
                                                style={[
                                                    styles.segmentOption,
                                                    {
                                                        backgroundColor: active ? `${option.color}22` : 'transparent',
                                                        borderColor: active ? option.color : inputBorder,
                                                    },
                                                ]}
                                            >
                                                <Text
                                                    style={[
                                                        styles.segmentText,
                                                        { color: active ? option.color : textSecondary },
                                                    ]}
                                                >
                                                    {option.label}
                                                </Text>
                                            </AnimatedPressable>
                                        );
                                    })}
                                </View>
                            </View>
                        );
                    })}
                </View>
            </Card>

            <AnimatedPressable onPress={handleSave} disabled={saving} style={styles.saveButtonWrapper} hapticFeedback="medium">
                <View style={styles.saveButton}>
                    {saving ? (
                        <ActivityIndicator color="#FFFFFF" size="small" />
                    ) : (
                        <>
                            <Save size={18} color="#FFFFFF" />
                            <Text style={styles.saveButtonText}>Publish changes</Text>
                        </>
                    )}
                </View>
            </AnimatedPressable>

            <View style={styles.footerNote}>
                <MonitorSmartphone size={14} color={textSecondary} />
                <Text style={[styles.footerNoteText, { color: textSecondary }]}>
                    Changes go live via /mobile-control/config — apps apply them on next launch or when
                    returning to the foreground. No store release needed.
                </Text>
            </View>
        </ScrollView>
    );
}

export default function AppControlAdminScreen() {
    const { colors } = useTheme();
    return (
        <AdminGuard>
            <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top', 'left', 'right']}>
                <ScreenHeader title="App Control" showBack subtitle="Force updates, maintenance & module locks" />
                <AppControlAdminContent />
            </SafeAreaView>
        </AdminGuard>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    scrollContent: { padding: 20, paddingBottom: 60, gap: 16 },

    sectionCard: { borderRadius: 16, padding: 16 },
    sectionHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
    sectionIcon: {
        width: 36,
        height: 36,
        borderRadius: 10,
        alignItems: 'center',
        justifyContent: 'center',
    },
    sectionTitle: { fontSize: 15, fontWeight: '700' },
    sectionDesc: { fontSize: 12, lineHeight: 17, marginTop: 3 },
    sectionBody: { marginTop: 14, gap: 12 },

    inputBlock: { gap: 6 },
    inputLabel: {
        fontSize: 10,
        fontWeight: '600',
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },
    input: {
        borderWidth: 1,
        borderRadius: 12,
        paddingHorizontal: 12,
        paddingVertical: 10,
        fontSize: 14,
    },
    inputMultiline: { minHeight: 72, textAlignVertical: 'top' },
    hint: { fontSize: 11, marginTop: -6 },

    switchRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    switchLabel: { fontSize: 14, fontWeight: '600' },

    warningRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        padding: 10,
        borderRadius: 10,
    },
    warningText: { fontSize: 12, fontWeight: '600', flex: 1 },

    moduleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 10,
        borderBottomWidth: 1,
        gap: 10,
    },
    moduleLabel: { fontSize: 14, fontWeight: '600' },
    moduleKey: { fontSize: 11, marginTop: 2 },
    segment: { flexDirection: 'row', gap: 6 },
    segmentOption: {
        paddingHorizontal: 12,
        paddingVertical: 7,
        borderRadius: 10,
        borderWidth: 1,
    },
    segmentText: { fontSize: 12, fontWeight: '700' },

    saveButtonWrapper: {
        borderRadius: 16,
        overflow: 'hidden',
        marginTop: 4,
    },
    saveButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
        paddingVertical: 16,
        backgroundColor: '#6366F1',
        borderRadius: 16,
    },
    saveButtonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },

    footerNote: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 8,
        paddingHorizontal: 4,
    },
    footerNoteText: { fontSize: 11, lineHeight: 16, flex: 1 },
});
