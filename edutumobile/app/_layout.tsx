import { Slot } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { ClerkProvider, ClerkLoaded } from "@clerk/clerk-expo";
import { tokenCache } from "../cache";
import { ThemeProvider, useTheme } from "../components/context/ThemeContext";
import { OfflineProvider } from "../components/context/OfflineContext";
import { OfflineBanner } from "../components/ui/OfflineBanner";
import { ErrorBoundary } from "../components/ui/ErrorBoundary";
import { useDeepLink } from "../hooks/useDeepLink";
import { useAuth } from "@clerk/clerk-expo";
import { useEffect, useRef } from "react";
import { AppState, type AppStateStatus, View, Text } from "react-native";
import { setSupabaseAccessTokenGetter } from "../packages/core/src/services/supabase";
import { flushSignalQueue } from "../packages/core/src/services/signalQueue";
import { useInAppUpdatePrompt } from "../lib/updatePrompt";
import { MobileCampaignHost } from "../components/mobile-control/MobileCampaignHost";
import { AppControlGate } from "../components/mobile-control/AppControlGate";
import { AppControlProvider } from "../components/context/AppControlContext";
import { AuthWallProvider } from "../components/context/AuthWallContext";
import { exitGuestMode } from "../lib/guestModeStore";
import { syncWidgetSuite } from "../lib/widgetSuiteSync";
import { registerWidgetBackgroundRefresh } from "../lib/widgetBackgroundTask";
import { getConfig } from "../lib/config";
import { initStoredLanguage } from "../lib/i18n";
import "../widgets";
import "../global.css";

// Resolve required config WITHOUT throwing at module-load time. The previous
// `throw` here ran during the initial import, i.e. before any React error
// boundary exists — so a build that shipped without the embedded env vars
// (e.g. an EAS build whose environment was missing EXPO_PUBLIC_* keys) would
// crash to the launcher on open with no message. Now we surface a readable
// screen instead of a silent crash.
function resolveAppConfig():
    | { ok: true; clerkPublishableKey: string }
    | { ok: false; error: string } {
    try {
        const { clerkPublishableKey } = getConfig();
        if (!clerkPublishableKey) {
            return { ok: false, error: "Missing Clerk publishable key." };
        }
        return { ok: true, clerkPublishableKey };
    } catch (error) {
        return {
            ok: false,
            error: error instanceof Error ? error.message : String(error),
        };
    }
}

// Deliberately self-contained: no theme/router/provider dependencies, so it can
// render even when the app is too misconfigured to boot its providers.
function ConfigErrorScreen({ message }: { message: string }) {
    return (
        <View
            style={{
                flex: 1,
                backgroundColor: "#171a4f",
                alignItems: "center",
                justifyContent: "center",
                padding: 24,
            }}
        >
            <Text
                style={{
                    color: "#ffffff",
                    fontSize: 18,
                    fontWeight: "700",
                    marginBottom: 8,
                    textAlign: "center",
                }}
            >
                Edutu couldn&apos;t start
            </Text>
            <Text
                style={{ color: "#c7cbe6", fontSize: 14, textAlign: "center" }}
            >
                {message}
            </Text>
            <Text
                style={{
                    color: "#8a90c0",
                    fontSize: 12,
                    textAlign: "center",
                    marginTop: 16,
                }}
            >
                This build is missing required configuration. Please install the
                latest version, or contact support if this keeps happening.
            </Text>
        </View>
    );
}

function RootLayoutContent() {
    const { colors, isDark } = useTheme();
    const { getToken, userId, isSignedIn } = useAuth();
    useDeepLink();
    useInAppUpdatePrompt();

    // Once a real Clerk session exists, the visitor is no longer a guest — drop
    // the "browse without login" flag so the app treats them as a normal user
    // (and a returning guest who signs out lands back on the welcome screen).
    useEffect(() => {
        if (isSignedIn) exitGuestMode();
    }, [isSignedIn]);

    useEffect(() => {
        setSupabaseAccessTokenGetter(async () => {
            const supabaseToken = await getToken({ template: 'supabase' }).catch(() => null);
            return supabaseToken || await getToken().catch(() => null);
        });

        return () => setSupabaseAccessTokenGetter(null);
    }, [getToken]);

    useEffect(() => {
        void syncWidgetSuite({ userId: userId || undefined, getToken });
    }, [userId, getToken]);

    // Deliver any behavioral signals that queued while offline / unauthed.
    useEffect(() => {
        if (!userId) return;
        void flushSignalQueue(() => getToken().catch(() => null));
    }, [userId, getToken]);

    // Register the background task once so iOS keeps the widget fresh even when
    // the app isn't opened. No-op in Expo Go / until the next native rebuild.
    useEffect(() => {
        void registerWidgetBackgroundRefresh();
    }, []);

    // Re-sync the home-screen widget every time the app returns to the
    // foreground. Widget snapshots store pre-formatted deadline strings
    // ("Closes today", "3 days left"); without this they'd freeze until the
    // user happened to open Home/Discover, so a countdown could show stale
    // — or a closed opportunity could linger — for days.
    const appState = useRef(AppState.currentState);
    useEffect(() => {
        const subscription = AppState.addEventListener(
            "change",
            (nextState: AppStateStatus) => {
                if (
                    appState.current.match(/inactive|background/) &&
                    nextState === "active"
                ) {
                    void syncWidgetSuite({
                        userId: userId || undefined,
                        getToken,
                    });
                    if (userId) {
                        void flushSignalQueue(() => getToken().catch(() => null));
                    }
                }
                appState.current = nextState;
            },
        );
        return () => subscription.remove();
    }, [userId, getToken]);

    return (
        <ErrorBoundary message="Something went wrong with the app">
            <SafeAreaProvider>
                <OfflineProvider>
                    <AppControlProvider>
                        <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.background }}>
                            <StatusBar style={isDark ? "light" : "dark"} />
                            {/* AuthWallProvider is mounted at the root so guest
                                gating can be raised from anywhere — the home
                                screen, opportunity detail, and the tab chrome. */}
                            <AuthWallProvider>
                                <Slot />
                                <OfflineBanner />
                                <MobileCampaignHost />
                                {/* Last child so the force-update / maintenance gate
                                    covers every screen and overlay above. */}
                                <AppControlGate />
                            </AuthWallProvider>
                        </GestureHandlerRootView>
                    </AppControlProvider>
                </OfflineProvider>
            </SafeAreaProvider>
        </ErrorBoundary>
    );
}

export default function RootLayout() {
    const config = resolveAppConfig();

    // Restore the persisted app language (or device locale on first launch).
    // i18next itself initializes synchronously at import time with English,
    // so this only swaps the active language — safe to fire and forget.
    useEffect(() => {
        void initStoredLanguage();
    }, []);

    // ErrorBoundary is now the OUTERMOST wrapper. Previously it lived inside
    // ClerkProvider/ClerkLoaded/ThemeProvider, so a render-time throw in any of
    // those providers (their child boundary can't catch its own ancestors)
    // escaped uncaught and crashed the app. At the top level it catches them.
    return (
        <ErrorBoundary message="Something went wrong with the app">
            {config.ok ? (
                <ClerkProvider
                    tokenCache={tokenCache}
                    publishableKey={config.clerkPublishableKey}
                >
                    <ClerkLoaded>
                        <ThemeProvider>
                            <RootLayoutContent />
                        </ThemeProvider>
                    </ClerkLoaded>
                </ClerkProvider>
            ) : (
                <ConfigErrorScreen message={config.error} />
            )}
        </ErrorBoundary>
    );
}
