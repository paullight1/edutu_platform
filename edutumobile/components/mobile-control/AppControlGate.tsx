import React, { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Linking,
    Platform,
    StyleSheet,
    Text,
    View,
} from 'react-native';
import Constants from 'expo-constants';
import * as Updates from 'expo-updates';
import { useUser } from '@clerk/clerk-expo';
import { RefreshCw, Rocket, Wrench } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { isVersionBelow } from '../../lib/appControl';
import { isAdminUser } from '../../lib/auth';
import { supabase } from '../../lib/supabase';
import { useTheme } from '../context/ThemeContext';
import { useAppControl } from '../context/AppControlContext';
import { AnimatedPressable } from '../ui/AnimatedPressable';

// Full-screen, non-dismissible gate rendered above the whole app. Two modes,
// both admin-triggered via admin_settings.mobileApp:
//  - maintenance: hard lockout with a retry button.
//  - forceUpdate: blocks versions below minVersion; "Update now" tries an OTA
//    update first (when otaFirst) and falls back to the store listing.
// Admins bypass both gates (with a warning strip) so they can always reach
// the in-app App Control screen to turn a gate off again.

function getInstalledVersion(): string | null {
    return Constants.expoConfig?.version ?? null;
}

export function AppControlGate() {
    const { appControl, refresh } = useAppControl();
    const { colors, isDark } = useTheme();
    const { user } = useUser();
    const { t } = useTranslation('misc');
    const [isAdmin, setIsAdmin] = useState(false);
    const [busy, setBusy] = useState(false);

    const maintenance = appControl?.maintenance;
    const forceUpdate = appControl?.forceUpdate;

    const maintenanceActive = maintenance?.enabled === true;
    const updateRequired =
        forceUpdate?.enabled === true &&
        isVersionBelow(getInstalledVersion(), forceUpdate.minVersion);
    const gateActive = maintenanceActive || updateRequired;

    const userId = user?.id;
    useEffect(() => {
        let cancelled = false;
        // No synchronous reset here — the ineligible case is derived at
        // render below, so the effect only ever fetches.
        if (!gateActive || !userId) return;
        isAdminUser(supabase, userId)
            .then((allowed) => {
                if (!cancelled) setIsAdmin(allowed);
            })
            .catch(() => {
                if (!cancelled) setIsAdmin(false);
            });
        return () => {
            cancelled = true;
        };
    }, [gateActive, userId]);
    // Derived: the admin bypass only means anything while the gate is up for
    // a signed-in user. (The state may keep a stale true from a previous
    // gate, but it is unreadable until eligibility returns, and the effect
    // refetches at that point.)
    const adminBypass = gateActive && !!userId && isAdmin;

    if (!gateActive) return null;

    if (adminBypass) {
        return (
            <View style={styles.adminStrip} pointerEvents="none">
                <Text style={styles.adminStripText}>
                    {maintenanceActive
                        ? t('appControl.adminBypassMaintenance', 'Maintenance mode is ON — admins bypass this gate')
                        : t('appControl.adminBypassUpdate', 'Force update is ON — admins bypass this gate')}
                </Text>
            </View>
        );
    }

    const handleUpdatePress = async () => {
        if (!forceUpdate) return;
        setBusy(true);
        try {
            // OTA first: if the fix already shipped over expo-updates, one tap
            // reloads straight into it — no store round-trip.
            if (forceUpdate.otaFirst && Updates.isEnabled) {
                try {
                    const update = await Updates.checkForUpdateAsync();
                    if (update.isAvailable) {
                        const fetched = await Updates.fetchUpdateAsync();
                        if (fetched.isNew || fetched.isRollBackToEmbedded) {
                            await Updates.reloadAsync();
                            return;
                        }
                    }
                } catch {
                    // Fall through to the store link.
                }
            }

            const storeUrl =
                Platform.OS === 'ios'
                    ? forceUpdate.iosStoreUrl
                    : forceUpdate.androidStoreUrl;
            if (storeUrl) {
                await Linking.openURL(storeUrl);
            } else {
                Alert.alert(
                    t('appControl.updateFallbackTitle', 'Update Edutu'),
                    t(
                        'appControl.updateFallbackMessage',
                        'Please install the latest version of Edutu from your app store.',
                    ),
                );
            }
        } finally {
            setBusy(false);
        }
    };

    const handleRetryPress = async () => {
        setBusy(true);
        try {
            await refresh();
        } finally {
            setBusy(false);
        }
    };

    const title = maintenanceActive
        ? maintenance?.title || t('appControl.maintenanceTitle', "We'll be right back")
        : forceUpdate?.title || t('appControl.updateTitle', 'Update required');
    const message = maintenanceActive
        ? maintenance?.message ||
          t('appControl.maintenanceMessage', 'Edutu is undergoing scheduled maintenance. Please check back shortly.')
        : forceUpdate?.message ||
          t('appControl.updateMessage', 'This version of Edutu is no longer supported. Please update to keep going.');

    const Icon = maintenanceActive ? Wrench : Rocket;

    return (
        <View style={[styles.overlay, { backgroundColor: colors.background }]}>
            <View style={[styles.iconCircle, { backgroundColor: isDark ? 'rgba(99,102,241,0.16)' : 'rgba(99,102,241,0.10)' }]}>
                <Icon size={34} color="#6366F1" />
            </View>
            <Text style={[styles.title, { color: colors.foreground }]}>{title}</Text>
            <Text style={[styles.message, { color: isDark ? '#94A3B8' : '#64748B' }]}>{message}</Text>

            <AnimatedPressable
                onPress={maintenanceActive ? handleRetryPress : handleUpdatePress}
                disabled={busy}
                style={styles.buttonWrapper}
                hapticFeedback="medium"
            >
                <View style={styles.button}>
                    {busy ? (
                        <ActivityIndicator color="#FFFFFF" size="small" />
                    ) : (
                        <>
                            {maintenanceActive ? (
                                <RefreshCw size={18} color="#FFFFFF" />
                            ) : (
                                <Rocket size={18} color="#FFFFFF" />
                            )}
                            <Text style={styles.buttonText}>
                                {maintenanceActive
                                    ? t('appControl.retry', 'Try again')
                                    : t('appControl.updateNow', 'Update now')}
                            </Text>
                        </>
                    )}
                </View>
            </AnimatedPressable>

            {updateRequired && !maintenanceActive ? (
                <Text style={[styles.versionHint, { color: isDark ? '#64748B' : '#94A3B8' }]}>
                    {t('appControl.versionHint', 'Installed version {{current}} · required {{min}}', {
                        current: getInstalledVersion() ?? '?',
                        min: forceUpdate?.minVersion ?? '?',
                    })}
                </Text>
            ) : null}
        </View>
    );
}

