import { useEffect, useState } from 'react';

/**
 * Hook for managing PWA installation and updates
 */

interface BeforeInstallPromptEvent extends Event {
    readonly platforms: string[];
    readonly userChoice: Promise<{
        outcome: 'accepted' | 'dismissed';
        platform: string;
    }>;
    prompt(): Promise<void>;
}

interface PWAState {
    isInstallable: boolean;
    isInstalled: boolean;
    isUpdateAvailable: boolean;
    isOffline: boolean;
}

export function usePWA() {
    const [state, setState] = useState<PWAState>({
        isInstallable: false,
        isInstalled: false,
        isUpdateAvailable: false,
        isOffline: !navigator.onLine,
    });

    const [deferredPrompt, setDeferredPrompt] =
        useState<BeforeInstallPromptEvent | null>(null);

    useEffect(() => {
        // Check if already installed
        const checkInstalled = () => {
            const isStandalone =
                window.matchMedia('(display-mode: standalone)').matches ||
                (window.navigator as unknown as { standalone?: boolean }).standalone === true;

            setState((prev) => ({ ...prev, isInstalled: isStandalone }));
        };

        checkInstalled();

        // Listen for install prompt
        const handleBeforeInstallPrompt = (e: Event) => {
            e.preventDefault();
            setDeferredPrompt(e as BeforeInstallPromptEvent);
            setState((prev) => ({ ...prev, isInstallable: true }));
        };

        // Listen for app installed
        const handleAppInstalled = () => {
            setDeferredPrompt(null);
            setState((prev) => ({
                ...prev,
                isInstallable: false,
                isInstalled: true,
            }));
        };

        // Listen for online/offline
        const handleOnline = () => setState((prev) => ({ ...prev, isOffline: false }));
        const handleOffline = () => setState((prev) => ({ ...prev, isOffline: true }));

        window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
        window.addEventListener('appinstalled', handleAppInstalled);
        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);

        // Service worker update detection
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.ready.then((registration) => {
                registration.addEventListener('updatefound', () => {
                    const newWorker = registration.installing;
                    if (newWorker) {
                        newWorker.addEventListener('statechange', () => {
                            if (
                                newWorker.state === 'installed' &&
                                navigator.serviceWorker.controller
                            ) {
                                setState((prev) => ({ ...prev, isUpdateAvailable: true }));
                            }
                        });
                    }
                });
            });
        }

        return () => {
            window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
            window.removeEventListener('appinstalled', handleAppInstalled);
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
        };
    }, []);

    // Trigger install prompt
    const promptInstall = async (): Promise<boolean> => {
        if (!deferredPrompt) return false;

        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;

        if (outcome === 'accepted') {
            setDeferredPrompt(null);
            setState((prev) => ({ ...prev, isInstallable: false }));
            return true;
        }

        return false;
    };

    // Reload page to get update
    const applyUpdate = () => {
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.ready.then((registration) => {
                if (registration.waiting) {
                    registration.waiting.postMessage({ type: 'SKIP_WAITING' });
                }
            });
        }
        window.location.reload();
    };

    return {
        ...state,
        promptInstall,
        applyUpdate,
    };
}

/**
 * Component to show install banner
 */
import React from 'react';
import { Download, X, RefreshCw, WifiOff } from 'lucide-react';

interface PWABannerProps {
    className?: string;
}

export const PWAInstallBanner: React.FC<PWABannerProps> = ({ className = '' }) => {
    const { isInstallable, isUpdateAvailable, isOffline, promptInstall, applyUpdate } =
        usePWA();
    const [dismissed, setDismissed] = useState(false);

    if (dismissed) return null;

    // Offline indicator
    if (isOffline) {
        return (
            <div
                className={`fixed top-0 left-0 right-0 bg-amber-500 text-white px-4 py-2 flex items-center justify-center gap-2 z-50 ${className}`}
            >
                <WifiOff className="w-4 h-4" />
                <span className="text-sm font-medium">
                    You are offline. Some features may be limited.
                </span>
            </div>
        );
    }

    // Update available
    if (isUpdateAvailable) {
        return (
            <div
                className={`fixed bottom-20 left-4 right-4 sm:left-auto sm:right-4 sm:w-80 bg-gradient-to-r from-indigo-600 to-purple-600 rounded-xl p-4 shadow-lg z-50 ${className}`}
            >
                <div className="flex items-start gap-3">
                    <RefreshCw className="w-6 h-6 text-white mt-0.5" />
                    <div className="flex-1">
                        <h4 className="text-white font-semibold">Update Available</h4>
                        <p className="text-white/80 text-sm mt-1">
                            A new version of Edutu is ready. Refresh to update.
                        </p>
                        <div className="flex gap-2 mt-3">
                            <button
                                onClick={applyUpdate}
                                className="px-3 py-1.5 bg-white text-indigo-600 text-sm font-medium rounded-lg hover:bg-white/90 transition-colors"
                            >
                                Update Now
                            </button>
                            <button
                                onClick={() => setDismissed(true)}
                                className="px-3 py-1.5 text-white/80 text-sm hover:text-white transition-colors"
                            >
                                Later
                            </button>
                        </div>
                    </div>
                    <button
                        onClick={() => setDismissed(true)}
                        className="text-white/60 hover:text-white"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>
            </div>
        );
    }

    // Install prompt
    if (isInstallable) {
        return (
            <div
                className={`fixed bottom-20 left-4 right-4 sm:left-auto sm:right-4 sm:w-80 bg-gradient-to-r from-indigo-600 to-purple-600 rounded-xl p-4 shadow-lg z-50 ${className}`}
            >
                <div className="flex items-start gap-3">
                    <Download className="w-6 h-6 text-white mt-0.5" />
                    <div className="flex-1">
                        <h4 className="text-white font-semibold">Install Edutu</h4>
                        <p className="text-white/80 text-sm mt-1">
                            Add Edutu to your home screen for the best experience.
                        </p>
                        <div className="flex gap-2 mt-3">
                            <button
                                onClick={promptInstall}
                                className="px-3 py-1.5 bg-white text-indigo-600 text-sm font-medium rounded-lg hover:bg-white/90 transition-colors"
                            >
                                Install
                            </button>
                            <button
                                onClick={() => setDismissed(true)}
                                className="px-3 py-1.5 text-white/80 text-sm hover:text-white transition-colors"
                            >
                                Not Now
                            </button>
                        </div>
                    </div>
                    <button
                        onClick={() => setDismissed(true)}
                        className="text-white/60 hover:text-white"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>
            </div>
        );
    }

    return null;
};

export default usePWA;
