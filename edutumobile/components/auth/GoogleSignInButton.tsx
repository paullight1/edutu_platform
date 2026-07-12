import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import * as AuthSession from 'expo-auth-session';
import { useSSO } from '@clerk/clerk-expo';
import Svg, { Path } from 'react-native-svg';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../context/ThemeContext';

WebBrowser.maybeCompleteAuthSession();

function GoogleLogo({ size = 18 }: { size?: number }) {
    return (
        <Svg width={size} height={size} viewBox="0 0 48 48">
            <Path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
            <Path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
            <Path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
            <Path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
        </Svg>
    );
}

/**
 * "Continue with Google" button backed by Clerk SSO. Renders its own
 * "or" divider so auth screens can drop it below their primary button.
 * On success it only activates the session — the root layout's auth
 * routing takes over from there, same as the password flow.
 */
export function GoogleSignInButton({ onError }: { onError?: (message: string) => void }) {
    const { t } = useTranslation('auth');
    const { colors } = useTheme();
    const { startSSOFlow } = useSSO();
    const [loading, setLoading] = useState(false);

    // Warming the browser shaves noticeable latency off the OAuth popup on Android.
    useEffect(() => {
        void WebBrowser.warmUpAsync();
        return () => {
            void WebBrowser.coolDownAsync();
        };
    }, []);

    const onPress = useCallback(async () => {
        if (loading) return;
        setLoading(true);
        try {
            const { createdSessionId, setActive } = await startSSOFlow({
                strategy: 'oauth_google',
                redirectUrl: AuthSession.makeRedirectUri(),
            });

            if (createdSessionId && setActive) {
                await setActive({ session: createdSessionId });
                return;
            }

            // No session means Clerk needs more info (e.g. a required field the
            // Google profile doesn't carry) or the user closed the browser.
            onError?.(t('google.incomplete', {
                defaultValue: 'Google sign-in was not completed. Try again or use your email and password.',
            }));
        } catch (err: any) {
            if (err?.code === 'ERR_WEB_BROWSER_CANCELLED' || err?.errors?.[0]?.code === 'session_exists') {
                return;
            }
            onError?.(
                err?.errors?.[0]?.longMessage ||
                err?.errors?.[0]?.message ||
                t('google.failed', { defaultValue: 'Google sign-in failed. Try again.' }),
            );
        } finally {
            setLoading(false);
        }
    }, [loading, startSSOFlow, onError, t]);

    return (
        <View>
            <View style={styles.dividerRow}>
                <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
                <Text style={[styles.dividerText, { color: colors.textSecondary }]}>
                    {t('google.divider', { defaultValue: 'or' })}
                </Text>
                <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
            </View>
            <Pressable
                onPress={() => void onPress()}
                disabled={loading}
                style={[styles.button, { backgroundColor: colors.card, borderColor: colors.border }, loading && styles.disabled]}
                accessibilityRole="button"
                accessibilityLabel={t('google.continue', { defaultValue: 'Continue with Google' })}
            >
                {loading ? <ActivityIndicator size="small" color={colors.textSecondary} /> : <GoogleLogo />}
                <Text style={[styles.buttonText, { color: colors.foreground }]}>
                    {t('google.continue', { defaultValue: 'Continue with Google' })}
                </Text>
            </Pressable>
        </View>
    );
}

const styles = StyleSheet.create({
    dividerRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        marginVertical: 16,
    },
    dividerLine: {
        flex: 1,
        height: StyleSheet.hairlineWidth,
    },
    dividerText: {
        fontSize: 12,
        fontWeight: '600',
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },
    button: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
        borderRadius: 999,
        borderWidth: 1,
        paddingVertical: 14,
    },
    buttonText: {
        fontSize: 15,
        fontWeight: '600',
    },
    disabled: {
        opacity: 0.6,
    },
});
