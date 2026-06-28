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
import { useEffect } from "react";
import { setSupabaseAccessTokenGetter } from "../packages/core/src/services/supabase";
import { useInAppUpdatePrompt } from "../lib/updatePrompt";
import { MobileCampaignHost } from "../components/mobile-control/MobileCampaignHost";
import { syncAndUpdateOpportunityWidgetSnapshot } from "../lib/opportunityWidgetSync";
import { getConfig } from "../lib/config";
import "../widgets/OpportunityWidget";
import "../global.css";

const PUBLISHABLE_KEY = getConfig().clerkPublishableKey;

if (!PUBLISHABLE_KEY) {
    throw new Error(
        "Missing Publishable Key. Please set EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY in your .env"
    );
}

function RootLayoutContent() {
    const { colors, isDark } = useTheme();
    const { getToken, userId } = useAuth();
    useDeepLink();
    useInAppUpdatePrompt();

    useEffect(() => {
        setSupabaseAccessTokenGetter(async () => {
            const supabaseToken = await getToken({ template: 'supabase' }).catch(() => null);
            return supabaseToken || await getToken().catch(() => null);
        });

        return () => setSupabaseAccessTokenGetter(null);
    }, [getToken]);

    useEffect(() => {
        void syncAndUpdateOpportunityWidgetSnapshot({ userId: userId || undefined });
    }, [userId]);

    return (
        <ErrorBoundary message="Something went wrong with the app">
            <SafeAreaProvider>
                <OfflineProvider>
                    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.background }}>
                        <StatusBar style={isDark ? "light" : "dark"} />
                        <Slot />
                        <OfflineBanner />
                        <MobileCampaignHost />
                    </GestureHandlerRootView>
                </OfflineProvider>
            </SafeAreaProvider>
        </ErrorBoundary>
    );
}

export default function RootLayout() {
    return (
        <ClerkProvider tokenCache={tokenCache} publishableKey={PUBLISHABLE_KEY}>
            <ClerkLoaded>
                <ThemeProvider>
                    <RootLayoutContent />
                </ThemeProvider>
            </ClerkLoaded>
        </ClerkProvider>
    );
}
