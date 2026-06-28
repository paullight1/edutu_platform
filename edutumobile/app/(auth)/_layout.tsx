import { Redirect, Stack } from 'expo-router'
import { useAuth, useUser } from '@clerk/clerk-expo'
import { View } from 'react-native'
import { useTheme } from '../../components/context/ThemeContext'
import { BrandedLoader } from '../../components/ui/BrandedLoader'

export default function AuthRoutesLayout() {
    const { isSignedIn, isLoaded } = useAuth()
    const { user } = useUser()
    const { colors, isDark } = useTheme()

    if (!isLoaded) {
        return (
            <View style={{ flex: 1, backgroundColor: colors.background, justifyContent: 'center', alignItems: 'center' }}>
                <BrandedLoader label="" />
            </View>
        )
    }

    if (isSignedIn) {
        if (user && !user.unsafeMetadata?.onboardingComplete) {
            return <Redirect href="/onboarding" />
        }
        return <Redirect href="/(app)" />
    }

    return (
        <Stack
            screenOptions={{
                headerShown: false,
                contentStyle: { backgroundColor: colors.background },
            }}
        >
            <Stack.Screen name="sign-in" />
            <Stack.Screen name="sign-up" />
            <Stack.Screen name="reset-password" />
        </Stack>
    )
}
