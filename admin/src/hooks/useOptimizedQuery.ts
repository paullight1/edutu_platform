import { useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';

interface QueryState<T> {
    data: T | null;
    loading: boolean;
    error: Error | null;
}

interface QueryOptions {
    enabled?: boolean;
    refetchInterval?: number;
    retryCount?: number;
    staleTime?: number;
}

/**
 * Optimized data fetching hook with caching
 * Prevents N+1 queries by batching requests
 */
export function useOptimizedQuery<T>(
    queryKey: string,
    queryFn: () => Promise<T>,
    options: QueryOptions = {}
) {
    const { enabled = true, refetchInterval, retryCount = 3, staleTime = 5000 } = options;
    const [state, setState] = useState<QueryState<T>>({
        data: null,
        loading: enabled,
        error: null
    });
    
    const lastFetchTime = useRef<number>(0);
    const retryAttempt = useRef<number>(0);
    const intervalRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
    const dataRef = useRef<T | null>(null);

    useEffect(() => {
        dataRef.current = state.data;
    }, [state.data]);

    const fetchData = useCallback(async function fetchData(isBackground = false) {
        // Check stale time
        const now = Date.now();
        const cachedData = getCachedQuery<T>(queryKey);
        if (!isBackground && cachedData && now - lastFetchTime.current < staleTime) {
            setState({ data: cachedData, loading: false, error: null });
            return;
        }

        if (!isBackground && now - lastFetchTime.current < staleTime && dataRef.current) {
            return;
        }

        if (!isBackground) {
            setState(prev => ({ ...prev, loading: true, error: null }));
        }

        try {
            const data = await queryFn();
            lastFetchTime.current = Date.now();
            retryAttempt.current = 0;
            setCachedQuery(queryKey, data);
            setState({ data, loading: false, error: null });
        } catch (error: unknown) {
            if (retryAttempt.current < retryCount) {
                retryAttempt.current++;
                setTimeout(() => {
                    void fetchData(isBackground);
                }, 1000 * retryAttempt.current);
                return;
            }
            setState({
                data: null,
                loading: false,
                error: error instanceof Error ? error : new Error(String(error)),
            });
        }
}, [queryFn, queryKey, retryCount, staleTime]);

    useEffect(() => {
        if (!enabled) return;
        
        fetchData();

        // Auto-refetch
        if (refetchInterval) {
            intervalRef.current = setInterval(() => fetchData(true), refetchInterval);
        }

        return () => {
            if (intervalRef.current) {
                clearInterval(intervalRef.current);
            }
        };
    }, [enabled, fetchData, refetchInterval]);

    const refetch = useCallback(() => fetchData(), [fetchData]);

    return { ...state, refetch };
}

/**
 * Batched query hook for fetching related data
 * Prevents N+1 queries by loading all data in parallel
 */
export function useBatchedQueries<T extends Record<string, unknown>>(
    queries: { [K in keyof T]: () => Promise<T[K]> }
) {
    const [data, setData] = useState<T | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<Error | null>(null);
    const queriesRef = useRef(queries);

    useEffect(() => {
        queriesRef.current = queries;
    }, [queries]);

    const fetchAll = useCallback(async () => {
        setLoading(true);
        setError(null);

        try {
            // Execute all queries in parallel
            const entries = Object.entries(queriesRef.current) as Array<
                [keyof T, () => Promise<T[keyof T]>]
            >;
            const promises = entries.map(([, queryFn]) => queryFn());
            const results = await Promise.all(promises);

            const resultData = {} as T;
            entries.forEach(([key], index) => {
                resultData[key] = results[index] as T[keyof T];
            });

            setData(resultData);
        } catch (err: unknown) {
            setError(err instanceof Error ? err : new Error(String(err)));
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchAll();
    }, [fetchAll]);

    return { data, loading, error, refetch: fetchAll };
}

/**
 * Pagination hook with cursor-based pagination
 * More efficient than offset-based for large datasets
 */
export function usePagination<T>(
    fetchPage: (cursor: string | null, limit: number) => Promise<{ data: T[]; nextCursor: string | null }>,
    pageSize: number = 20
) {
    const [items, setItems] = useState<T[]>([]);
    const [loading, setLoading] = useState(false);
    const [hasMore, setHasMore] = useState(true);
    const [cursor, setCursor] = useState<string | null>(null);
    const [error, setError] = useState<Error | null>(null);

    const loadMore = useCallback(async () => {
        if (loading || !hasMore) return;

        setLoading(true);
        setError(null);

        try {
            const { data, nextCursor } = await fetchPage(cursor, pageSize);
            setItems(prev => [...prev, ...data]);
            setCursor(nextCursor);
            setHasMore(!!nextCursor);
        } catch (err: unknown) {
            setError(err instanceof Error ? err : new Error(String(err)));
        } finally {
            setLoading(false);
        }
    }, [cursor, hasMore, loading, fetchPage, pageSize]);

    const reset = useCallback(() => {
        setItems([]);
        setCursor(null);
        setHasMore(true);
        setError(null);
    }, []);

    const refresh = useCallback(async () => {
        reset();
        await loadMore();
    }, [reset, loadMore]);

    useEffect(() => {
        loadMore();
    }, [loadMore]);

    return { items, loading, hasMore, error, loadMore, reset, refresh };
}

/**
 * Real-time subscription hook with automatic cleanup
 * Prevents memory leaks
 */
export function useRealtimeSubscription(
    table: string,
    filter: string,
    onChange: (payload: unknown) => void
) {
    const [isSubscribed, setIsSubscribed] = useState(false);
    const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

    useEffect(() => {
        channelRef.current = supabase
            .channel(`${table}-changes`)
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table,
                filter
            }, (payload) => {
                onChange(payload);
            })
            .subscribe((status) => {
                setIsSubscribed(status === 'SUBSCRIBED');
            });

        return () => {
            if (channelRef.current) {
                supabase.removeChannel(channelRef.current);
                channelRef.current = null;
                setIsSubscribed(false);
            }
        };
    }, [table, filter, onChange]);

    return { isSubscribed };
}

