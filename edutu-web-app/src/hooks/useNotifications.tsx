import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useAuth } from "@clerk/clerk-react";
import type { AppNotification } from "../types/notification";
import {
  deleteNotification as deleteNotificationService,
  fetchNotifications,
  getNotificationPreferences,
  markAllNotificationsRead,
  markNotificationRead,
  saveNotificationPreferences,
  type FetchNotificationsParams,
  type NotificationPreferences,
} from "../services/notifications";

interface NotificationsContextValue {
  notifications: AppNotification[];
  unreadCount: number;
  loading: boolean;
  error: string | null;
  hasMore: boolean;
  refresh: () => Promise<void>;
  fetchMore: () => Promise<void>;
  markAsRead: (id: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
  deleteNotification: (id: string) => Promise<void>;
  preferences: NotificationPreferences | null;
  savePreferences: (updates: Partial<NotificationPreferences>) => Promise<void>;
  refreshPreferences: () => Promise<void>;
}

const NotificationsContext = createContext<
  NotificationsContextValue | undefined
>(undefined);

export const NotificationsProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const { userId, getToken } = useAuth();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState<boolean>(false);
  const [preferences, setPreferences] =
    useState<NotificationPreferences | null>(null);

  const nextCursorRef = React.useRef<string | null>(null);
  const fetchingRef = React.useRef(false);

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
        const token = await getToken();
        const data = await fetchNotifications({ ...options, userId }, token);

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
        console.error("Failed to load notifications", fetchError);
        setError(
          fetchError instanceof Error
            ? fetchError.message
            : "Unable to load notifications.",
        );
      } finally {
        fetchingRef.current = false;
        setLoading(false);
      }
    },
    [getToken, userId],
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
      const token = await getToken();
      const prefs = await getNotificationPreferences(userId, token);
      setPreferences(prefs);
    } catch (prefError) {
      console.error("Failed to load notification preferences", prefError);
    }
  }, [getToken, userId]);

  const refresh = useCallback(async () => {
    await Promise.all([loadNotifications(), loadPreferences()]);
  }, [loadNotifications, loadPreferences]);

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
    if (!userId || typeof window === "undefined") return;

    const refreshOnFocus = () => {
      if (document.visibilityState === "visible") {
        void loadNotifications();
      }
    };

    window.addEventListener("focus", refreshOnFocus);
    document.addEventListener("visibilitychange", refreshOnFocus);

    return () => {
      window.removeEventListener("focus", refreshOnFocus);
      document.removeEventListener("visibilitychange", refreshOnFocus);
    };
  }, [loadNotifications, userId]);

  const markAsReadHandler = useCallback(
    async (notificationId: string) => {
      const token = await getToken();
      await markNotificationRead(notificationId, true, token);
      setNotifications((prev) =>
        prev.map((item) =>
          item.id === notificationId
            ? { ...item, readAt: new Date().toISOString() }
            : item,
        ),
      );
    },
    [getToken],
  );

  const markAllAsReadHandler = useCallback(async () => {
    if (!userId) {
      return;
    }
    const token = await getToken();
    await markAllNotificationsRead(userId, token);
    const timestamp = new Date().toISOString();
    setNotifications((prev) =>
      prev.map((item) => ({ ...item, readAt: item.readAt ?? timestamp })),
    );
  }, [getToken, userId]);

  const deleteNotificationHandler = useCallback(
    async (notificationId: string) => {
      const token = await getToken();
      await deleteNotificationService(notificationId, token);
      setNotifications((prev) =>
        prev.filter((item) => item.id !== notificationId),
      );
    },
    [getToken],
  );

  const savePreferencesHandler = useCallback(
    async (updates: Partial<NotificationPreferences>) => {
      if (!userId) {
        throw new Error(
          "User must be signed in to update notification preferences.",
        );
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
          quietHours: { start: "22:00", end: "08:00" },
          updatedAt: new Date().toISOString(),
        }),
        ...updates,
        quietHours: {
          ...(preferences?.quietHours ?? { start: "22:00", end: "08:00" }),
          ...(updates.quietHours ?? {}),
        },
        updatedAt: new Date().toISOString(),
      };

      const token = await getToken();
      await saveNotificationPreferences(userId, nextPreferences, token);
      setPreferences(nextPreferences);
    },
    [getToken, preferences, userId],
  );

  const refreshPreferences = useCallback(async () => {
    await loadPreferences();
  }, [loadPreferences]);

  const unreadCount = useMemo(
    () => notifications.filter((notification) => !notification.readAt).length,
    [notifications],
  );

  const contextValue = useMemo<NotificationsContextValue>(
    () => ({
      notifications,
      unreadCount,
      loading,
      error,
      hasMore,
      refresh,
      fetchMore,
      markAsRead: markAsReadHandler,
      markAllAsRead: markAllAsReadHandler,
      deleteNotification: deleteNotificationHandler,
      preferences,
      savePreferences: savePreferencesHandler,
      refreshPreferences,
    }),
    [
      notifications,
      unreadCount,
      loading,
      error,
      hasMore,
      refresh,
      fetchMore,
      markAsReadHandler,
      markAllAsReadHandler,
      deleteNotificationHandler,
      preferences,
      savePreferencesHandler,
      refreshPreferences,
    ],
  );

  return (
    <NotificationsContext.Provider value={contextValue}>
      {children}
    </NotificationsContext.Provider>
  );
};

export function useNotifications() {
  const context = useContext(NotificationsContext);
  if (!context) {
    throw new Error(
      "useNotifications must be used within a NotificationsProvider",
    );
  }
  return context;
}
