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

import { App, type URLOpenListenerEvent } from "@capacitor/app";
import { Keyboard } from "@capacitor/keyboard";
import { StatusBar, Style } from "@capacitor/status-bar";
import { SplashScreen } from "@capacitor/splash-screen";
import { Capacitor } from "@capacitor/core";

type KeyboardCleanup = () => void;

const NON_TEXT_INPUT_TYPES = new Set([
  "button",
  "checkbox",
  "color",
  "file",
  "hidden",
  "image",
  "radio",
  "range",
  "reset",
  "submit",
]);

const isEditableElement = (element: Element | null): element is HTMLElement => {
  if (!(element instanceof HTMLElement)) return false;
  if (element instanceof HTMLInputElement) {
    return (
      !element.disabled &&
      !element.readOnly &&
      !NON_TEXT_INPUT_TYPES.has(element.type)
    );
  }
  if (element instanceof HTMLTextAreaElement) {
    return !element.disabled && !element.readOnly;
  }
  if (element instanceof HTMLSelectElement) {
    return !element.disabled;
  }
  return (
    element.isContentEditable ||
    element.getAttribute("contenteditable") === "true"
  );
};

const clearKeyboardState = () => {
  document.body.classList.remove("keyboard-visible");
  document.body.style.removeProperty("--keyboard-height");
  document.body.style.removeProperty("--keyboard-offset");
};

const scrollFocusedControlIntoView = () => {
  const activeElement = document.activeElement;
  if (!isEditableElement(activeElement)) return;

  const reduceMotion =
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
  activeElement.scrollIntoView({
    behavior: reduceMotion ? "auto" : "smooth",
    block: "nearest",
  });
};

const blurFocusedControl = () => {
  const activeElement = document.activeElement;
  if (!isEditableElement(activeElement)) return false;
  activeElement.blur();
  return true;
};

const setupKeyboardInteractionHandlers = ({
  trackViewport,
}: {
  trackViewport: boolean;
}): KeyboardCleanup => {
  let stableViewportHeight = Math.max(
    window.innerHeight,
    window.visualViewport?.height ?? 0,
  );

  const updateViewportInset = () => {
    const viewport = window.visualViewport;
    if (!trackViewport || !viewport) return;

    const activeElement = document.activeElement;
    const inset = Math.max(
      0,
      Math.round(stableViewportHeight - viewport.height - viewport.offsetTop),
    );

    if (inset > 80 && isEditableElement(activeElement)) {
      document.body.classList.add("keyboard-visible");
      document.body.style.setProperty("--keyboard-height", `${inset}px`);
      document.body.style.setProperty("--keyboard-offset", `${inset}px`);
      scrollFocusedControlIntoView();
      return;
    }

    clearKeyboardState();
    if (!isEditableElement(activeElement)) {
      stableViewportHeight = Math.max(stableViewportHeight, viewport.height);
    }
  };

  const onPointerDown = (event: PointerEvent) => {
    const activeElement = document.activeElement;
    if (!isEditableElement(activeElement)) return;

    const target = event.target instanceof Element ? event.target : null;
    if (!target || target === activeElement || isEditableElement(target))
      return;

    const keyboardScope = activeElement.closest("form, [data-keyboard-scope]");
    const actionTarget = target.closest(
      "button, a, label, [role='button'], [role='link']",
    );
    if (actionTarget && keyboardScope?.contains(actionTarget)) return;

    void hideKeyboard();
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Escape") void hideKeyboard();
  };

  document.addEventListener("pointerdown", onPointerDown, true);
  document.addEventListener("keydown", onKeyDown);

  const viewport = window.visualViewport;
  if (trackViewport && viewport) {
    viewport.addEventListener("resize", updateViewportInset);
    viewport.addEventListener("scroll", updateViewportInset);
    document.addEventListener("focusin", updateViewportInset);
    document.addEventListener("focusout", updateViewportInset);
  }

  return () => {
    document.removeEventListener("pointerdown", onPointerDown, true);
    document.removeEventListener("keydown", onKeyDown);
    if (trackViewport && viewport) {
      viewport.removeEventListener("resize", updateViewportInset);
      viewport.removeEventListener("scroll", updateViewportInset);
      document.removeEventListener("focusin", updateViewportInset);
      document.removeEventListener("focusout", updateViewportInset);
    }
    clearKeyboardState();
  };
};

