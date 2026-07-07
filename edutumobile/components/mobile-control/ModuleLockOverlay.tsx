import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useRouter, usePathname } from 'expo-router';
import { useUser } from '@clerk/clerk-expo';
import { Crown, Lock, ArrowLeft } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { useProStatus } from '@edutu/core/src/hooks/useProStatus';
import {
    getModuleAccess,
    LOCKABLE_MODULES,
    moduleForPathname,
} from '../../lib/appControl';
import { supabase } from '../../lib/supabase';
import { useTheme } from '../context/ThemeContext';
import { useAppControl } from '../context/AppControlContext';
import { AnimatedPressable } from '../ui/AnimatedPressable';

// Route-level enforcement of admin module locks. Rendered once in the (app)
// layout: watches the current pathname, and when it belongs to a module the
// admin has locked, covers the screen with either a paywall prompt ('pro') or
// an unavailable notice ('disabled'). Central on purpose — no per-screen
// wiring, and deep links / widget links are covered automatically.

export function ModuleLockOverlay() {
    const pathname = usePathname();
    const router = useRouter();
    const { appControl } = useAppControl();
    const { colors, isDark } = useTheme();
    const { user } = useUser();
    const { t } = useTranslation('misc');
    const { isPro, isLoading: proLoading } = useProStatus(supabase, user?.id || null);

    const moduleKey = moduleForPathname(pathname);
    if (!moduleKey || !appControl) return null;

    const access = getModuleAccess(appControl, moduleKey);
    if (access === 'free') return null;
    // Pro members pass a pro lock; while pro status is still resolving we
    // don't flash the gate (fail-open, consistent with the rest of the system).
    if (access === 'pro' && (isPro || proLoading)) return null;

    const moduleLabel = LOCKABLE_MODULES[moduleKey]?.label ?? moduleKey;
    const isProLock = access === 'pro';
    const textSecondary = isDark ? '#94A3B8' : '#64748B';

    return (
        <View style={[styles.overlay, { backgroundColor: colors.background }]}>
            <View
                style={[
                    styles.iconCircle,
                    { backgroundColor: isProLock ? 'rgba(245,158,11,0.14)' : 'rgba(100,116,139,0.14)' },
                ]}
            >
                {isProLock ? (
                    <Crown size={32} color="#F59E0B" />
                ) : (
                    <Lock size={32} color="#64748B" />
                )}
            </View>

            <Text style={[styles.title, { color: colors.foreground }]}>
                {isProLock
                    ? t('appControl.proLockTitle', '{{module}} is a Pro feature', { module: moduleLabel })
                    : t('appControl.disabledTitle', '{{module}} is temporarily unavailable', { module: moduleLabel })}
            </Text>
            <Text style={[styles.message, { color: textSecondary }]}>
                {isProLock
                    ? t('appControl.proLockMessage', 'Upgrade to Edutu Pro to unlock this feature and everything else in the toolkit.')
                    : t('appControl.disabledMessage', "We're improving this part of Edutu. It will be back soon — everything else works as usual.")}
            </Text>

            {isProLock ? (
                <AnimatedPressable
                    onPress={() => router.push('/paywall' as never)}
                    style={styles.primaryButtonWrapper}
                    hapticFeedback="medium"
                >
                    <View style={styles.primaryButton}>
                        <Crown size={18} color="#FFFFFF" />
                        <Text style={styles.primaryButtonText}>
                            {t('appControl.upgradeCta', 'Upgrade to Pro')}
                        </Text>
                    </View>
                </AnimatedPressable>
            ) : null}

            <AnimatedPressable
                onPress={() => {
                    if (router.canGoBack()) router.back();
                    else router.replace('/' as never);
                }}
                style={styles.secondaryButton}
                hapticFeedback="light"
            >
                <ArrowLeft size={16} color={textSecondary} />
                <Text style={[styles.secondaryButtonText, { color: textSecondary }]}>
                    {t('appControl.goBack', 'Go back')}
                </Text>
            </AnimatedPressable>
        </View>
    );
}

const styles = StyleSheet.create({
    overlay: {
        ...StyleSheet.absoluteFillObject,
        zIndex: 9000,
        elevation: 9000,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 32,
    },
    iconCircle: {
        width: 80,
        height: 80,
        borderRadius: 40,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 24,
    },
    title: {
        fontSize: 21,
        fontWeight: '800',
        textAlign: 'center',
        marginBottom: 12,
    },
    message: {
        fontSize: 15,
        lineHeight: 22,
        textAlign: 'center',
        marginBottom: 28,
    },
    primaryButtonWrapper: {
        borderRadius: 16,
        overflow: 'hidden',
        alignSelf: 'stretch',
        marginBottom: 8,
    },
    primaryButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
        paddingVertical: 16,
        borderRadius: 16,
        backgroundColor: '#F59E0B',
    },
    primaryButtonText: {
        color: '#FFFFFF',
        fontSize: 16,
        fontWeight: '700',
    },
    secondaryButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        paddingVertical: 14,
        paddingHorizontal: 20,
    },
    secondaryButtonText: {
        fontSize: 14,
        fontWeight: '600',
    },
});
