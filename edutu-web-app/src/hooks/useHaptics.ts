import { useCallback } from 'react';
import { Capacitor } from '@capacitor/core';

// Conditionally import haptics only on native platforms. The plugin ships its
// own types, so borrow them from the dynamic import rather than reaching for
// `any` — ImpactStyle/NotificationType are enums, hence the typeof.
type HapticsModule = typeof import('@capacitor/haptics');

let Haptics: HapticsModule['Haptics'] | null = null;
let ImpactStyle: HapticsModule['ImpactStyle'] | null = null;
let NotificationType: HapticsModule['NotificationType'] | null = null;

// Dynamic import for haptics
if (Capacitor.isNativePlatform()) {
    import('@capacitor/haptics').then((module) => {
        Haptics = module.Haptics;
        ImpactStyle = module.ImpactStyle;
        NotificationType = module.NotificationType;
    }).catch(() => {
        console.warn('Haptics not available');
    });
}

type HapticImpactStyle = 'light' | 'medium' | 'heavy';
type HapticNotificationType = 'success' | 'warning' | 'error';

/**
 * useHaptics Hook
 * 
 * Provides haptic feedback functionality for native mobile apps.
 * Falls back gracefully on web.
 */
export function useHaptics() {
    const isNative = Capacitor.isNativePlatform();

    /**
     * Trigger an impact haptic feedback
     * @param style - 'light' | 'medium' | 'heavy'
     */
    const impact = useCallback(async (style: HapticImpactStyle = 'medium') => {
        // ImpactStyle lands in the same dynamic import as Haptics, so checking
        // it too both satisfies the types and rules out calling impact() with
        // an undefined style if that import has not resolved yet.
        if (!isNative || !Haptics || !ImpactStyle) return;

        try {
            const impactStyleMap: Record<
                HapticImpactStyle,
                HapticsModule['ImpactStyle'][keyof HapticsModule['ImpactStyle']]
            > = {
                light: ImpactStyle.Light,
                medium: ImpactStyle.Medium,
                heavy: ImpactStyle.Heavy
            };

            await Haptics.impact({ style: impactStyleMap[style] });
        } catch (error) {
            console.warn('Haptic feedback not available:', error);
        }
    }, [isNative]);

    /**
     * Trigger a notification haptic feedback
     * @param type - 'success' | 'warning' | 'error'
     */
    const notification = useCallback(async (type: HapticNotificationType = 'success') => {
        // Same reasoning as impact(): NotificationType arrives with Haptics.
        if (!isNative || !Haptics || !NotificationType) return;

        try {
            const notificationTypeMap: Record<
                HapticNotificationType,
                HapticsModule['NotificationType'][keyof HapticsModule['NotificationType']]
            > = {
                success: NotificationType.Success,
                warning: NotificationType.Warning,
                error: NotificationType.Error
            };

            await Haptics.notification({ type: notificationTypeMap[type] });
        } catch (error) {
            console.warn('Haptic notification not available:', error);
        }
    }, [isNative]);

    /**
     * Trigger a vibrate haptic feedback
     * @param duration - Vibration duration in milliseconds (default: 300ms)
     */
    const vibrate = useCallback(async (duration: number = 300) => {
        if (!isNative || !Haptics) return;

        try {
            await Haptics.vibrate({ duration });
        } catch (error) {
            console.warn('Vibration not available:', error);
        }
    }, [isNative]);

    /**
     * Trigger a selection changed haptic feedback
     */
    const selectionChanged = useCallback(async () => {
        if (!isNative || !Haptics) return;

        try {
            await Haptics.selectionChanged();
        } catch (error) {
            console.warn('Selection haptic not available:', error);
        }
    }, [isNative]);

    /**
     * Trigger selection start haptic
     */
    const selectionStart = useCallback(async () => {
        if (!isNative || !Haptics) return;

        try {
            await Haptics.selectionStart();
        } catch (error) {
            console.warn('Selection start haptic not available:', error);
        }
    }, [isNative]);

    /**
     * Trigger selection end haptic
     */
    const selectionEnd = useCallback(async () => {
        if (!isNative || !Haptics) return;

        try {
            await Haptics.selectionEnd();
        } catch (error) {
            console.warn('Selection end haptic not available:', error);
        }
    }, [isNative]);

    return {
        isNative,
        impact,
        notification,
        vibrate,
        selectionChanged,
        selectionStart,
        selectionEnd,
        // Convenience methods
        light: useCallback(() => impact('light'), [impact]),
        medium: useCallback(() => impact('medium'), [impact]),
        heavy: useCallback(() => impact('heavy'), [impact]),
        success: useCallback(() => notification('success'), [notification]),
        warning: useCallback(() => notification('warning'), [notification]),
        error: useCallback(() => notification('error'), [notification])
    };
}

export default useHaptics;