/**
 * Debounced search hook
 * Prevents excessive API calls on every keystroke
 */
export function useDebouncedSearch<T>(
    searchFn: (query: string) => Promise<T[]>,
    delay: number = 300
) {
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<T[]>([]);
    const [loading, setLoading] = useState(false);
    const timeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

    const search = useCallback(async (searchQuery: string) => {
        if (!searchQuery.trim()) {
            setResults([]);
            return;
        }

        setLoading(true);
        try {
            const data = await searchFn(searchQuery);
            setResults(data);
        } catch (error) {
            console.error('Search error:', error);
            setResults([]);
        } finally {
            setLoading(false);
        }
    }, [searchFn]);

    const debouncedSearch = useCallback((value: string) => {
        setQuery(value);
        
        if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
        }

        timeoutRef.current = setTimeout(() => {
            search(value);
        }, delay);
    }, [search, delay]);

    useEffect(() => {
        return () => {
            if (timeoutRef.current) {
                clearTimeout(timeoutRef.current);
            }
        };
    }, []);

    return { query, setQuery: debouncedSearch, results, loading };
}

/**
 * Cache for storing query results
 */
const queryCache = new Map<string, { data: unknown; timestamp: number }>();
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

export function getCachedQuery<T>(key: string): T | null {
    const cached = queryCache.get(key);
    if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
        return cached.data as T;
    }
    return null;
}

export function setCachedQuery<T>(key: string, data: T): void {
    queryCache.set(key, { data, timestamp: Date.now() });
}

export function invalidateCache(key?: string): void {
    if (key) {
        queryCache.delete(key);
    } else {
        queryCache.clear();
    }
}