const styles = StyleSheet.create({
    overlay: {
        ...StyleSheet.absoluteFillObject,
        zIndex: 9999,
        elevation: 9999,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 32,
    },
    iconCircle: {
        width: 84,
        height: 84,
        borderRadius: 42,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 24,
    },
    title: {
        fontSize: 22,
        fontWeight: '800',
        textAlign: 'center',
        marginBottom: 12,
    },
    message: {
        fontSize: 15,
        lineHeight: 22,
        textAlign: 'center',
        marginBottom: 32,
    },
    buttonWrapper: {
        borderRadius: 16,
        overflow: 'hidden',
        alignSelf: 'stretch',
    },
    button: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
        paddingVertical: 16,
        borderRadius: 16,
        backgroundColor: '#6366F1',
    },
    buttonText: {
        color: '#FFFFFF',
        fontSize: 16,
        fontWeight: '700',
    },
    versionHint: {
        marginTop: 16,
        fontSize: 12,
        textAlign: 'center',
    },
    adminStrip: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 9999,
        elevation: 9999,
        backgroundColor: '#B45309',
        paddingTop: 48,
        paddingBottom: 8,
        paddingHorizontal: 16,
    },
    adminStripText: {
        color: '#FFFFFF',
        fontSize: 12,
        fontWeight: '600',
        textAlign: 'center',
    },
});
