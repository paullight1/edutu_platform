import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '@clerk/clerk-react';
import type {
  AppNotification,
  NotificationDraft,
  PushPermissionState
} from '../types/notification';
import {
  deleteNotification as deleteNotificationService,
  fetchNotifications,
  getNotificationPreferences,
  markAllNotificationsRead,
  markNotificationRead,
  registerPushToken,
  saveNotificationPreferences,
  sendNotification as sendNotificationService,
  unregisterPushToken,
  type FetchNotificationsParams,
  type NotificationPreferences
} from '../services/notifications';

interface NotificationsContextValue {
  notifications: AppNotification[];
  unreadCount: number;
  loading: boolean;
  error: string | null;
  hasMore: boolean;
  fetchMore: () => Promise<void>;
  markAsRead: (id: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
  deleteNotification: (id: string) => Promise<void>;
  sendNotification: (draft: NotificationDraft, options?: { userId?: string }) => Promise<AppNotification | null>;
  preferences: NotificationPreferences | null;
  savePreferences: (updates: Partial<NotificationPreferences>) => Promise<void>;
  refreshPreferences: () => Promise<void>;
  pushPermission: PushPermissionState;
  requestPushPermission: () => Promise<PushPermissionState>;
  registerPushToken: (token: string, metadata?: Record<string, unknown>) => Promise<void>;
  unregisterPushToken: (token: string) => Promise<void>;
}

const NotificationsContext = createContext<NotificationsContextValue | undefined>(undefined);

const mapRealtimeRow = (row: Record<string, unknown>): AppNotification | null => {
  if (!row?.id || typeof row.id !== 'string') {
    return null;
  }

  return {
    id: row.id,
    kind: (row.kind as AppNotification['kind']) ?? 'system',
    title: typeof row.title === 'string' ? row.title : 'Notification',
    body: typeof row.body === 'string' ? row.body : '',
    severity: (row.severity as AppNotification['severity']) ?? 'info',
    metadata: (row.metadata as Record<string, unknown>) ?? undefined,
    dedupeKey: typeof row.dedupe_key === 'string' ? row.dedupe_key : undefined,
    createdAt: typeof row.created_at === 'string' ? row.created_at : new Date().toISOString(),
    readAt: typeof row.read_at === 'string' ? row.read_at : row.read_at === null ? null : null
  };
};

export const NotificationsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isSignedIn, userId } = useAuth();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState<boolean>(false);
  const [preferences, setPreferences] = useState<NotificationPreferences | null>(null);
  const [pushPermission, setPushPermission] = useState<PushPermissionState>(() => {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      return 'unsupported';
    }
    return Notification.permission;
  });

  const nextCursorRef = useRef<string | null>(null);
  const fetchingRef = useRef(false);
  const realtimeChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const resetState = useCallback(() => {
    setNotifications([]);
    setPreferences(null);
    setError(null);
    setHasMore(false);
    nextCursorRef.current = null;
  }, []);

  const loadNotifications = useCallback(
    async (options: FetchNotificationsParams = {}) => {
      if (!userId || fetchingRef.current) {
        return;
      }

      fetchingRef.current = true;
      setLoading(true);
      setError(null);

      try {
        const limit = options.limit ?? 20;
        const data = await fetchNotifications(options);

        setNotifications((prev) => {
          if (!options.cursor) {
            return data;
          }
          const newestIds = new Set(prev.map((item) => item.id));
          const merged = [...prev];
          data.forEach((item) => {
            if (!newestIds.has(item.id)) {
              merged.push(item);
            }
          });
          return merged;
        });

        if (data.length < limit) {
          setHasMore(false);
          nextCursorRef.current = null;
        } else {
          const last = data[data.length - 1];
          nextCursorRef.current = last?.createdAt ?? null;
          setHasMore(Boolean(last));
        }
      } catch (fetchError) {
        console.error('Failed to load notifications', fetchError);
        setError(fetchError instanceof Error ? fetchError.message : 'Unable to load notifications.');
      } finally {
        fetchingRef.current = false;
        setLoading(false);
      }
    },
    [userId]
  );

  const fetchMore = useCallback(async () => {
    if (!hasMore || !nextCursorRef.current) {
      return;
    }
    await loadNotifications({ cursor: nextCursorRef.current });
  }, [hasMore, loadNotifications]);

  const loadPreferences = useCallback(async () => {
    if (!userId) {
      setPreferences(null);
      return;
    }
    try {
      const prefs = await getNotificationPreferences(userId);
      setPreferences(prefs);
    } catch (prefError) {
      console.error('Failed to load notification preferences', prefError);
    }
  }, [userId]);

  useEffect(() => {
    if (!userId) {
      resetState();
      setLoading(false);
      return;
    }

    loadNotifications();
    void loadPreferences();
  }, [userId, loadNotifications, loadPreferences, resetState]);

  useEffect(() => {
    if (!userId) {
      if (realtimeChannelRef.current) {
        supabase.removeChannel(realtimeChannelRef.current);
        realtimeChannelRef.current = null;
      }
      return;
    }

    if (realtimeChannelRef.current) {
      supabase.removeChannel(realtimeChannelRef.current);
      realtimeChannelRef.current = null;
    }

    const channel = supabase
      .channel(`notifications:${userId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` },
        (payload) => {
          const mapped = mapRealtimeRow(payload.new);
          if (mapped) {
            setNotifications((prev) => {
              const exists = prev.find((item) => item.id === mapped.id);
              if (exists) {
                return prev;
              }
              return [mapped, ...prev];
            });
          }
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` },
        (payload) => {
          const mapped = mapRealtimeRow(payload.new);
          if (mapped) {
            setNotifications((prev) =>
              prev.map((item) => (item.id === mapped.id ? { ...item, ...mapped } : item))
            );
          }
        }
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` },
        (payload) => {
          const deletedId = typeof payload.old?.id === 'string' ? payload.old.id : null;
          if (deletedId) {
            setNotifications((prev) => prev.filter((item) => item.id !== deletedId));
          }
        }
      )
      .subscribe();

  realtimeChannelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
      realtimeChannelRef.current = null;
    };
  }, [userId]);

  const markAsReadHandler = useCallback(
    async (notificationId: string) => {
      await markNotificationRead(notificationId, true);
      setNotifications((prev) =>
        prev.map((item) => (item.id === notificationId ? { ...item, readAt: new Date().toISOString() } : item))
      );
    },
    []
  );

  const markAllAsReadHandler = useCallback(async () => {
    if (!userId) {
      return;
    }
    await markAllNotificationsRead(userId);
    const timestamp = new Date().toISOString();
    setNotifications((prev) => prev.map((item) => ({ ...item, readAt: item.readAt ?? timestamp })));
  }, [userId]);

  const deleteNotificationHandler = useCallback(async (notificationId: string) => {
    await deleteNotificationService(notificationId);
    setNotifications((prev) => prev.filter((item) => item.id !== notificationId));
  }, []);

  const sendNotificationHandler = useCallback(
    async (draft: NotificationDraft, options?: { userId?: string }) => {
      const targetUserId = options?.userId ?? userId;
      if (!targetUserId) {
        console.warn('Cannot send notification without a user id');
        return null;
      }

      const entry = await sendNotificationService(targetUserId, draft);
      setNotifications((prev) => {
        const exists = prev.find((item) => item.id === entry.id);
        if (exists) {
          return prev;
        }
        return [entry, ...prev];
      });
      return entry;
    },
    [userId]
  );

  const savePreferencesHandler = useCallback(
    async (updates: Partial<NotificationPreferences>) => {
      if (!userId) {
        throw new Error('User must be signed in to update notification preferences.');
      }

      const nextPreferences: NotificationPreferences = {
        ...(preferences ?? {
          pushNotifications: true,
          emailNotifications: false,
          opportunityAlerts: true,
          deadlineReminders: true,
          goalReminders: true,
          achievementCelebrations: true,
          weeklyDigest: false,
          marketingEmails: false,
          quietHours: { start: '22:00', end: '08:00' },
          updatedAt: new Date().toISOString()
        }),
        ...updates,
        quietHours: {
          ...(preferences?.quietHours ?? { start: '22:00', end: '08:00' }),
          ...(updates.quietHours ?? {})
        },
        updatedAt: new Date().toISOString()
      };

      await saveNotificationPreferences(userId, nextPreferences);
      setPreferences(nextPreferences);
    },
    [preferences, userId]
  );

  const refreshPreferences = useCallback(async () => {
    await loadPreferences();
  }, [loadPreferences]);

  const requestPushPermission = useCallback(async () => {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      setPushPermission('unsupported');
      return 'unsupported';
    }

    if (Notification.permission === 'granted') {
      setPushPermission('granted');
      return 'granted';
    }

    const permission = await Notification.requestPermission();
    setPushPermission(permission);
    return permission;
  }, []);

  const registerPushTokenHandler = useCallback(
    async (token: string, metadata?: Record<string, unknown>) => {
      if (!userId) {
        throw new Error('User must be signed in to register a push token.');
      }
      await registerPushToken(userId, {
        token,
        device: metadata
      });
    },
    [userId]
  );

  const unregisterPushTokenHandler = useCallback(
    async (token: string) => {
      if (!userId) {
        return;
      }
      await unregisterPushToken(userId, token);
    },
    [userId]
  );

  const unreadCount = useMemo(
    () => notifications.filter((notification) => !notification.readAt).length,
    [notifications]
  );

  const contextValue = useMemo<NotificationsContextValue>(
    () => ({
      notifications,
      unreadCount,
      loading,
      error,
      hasMore,
      fetchMore,
      markAsRead: markAsReadHandler,
      markAllAsRead: markAllAsReadHandler,
      deleteNotification: deleteNotificationHandler,
      sendNotification: sendNotificationHandler,
      preferences,
      savePreferences: savePreferencesHandler,
      refreshPreferences,
      pushPermission,
      requestPushPermission,
      registerPushToken: registerPushTokenHandler,
      unregisterPushToken: unregisterPushTokenHandler
    }),
    [
      notifications,
      unreadCount,
      loading,
      error,
      hasMore,
      fetchMore,
      markAsReadHandler,
      markAllAsReadHandler,
      deleteNotificationHandler,
      sendNotificationHandler,
      preferences,
      savePreferencesHandler,
      refreshPreferences,
      pushPermission,
      requestPushPermission,
      registerPushTokenHandler,
      unregisterPushTokenHandler
    ]
  );

  return <NotificationsContext.Provider value={contextValue}>{children}</NotificationsContext.Provider>;
};

export function useNotifications() {
  const context = useContext(NotificationsContext);
  if (!context) {
    throw new Error('useNotifications must be used within a NotificationsProvider');
  }
  return context;
}
