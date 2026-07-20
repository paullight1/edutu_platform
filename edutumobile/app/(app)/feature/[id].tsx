import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
    View,
    Text,
    ActivityIndicator,
    StyleSheet,
    TouchableOpacity,
    Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { RefreshCw } from 'lucide-react-native';
import { ScreenHeader } from '../../../components/ui/ScreenHeader';
import { useTheme } from '../../../components/context/ThemeContext';
import { useAppControl } from '../../../components/context/AppControlContext';
import { findCustomFeature } from '../../../lib/homeBlocks';

/**
 * Renders an admin-defined web-backed feature (the Twitter/X pattern). The
 * feature is looked up by id from the live app-control config, so an admin can
 * add a whole new feature — a page hosted anywhere — without shipping native
 * code. `openMode:'external'` hands off to the system browser and pops back.
 *
 * Fail-safe: while config is still loading we show a spinner; an unknown id or
 * a WebView load error shows a recoverable error state, never a crash.
 */
export default function WebFeatureScreen() {
    const { id } = useLocalSearchParams<{ id: string }>();
    const router = useRouter();
    const { colors } = useTheme();
    const { appControl } = useAppControl();

    const feature = useMemo(
        () => findCustomFeature(appControl?.customFeatures, id),
        [appControl?.customFeatures, id],
    );

    const webRef = useRef<WebView>(null);
    const [loading, setLoading] = useState(true);

    // External features never render a WebView — open the system browser and
    // return to wherever the user came from.
    useEffect(() => {
        if (feature?.openMode !== 'external') return;
        let cancelled = false;
        void WebBrowser.openBrowserAsync(feature.url).catch(() => {
            if (!cancelled) void Linking.openURL(feature.url).catch(() => {});
        });
        if (router.canGoBack()) router.back();
        else router.replace('/(app)');
        return () => {
            cancelled = true;
        };
    }, [feature, router]);

    const goBack = () => {
        if (router.canGoBack()) router.back();
        else router.replace('/(app)');
    };

    // See the WebView usage: this version's WebViewProps type omits renderError,
    // so we pass it through a loosely-typed object spread.
    const errorProps = {
        renderError: () => (
            <View style={[styles.centered, { backgroundColor: colors.background }]}>
                <Text style={[styles.message, { color: colors.foreground }]}>
                    Couldn&apos;t load this page. Check your connection and try again.
                </Text>
                <TouchableOpacity
                    style={[styles.button, { backgroundColor: colors.accent }]}
                    onPress={() => webRef.current?.reload()}
                    activeOpacity={0.8}
                >
                    <RefreshCw size={16} color="#FFFFFF" />
                    <Text style={styles.buttonText}>Retry</Text>
                </TouchableOpacity>
            </View>
        ),
    };

    // Config not resolved yet — hold with a spinner rather than flashing an
    // error for a feature that is about to arrive.
    if (!appControl) {
        return (
            <SafeAreaView
                style={[styles.container, { backgroundColor: colors.background }]}
                edges={['top', 'left', 'right']}
            >
                <ScreenHeader title="" showBack onBack={goBack} />
                <View style={styles.centered}>
                    <ActivityIndicator color={colors.accent} />
                </View>
            </SafeAreaView>
        );
    }

    if (!feature) {
        return (
            <SafeAreaView
                style={[styles.container, { backgroundColor: colors.background }]}
                edges={['top', 'left', 'right']}
            >
                <ScreenHeader title="Not available" showBack onBack={goBack} />
                <View style={styles.centered}>
                    <Text style={[styles.message, { color: colors.foreground }]}>
                        This feature isn&apos;t available right now.
                    </Text>
                    <TouchableOpacity
                        style={[styles.button, { backgroundColor: colors.accent }]}
                        onPress={goBack}
                        activeOpacity={0.8}
                    >
                        <Text style={styles.buttonText}>Go back</Text>
                    </TouchableOpacity>
                </View>
            </SafeAreaView>
        );
    }

    if (feature.openMode === 'external') {
        // The effect is handing off to the browser; render nothing meaningful.
        return (
            <SafeAreaView
                style={[styles.container, { backgroundColor: colors.background }]}
                edges={['top', 'left', 'right']}
            >
                <View style={styles.centered}>
                    <ActivityIndicator color={colors.accent} />
                </View>
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView
            style={[styles.container, { backgroundColor: colors.background }]}
            edges={['top', 'left', 'right']}
        >
            <ScreenHeader
                title={feature.title}
                subtitle={feature.subtitle || undefined}
                showBack
                onBack={goBack}
            />
            <View style={styles.webWrap}>
                <WebView
                    ref={webRef}
                    source={{ uri: feature.url }}
                    onLoadEnd={() => setLoading(false)}
                    style={{ backgroundColor: colors.background }}
                    startInLoadingState={false}
                    // `renderError`/`onError` are real, documented WebView props
                    // but this package version's exported `WebViewProps` type
                    // omits them; spread them in so TS's faulty excess-property
                    // check doesn't reject a runtime-supported prop.
                    {...(errorProps as Record<string, unknown>)}
                />
                {loading && (
                    <View
                        style={[styles.loadingOverlay, { backgroundColor: colors.background }]}
                        pointerEvents="none"
                    >
                        <ActivityIndicator color={colors.accent} />
                    </View>
                )}
            </View>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    webWrap: { flex: 1 },
    centered: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        gap: 16,
    },
    loadingOverlay: {
        ...StyleSheet.absoluteFillObject,
        alignItems: 'center',
        justifyContent: 'center',
    },
    message: {
        fontSize: 15,
        textAlign: 'center',
        lineHeight: 22,
    },
    button: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        paddingHorizontal: 20,
        paddingVertical: 12,
        borderRadius: 12,
    },
    buttonText: {
        color: '#FFFFFF',
        fontWeight: '700',
        fontSize: 15,
    },
});
