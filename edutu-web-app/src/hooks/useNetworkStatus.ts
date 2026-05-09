import { useState, useEffect, useCallback } from 'react';

interface NetworkStatus {
    isOnline: boolean;
    isSlowConnection: boolean;
    connectionType: string | null;
    downlink: number | null;
    rtt: number | null;
}

interface NetworkInformation extends EventTarget {
    downlink: number;
    effectiveType: string;
    rtt: number;
    saveData: boolean;
    addEventListener(type: 'change', listener: () => void): void;
    removeEventListener(type: 'change', listener: () => void): void;
}

declare global {
    interface Navigator {
        connection?: NetworkInformation;
        mozConnection?: NetworkInformation;
        webkitConnection?: NetworkInformation;
    }
}

/**
 * useNetworkStatus Hook
 * 
 * Monitors the user's network connection status and provides
 * information about online/offline state and connection quality.
 */
export function useNetworkStatus(): NetworkStatus & {
    checkConnection: () => Promise<boolean>;
} {
    const getConnection = (): NetworkInformation | null => {
        if (typeof navigator === 'undefined') return null;
        return navigator.connection || navigator.mozConnection || navigator.webkitConnection || null;
    };

    const getInitialState = (): NetworkStatus => {
        const connection = getConnection();
        return {
            isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
            isSlowConnection: connection ? connection.effectiveType === '2g' || connection.effectiveType === 'slow-2g' : false,
            connectionType: connection?.effectiveType || null,
            downlink: connection?.downlink || null,
            rtt: connection?.rtt || null
        };
    };

    const [status, setStatus] = useState<NetworkStatus>(getInitialState);

    // Check actual connectivity by pinging a reliable endpoint
    const checkConnection = useCallback(async (): Promise<boolean> => {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 5000);

            await fetch('https://www.google.com/favicon.ico', {
                method: 'HEAD',
                mode: 'no-cors',
                cache: 'no-store',
                signal: controller.signal
            });

            clearTimeout(timeoutId);
            return true;
        } catch {
            return false;
        }
    }, []);

    useEffect(() => {
        const handleOnline = () => {
            setStatus(prev => ({ ...prev, isOnline: true }));
        };

        const handleOffline = () => {
            setStatus(prev => ({ ...prev, isOnline: false }));
        };

        const handleConnectionChange = () => {
            const connection = getConnection();
            if (connection) {
                setStatus(prev => ({
                    ...prev,
                    isSlowConnection: connection.effectiveType === '2g' || connection.effectiveType === 'slow-2g',
                    connectionType: connection.effectiveType,
                    downlink: connection.downlink,
                    rtt: connection.rtt
                }));
            }
        };

        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);

        const connection = getConnection();
        if (connection) {
            connection.addEventListener('change', handleConnectionChange);
        }

        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);

            if (connection) {
                connection.removeEventListener('change', handleConnectionChange);
            }
        };
    }, []);

    return { ...status, checkConnection };
}

/**
 * useOnlineStatus Hook
 * 
 * Simplified hook that just returns online/offline status.
 */
export function useOnlineStatus(): boolean {
    const [isOnline, setIsOnline] = useState(
        typeof navigator !== 'undefined' ? navigator.onLine : true
    );

    useEffect(() => {
        const handleOnline = () => setIsOnline(true);
        const handleOffline = () => setIsOnline(false);

        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);

        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
        };
    }, []);

    return isOnline;
}

export default useNetworkStatus;
