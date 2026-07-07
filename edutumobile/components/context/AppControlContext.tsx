import React, {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useRef,
    useState,
} from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { fetchMobileControlConfig } from '../../lib/mobileControl';
import {
    getModuleAccess,
    readCachedAppControl,
    writeCachedAppControl,
    type AppControlConfig,
    type ModuleAccess,
} from '../../lib/appControl';

// Fetches the remote app-control config once at launch (hydrating instantly
// from the last-known cached copy so gates apply offline), re-checks whenever
// the app returns to the foreground, and shares the result app-wide. The
// campaign host keeps its own fetch — this context only powers gating.

interface AppControlContextValue {
    /** null until the first cache read/fetch resolves — fail-open while null. */
    appControl: AppControlConfig | null;
    refresh: () => Promise<void>;
}

const AppControlContext = createContext<AppControlContextValue>({
    appControl: null,
    refresh: async () => {},
});

export function AppControlProvider({ children }: { children: React.ReactNode }) {
    const [appControl, setAppControl] = useState<AppControlConfig | null>(null);
    const mountedRef = useRef(true);

    const refresh = useCallback(async () => {
        try {
            const config = await fetchMobileControlConfig();
            if (!mountedRef.current) return;
            setAppControl(config.appControl);
            void writeCachedAppControl(config.appControl);
        } catch {
            // Fail open: keep whatever state we already have (cache or null).
        }
    }, []);

    useEffect(() => {
        mountedRef.current = true;

        // Cache first so a cold offline start still applies the last-known
        // gates, then race the live fetch (which wins when it lands).
        let liveConfigArrived = false;
        void readCachedAppControl().then((cached) => {
            if (cached && mountedRef.current && !liveConfigArrived) {
                setAppControl((current) => current ?? cached);
            }
        });
        void refresh().then(() => {
            liveConfigArrived = true;
        });

        const subscription = AppState.addEventListener(
            'change',
            (nextState: AppStateStatus) => {
                if (nextState === 'active') void refresh();
            },
        );

        return () => {
            mountedRef.current = false;
            subscription.remove();
        };
    }, [refresh]);

    const value = useMemo(() => ({ appControl, refresh }), [appControl, refresh]);

    return (
        <AppControlContext.Provider value={value}>
            {children}
        </AppControlContext.Provider>
    );
}

export function useAppControl(): AppControlContextValue {
    return useContext(AppControlContext);
}

/** Remote access level for a lockable module ('free' when unconfigured). */
export function useModuleAccess(moduleKey: string): ModuleAccess {
    const { appControl } = useAppControl();
    return getModuleAccess(appControl, moduleKey);
}