// Check if running in Capacitor
export const isNativePlatform = Capacitor.isNativePlatform();
export const getPlatform = () => Capacitor.getPlatform();
export const isAndroid = () => getPlatform() === "android";
export const isIOS = () => getPlatform() === "ios";
export const isWeb = () => getPlatform() === "web";

/**
 * Initialize Capacitor plugins
 * Call this in your App component's useEffect
 */
export const initializeCapacitor = async (options: {
  onBackButton?: () => boolean;
  onDeepLink?: (url: string) => void;
  isDarkMode?: boolean;
}): Promise<KeyboardCleanup> => {
  const cleanupInteractions = setupKeyboardInteractionHandlers({
    trackViewport: !isNativePlatform,
  });

  if (!isNativePlatform) {
    return cleanupInteractions;
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
    const cleanupNativeKeyboard = await setupKeyboardHandlers();

    // Setup deep link handler
    if (options.onDeepLink) {
      setupDeepLinkHandler(options.onDeepLink);
    }

    // Add capacitor-app class to body
    document.body.classList.add("capacitor-app");

    console.log("Capacitor initialized successfully on", getPlatform());
    return () => {
      cleanupNativeKeyboard();
      cleanupInteractions();
    };
  } catch (error) {
    console.error("Failed to initialize Capacitor:", error);
    return cleanupInteractions;
  }
};

/**
 * Configure status bar appearance
 */
export const configureStatusBar = async (isDark: boolean) => {
  if (!isNativePlatform) return;

  try {
    await StatusBar.setStyle({
      style: isDark ? Style.Dark : Style.Light,
    });

    if (isAndroid()) {
      await StatusBar.setBackgroundColor({
        color: isDark ? "#0c0f1a" : "#f8fafc",
      });
    }
  } catch (error) {
    console.error("Failed to configure status bar:", error);
  }
};

/**
 * Setup Android hardware back button handler
 */
const setupBackButtonHandler = (onBackButton?: () => boolean) => {
  let lastBackPress = 0;

  App.addListener("backButton", () => {
    // If custom handler returns true, it handled the back action
    if (onBackButton && onBackButton()) {
      return;
    }

    // Check if we're at the root/home page
    const isRootPage = ["/dashboard", "/app/home", "/app", "/"].includes(
      window.location.pathname,
    );

    if (isRootPage) {
      const now = Date.now();
      // Double tap to exit
      if (now - lastBackPress < 2000) {
        App.exitApp();
      } else {
        lastBackPress = now;
        // You could show a toast here: "Press back again to exit"
        console.log("Press back again to exit");
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
const setupKeyboardHandlers = async (): Promise<KeyboardCleanup> => {
  const willShow = await Keyboard.addListener("keyboardWillShow", (info) => {
    document.body.classList.add("keyboard-visible");
    document.body.style.setProperty(
      "--keyboard-height",
      `${info.keyboardHeight}px`,
    );
    // Capacitor already resizes the body, so an additional visual offset
    // would move fixed controls twice on native builds.
    document.body.style.setProperty("--keyboard-offset", "0px");
    window.requestAnimationFrame(scrollFocusedControlIntoView);
  });

  const willHide = await Keyboard.addListener("keyboardWillHide", () => {
    clearKeyboardState();
  });

  return () => {
    void willShow.remove();
    void willHide.remove();
    clearKeyboardState();
  };
};

/**
 * Setup deep link handler for OAuth redirects
 */
const setupDeepLinkHandler = (onDeepLink: (url: string) => void) => {
  void App.getLaunchUrl()
    .then((launch) => {
      if (launch?.url) onDeepLink(launch.url);
    })
    .catch(() => undefined);
  App.addListener("appUrlOpen", (event: URLOpenListenerEvent) => {
    console.log("App opened with URL:", event.url);
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
      fadeOutDuration: 200,
    });
  } catch (error) {
    console.error("Failed to show splash screen:", error);
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
    console.error("Failed to hide splash screen:", error);
  }
};

/**
 * Dismiss the keyboard
 */
export const hideKeyboard = async () => {
  blurFocusedControl();
  clearKeyboardState();

  if (!isNativePlatform) return;

  try {
    await Keyboard.hide();
  } catch (error) {
    console.error("Failed to hide keyboard:", error);
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
    isWeb: isWeb(),
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
  isWeb,
};
