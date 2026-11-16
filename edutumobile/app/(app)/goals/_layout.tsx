import { Stack } from 'expo-router';
import { Platform } from 'react-native';

export default function GoalsLayout() {
    return (
        <Stack
            screenOptions={{
                headerShown: false,
                animation: "slide_from_right",
                gestureEnabled: true,
                gestureDirection: "horizontal",
                ...(Platform.OS === 'android' && {
                    animationDuration: 250,
                }),
            }}
        >
            <Stack.Screen name="index" />
            <Stack.Screen name="add" />
            <Stack.Screen name="[id]" />
            <Stack.Screen name="my-list" />
            <Stack.Screen name="all-roadmaps" />
        </Stack>
    );
}
