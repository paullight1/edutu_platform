import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import * as AuthSession from 'expo-auth-session';
import { useSSO } from '@clerk/clerk-expo';
import Svg, { Path } from 'react-native-svg';
import { useTranslation } from 'react-i18next';

WebBrowser.maybeCompleteAuthSession();

function AppleLogo({ size = 18 }: { size?: number }) {
    return (
        <Svg width={size} height={size * 1.23} viewBox="0 0 814 1000">
            <Path
                fill="#FFFFFF"
                d="M788.1 340.9c-5.8 4.5-108.2 62.2-108.2 190.5 0 148.4 130.3 200.9 134.2 202.2-.6 3.2-20.7 71.9-68.7 141.9-42.8 61.6-87.5 123.1-155.5 123.1s-85.5-39.5-164-39.5c-76.5 0-103.7 40.8-165.2 40.8s-104.9-57-154.8-127C46.7 790.7 0 663 0 541.8c0-194.4 126.4-297.5 250.8-297.5 66.1 0 121.2 43.4 162.7 43.4 39.5 0 101.1-46 176.3-46 28.5 0 130.9 2.6 198.3 99.2zm-234-181.5c31.1-36.9 53.1-88.1 53.1-139.3 0-7.1-.6-14.3-1.9-20.1-50.6 1.9-110.8 33.7-147.1 75.8-28.5 32.4-55.1 83.6-55.1 135.5 0 7.8 1.3 15.6 1.9 18.1 3.2.6 8.4 1.3 13.6 1.3 45.4 0 102.5-30.4 135.5-71.2z"
            />
        </Svg>
    );
}

/**
 * "Continue with Apple" button backed by Clerk SSO. App Store Guideline 4.8
 * requires Sign in with Apple wherever a third-party social login (Google) is
 * offered, so this renders on iOS only and sits alongside the Google button
 * (which already draws the "or" divider — this one intentionally does not).
 * On success it activates the session; the root layout's auth routing takes
 * over, same as the password / Google flows.
 */
export function AppleSignInButton({ onError }: { onError?: (message: string) => void }) {
    const { t } = useTranslation('auth');
    const { startSSOFlow } = useSSO();
    const [loading, setLoading] = useState(false);

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
                strategy: 'oauth_apple',
                redirectUrl: AuthSession.makeRedirectUri(),
            });

            if (createdSessionId && setActive) {
                await setActive({ session: createdSessionId });
                return;
            }

            onError?.(t('apple.incomplete', {
                defaultValue: 'Apple sign-in was not completed. Try again or use your email and password.',
            }));
        } catch (err: any) {
            if (err?.code === 'ERR_WEB_BROWSER_CANCELLED' || err?.errors?.[0]?.code === 'session_exists') {
                return;
            }
            onError?.(
                err?.errors?.[0]?.longMessage ||
                err?.errors?.[0]?.message ||
                t('apple.failed', { defaultValue: 'Apple sign-in failed. Try again.' }),
            );
        } finally {
            setLoading(false);
        }
    }, [loading, startSSOFlow, onError, t]);

    // Sign in with Apple is an iOS requirement; other platforms use Google only.
    if (Platform.OS !== 'ios') return null;

    return (
        <View style={styles.wrap}>
            <Pressable
                onPress={() => void onPress()}
                disabled={loading}
                style={[styles.button, loading && styles.disabled]}
                accessibilityRole="button"
                accessibilityLabel={t('apple.continue', { defaultValue: 'Continue with Apple' })}
            >
                {loading ? <ActivityIndicator size="small" color="#FFFFFF" /> : <AppleLogo />}
                <Text style={styles.buttonText}>
                    {t('apple.continue', { defaultValue: 'Continue with Apple' })}
                </Text>
            </Pressable>
        </View>
    );
}

const styles = StyleSheet.create({
    wrap: {
        marginTop: 12,
    },
    button: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
        borderRadius: 999,
        paddingVertical: 14,
        backgroundColor: '#000000',
    },
    buttonText: {
        fontSize: 15,
        fontWeight: '600',
        color: '#FFFFFF',
    },
    disabled: {
        opacity: 0.6,
    },
});
