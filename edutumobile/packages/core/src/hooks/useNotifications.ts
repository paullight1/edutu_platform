import { useState, useCallback, useEffect, useMemo } from 'react';
import { SupabaseClient } from '@supabase/supabase-js';
import { AppNotification } from '../types/notification';

const NOTIFICATIONS_TABLE = 'user_notifications';
const API_BASE_URL = (process.env.EXPO_PUBLIC_API_URL || 'https://edutu-platform.onrender.com').replace(/\/$/, '');

type GetAuthToken = () => Promise<string | null>;

type NotificationRow = {
  id: string;
  kind?: AppNotification['kind'];
  category?: string;
  title: string;
  body: string;
  severity?: AppNotification['severity'];
  metadata?: Record<string, unknown> | null;
  data?: Record<string, unknown> | null;
  dedupe_key?: string | null;
  created_at?: string;
  read_at?: string | null;
};

function mapNotification(row: NotificationRow): AppNotification {
  return {
    id: row.id,
    kind: row.kind || (row.category as AppNotification['kind']) || 'system',
    title: row.title,
    body: row.body,
    severity: row.severity || 'info',
    metadata: row.metadata || row.data || undefined,
    dedupeKey: row.dedupe_key || undefined,
    createdAt: row.created_at || new Date().toISOString(),
    readAt: row.read_at || null,
  };
}

async function fetchBackendNotifications(getAuthToken?: GetAuthToken): Promise<AppNotification[] | null> {
  if (!API_BASE_URL || !getAuthToken) return null;

  const token = await getAuthToken();
  if (!token) return null;

  try {
    const response = await fetch(`${API_BASE_URL}/notifications?limit=100`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) return null;

    const data = (await response.json()) as NotificationRow[];
    return (data ?? []).map(mapNotification);
  } catch (error) {
    if (__DEV__) {
      console.warn('Backend notifications unavailable, falling back to Supabase:', error);
    }
    return null;
  }
}

async function patchBackendNotification(id: string, read: boolean, getAuthToken?: GetAuthToken): Promise<boolean> {
  if (!API_BASE_URL || !getAuthToken) return false;

  const token = await getAuthToken();
  if (!token) return false;

  try {
    const response = await fetch(`${API_BASE_URL}/notifications/${id}/read`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ read }),
    });

    return response.ok;
  } catch {
    return false;
  }
}

async function deleteBackendNotification(id: string, getAuthToken?: GetAuthToken): Promise<boolean> {
  if (!API_BASE_URL || !getAuthToken) return false;

  const token = await getAuthToken();
  if (!token) return false;

  try {
    const response = await fetch(`${API_BASE_URL}/notifications/${id}`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    return response.ok;
  } catch {
    return false;
  }
}

export function useNotifications(
  supabase: SupabaseClient,
  userId: string | null,
  getAuthToken?: GetAuthToken,
) {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadNotifications = useCallback(async () => {
    if (!userId) return;

    setIsLoading(true);
    setError(null);
    try {
      const backendNotifications = await fetchBackendNotifications(getAuthToken);
      if (backendNotifications) {
        setNotifications(backendNotifications);
        return;
      }

      try {
        const { data, error } = await supabase
          .from(NOTIFICATIONS_TABLE)
          .select('*')
          .eq('user_id', userId)
          .order('created_at', { ascending: false });

        if (error) throw error;
        setNotifications(((data ?? []) as NotificationRow[]).map(mapNotification));
      } catch (supabaseError) {
        if (__DEV__) {
          console.warn('Supabase notifications unavailable:', supabaseError);
        }
        setNotifications([]);
        setError('Notifications temporarily unavailable');
      }
    } catch (err: any) {
      if (__DEV__) {
        console.warn('Notifications load failed:', err);
      }
      setNotifications([]);
      setError('Notifications temporarily unavailable');
    } finally {
      setIsLoading(false);
    }
  }, [getAuthToken, supabase, userId]);

  const markAsRead = useCallback(async (id: string) => {
    if (!userId) return;

    try {
      const backendUpdated = await patchBackendNotification(id, true, getAuthToken);
      if (backendUpdated) {
        const timestamp = new Date().toISOString();
        setNotifications(prev => prev.map(n => n.id === id ? { ...n, readAt: timestamp } : n));
        return;
      }

      const { error } = await supabase
        .from(NOTIFICATIONS_TABLE)
        .update({ read_at: new Date().toISOString() })
        .eq('id', id)
        .eq('user_id', userId);

      if (error) throw error;
      const timestamp = new Date().toISOString();
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, readAt: timestamp } : n));
    } catch (err: any) {
      console.error('Error marking notification as read:', err);
    }
  }, [getAuthToken, supabase, userId]);

  const deleteNotification = useCallback(async (id: string) => {
    if (!userId) return;

    try {
      const backendDeleted = await deleteBackendNotification(id, getAuthToken);
      if (backendDeleted) {
        setNotifications(prev => prev.filter(n => n.id !== id));
        return;
      }

      const { error } = await supabase
        .from(NOTIFICATIONS_TABLE)
        .delete()
        .eq('id', id)
        .eq('user_id', userId);

      if (error) throw error;
      setNotifications(prev => prev.filter(n => n.id !== id));
    } catch (err: any) {
      console.error('Error deleting notification:', err);
    }
  }, [getAuthToken, supabase, userId]);

  useEffect(() => {
    if (userId) {
      loadNotifications();
    } else {
      setNotifications([]);
    }
  }, [userId, loadNotifications]);

  const unreadCount = useMemo(() => notifications.filter(n => !n.readAt).length, [notifications]);

  return {
    notifications,
    unreadCount,
    isLoading,
    error,
    loadNotifications,
    markAsRead,
    deleteNotification
  };
}
