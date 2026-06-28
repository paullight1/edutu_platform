/**
 * Notification Delivery Status Service
 *
 * Tracks when push notifications are delivered and opened.
 * Writes to Supabase when online; queues locally when offline
 * and replays on next successful connection.
 */

import { SupabaseClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';

const DELIVERY_QUEUE_KEY = '@edutu_notification_delivery_queue';

interface QueuedAction {
  notificationId: string;
  userId: string;
  action: 'delivered' | 'opened';
  timestamp: string;
}

class NotificationDeliveryService {
  private supabase: SupabaseClient | null = null;

  initialize(client: SupabaseClient): void {
    this.supabase = client;
  }

  private async getQueue(): Promise<QueuedAction[]> {
    try {
      const raw = await AsyncStorage.getItem(DELIVERY_QUEUE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  private async setQueue(queue: QueuedAction[]): Promise<void> {
    try {
      await AsyncStorage.setItem(DELIVERY_QUEUE_KEY, JSON.stringify(queue));
    } catch (e) {
      console.error('Failed to save delivery queue:', e);
    }
  }

  private async enqueue(action: QueuedAction): Promise<void> {
    const queue = await this.getQueue();
    queue.push(action);
    await this.setQueue(queue);
  }

  /** Flush all queued delivery updates to Supabase. */
  async flushQueue(): Promise<void> {
    if (!this.supabase) return;
    const queue = await this.getQueue();
    if (!queue.length) return;

    const remaining: QueuedAction[] = [];
    for (const entry of queue) {
      try {
        const update: Record<string, string> = {};
        if (entry.action === 'delivered') update.delivered_at = entry.timestamp;
        else update.opened_at = entry.timestamp;

        const { error } = await this.supabase
          .from('user_notifications')
          .update(update)
          .eq('id', entry.notificationId)
          .eq('user_id', entry.userId);

        if (error) remaining.push(entry);
      } catch {
        remaining.push(entry);
      }
    }
    await this.setQueue(remaining);
  }

  async markDelivered(notificationId: string, userId: string): Promise<void> {
    const timestamp = new Date().toISOString();
    if (!this.supabase) {
      await this.enqueue({ notificationId, userId, action: 'delivered', timestamp });
      return;
    }
    try {
      const { error } = await this.supabase
        .from('user_notifications')
        .update({ delivered_at: timestamp })
        .eq('id', notificationId)
        .eq('user_id', userId);
      if (error) await this.enqueue({ notificationId, userId, action: 'delivered', timestamp });
    } catch {
      await this.enqueue({ notificationId, userId, action: 'delivered', timestamp });
    }
  }

  async markOpened(notificationId: string, userId: string): Promise<void> {
    const timestamp = new Date().toISOString();
    if (!this.supabase) {
      await this.enqueue({ notificationId, userId, action: 'opened', timestamp });
      return;
    }
    try {
      const { error } = await this.supabase
        .from('user_notifications')
        .update({ opened_at: timestamp })
        .eq('id', notificationId)
        .eq('user_id', userId);
      if (error) await this.enqueue({ notificationId, userId, action: 'opened', timestamp });
    } catch {
      await this.enqueue({ notificationId, userId, action: 'opened', timestamp });
    }
  }

  async getPendingCount(): Promise<number> {
    return (await this.getQueue()).length;
  }
}

export const notificationDeliveryService = new NotificationDeliveryService();
