/**
 * Capacitor Platform Utilities
 * 
 * Handles Android-specific behaviors like:
 * - Hardware back button
 * - Keyboard visibility
 * - Status bar
 * - Splash screen
 * - Deep linking for auth
 */

import { App, type URLOpenListenerEvent } from '@capacitor/app';
import { Keyboard } from '@capacitor/keyboard';
import { StatusBar, Style } from '@capacitor/status-bar';
import { SplashScreen } from '@capacitor/splash-screen';
import { Capacitor } from '@capacitor/core';

// Check if running in Capacitor
export const isNativePlatform = Capacitor.isNativePlatform();
export const getPlatform = () => Capacitor.getPlatform();
export const isAndroid = () => getPlatform() === 'android';
export const isIOS = () => getPlatform() === 'ios';
export const isWeb = () => getPlatform() === 'web';

/**
 * Initialize Capacitor plugins
 * Call this in your App component's useEffect
 */
export const initializeCapacitor = async (options: {
    onBackButton?: () => boolean;
    onDeepLink?: (url: string) => void;
    isDarkMode?: boolean;
}) => {
    if (!isNativePlatform) {
        console.log('Not running in Capacitor, skipping native initialization');
        return;
    }

    try {
        // Hide splash screen after app is ready
        await SplashScreen.hide({ fadeOutDuration: 300 });

        // Configure status bar
        await configureStatusBar(options.isDarkMode ?? false);

        // Setup back button handler (Android)
        if (isAndroid()) {
            setupBackButtonHandler(options.onBackButton);
        }

        // Setup keyboard handlers
        setupKeyboardHandlers();

        // Setup deep link handler
        if (options.onDeepLink) {
            setupDeepLinkHandler(options.onDeepLink);
        }

        // Add capacitor-app class to body
        document.body.classList.add('capacitor-app');

        console.log('Capacitor initialized successfully on', getPlatform());
    } catch (error) {
        console.error('Failed to initialize Capacitor:', error);
    }
};

/**
 * Configure status bar appearance
 */
export const configureStatusBar = async (isDark: boolean) => {
    if (!isNativePlatform) return;

    try {
        await StatusBar.setStyle({
            style: isDark ? Style.Dark : Style.Light
        });

        if (isAndroid()) {
            await StatusBar.setBackgroundColor({
                color: isDark ? '#0c0f1a' : '#f8fafc'
            });
        }
    } catch (error) {
        console.error('Failed to configure status bar:', error);
    }
};

/**
 * Setup Android hardware back button handler
 */
const setupBackButtonHandler = (onBackButton?: () => boolean) => {
    let lastBackPress = 0;

    App.addListener('backButton', () => {
        // If custom handler returns true, it handled the back action
        if (onBackButton && onBackButton()) {
            return;
        }

        // Check if we're at the root/home page
        const isRootPage = window.location.pathname === '/app/home' ||
            window.location.pathname === '/app' ||
            window.location.pathname === '/';

        if (isRootPage) {
            const now = Date.now();
            // Double tap to exit
            if (now - lastBackPress < 2000) {
                App.exitApp();
            } else {
                lastBackPress = now;
                // You could show a toast here: "Press back again to exit"
                console.log('Press back again to exit');
            }
        } else {
            // Navigate back
            window.history.back();
        }
    });
};

/**
 * Setup keyboard visibility handlers
 */
const setupKeyboardHandlers = () => {
    Keyboard.addListener('keyboardWillShow', (info) => {
        document.body.classList.add('keyboard-visible');
        document.body.style.setProperty('--keyboard-height', `${info.keyboardHeight}px`);
    });

    Keyboard.addListener('keyboardWillHide', () => {
        document.body.classList.remove('keyboard-visible');
        document.body.style.removeProperty('--keyboard-height');
    });
};

/**
 * Setup deep link handler for OAuth redirects
 */
const setupDeepLinkHandler = (onDeepLink: (url: string) => void) => {
    App.addListener('appUrlOpen', (event: URLOpenListenerEvent) => {
        console.log('App opened with URL:', event.url);
        onDeepLink(event.url);
    });
};

/**
 * Show the splash screen (useful for reload scenarios)
 */
export const showSplashScreen = async () => {
    if (!isNativePlatform) return;

    try {
        await SplashScreen.show({
            autoHide: false,
            fadeInDuration: 200,
            fadeOutDuration: 200
        });
    } catch (error) {
        console.error('Failed to show splash screen:', error);
    }
};

/**
 * Hide the splash screen
 */
export const hideSplashScreen = async () => {
    if (!isNativePlatform) return;

    try {
        await SplashScreen.hide({ fadeOutDuration: 300 });
    } catch (error) {
        console.error('Failed to hide splash screen:', error);
    }
};

/**
 * Dismiss the keyboard
 */
export const hideKeyboard = async () => {
    if (!isNativePlatform) return;

    try {
        await Keyboard.hide();
    } catch (error) {
        console.error('Failed to hide keyboard:', error);
    }
};

/**
 * Get device info for analytics/debugging
 */
export const getDeviceInfo = () => {
    return {
        platform: getPlatform(),
        isNative: isNativePlatform,
        isAndroid: isAndroid(),
        isIOS: isIOS(),
        isWeb: isWeb()
    };
};

export default {
    initializeCapacitor,
    configureStatusBar,
    showSplashScreen,
    hideSplashScreen,
    hideKeyboard,
    getDeviceInfo,
    isNativePlatform,
    isAndroid,
    isIOS,
    isWeb
};
