import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
    appId: 'ai.edutu.app',
    appName: 'Edutu',
    webDir: 'dist',

    // Server configuration for development
    server: {
        // For development on a real device, you might need to set androidScheme
        androidScheme: 'https',
        // Clear text traffic for development (remove in production)
        cleartext: false
    },

    // Android-specific configuration
    android: {
        backgroundColor: '#0c0f1a',
        allowMixedContent: false,
        captureInput: true,
        webContentsDebuggingEnabled: false // Set to true for debugging
    },

    // Plugin configurations
    plugins: {
        // Splash Screen configuration
        SplashScreen: {
            launchShowDuration: 2000,
            launchAutoHide: true,
            backgroundColor: '#0c0f1a',
            androidSplashResourceName: 'splash',
            androidScaleType: 'CENTER_CROP',
            showSpinner: false,
            splashFullScreen: true,
            splashImmersive: true
        },

        // Status Bar configuration
        StatusBar: {
            style: 'DARK',
            backgroundColor: '#0c0f1a'
        },

        // Keyboard configuration
        Keyboard: {
            resize: 'body',
            resizeOnFullScreen: true
        }
    }
};

export default config;
