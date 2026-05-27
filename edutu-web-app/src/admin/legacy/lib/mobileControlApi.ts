import { supabase } from './supabase';

const API_BASE_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000';

export interface MobileCampaign {
  id?: string;
  key: string;
  title: string;
  body?: string;
  campaign_type: 'popup' | 'banner' | 'notification' | 'interstitial' | 'announcement';
  placement: 'global' | 'home' | 'opportunities' | 'goals' | 'notifications';
  status: 'draft' | 'scheduled' | 'active' | 'paused' | 'archived';
  priority: number;
  starts_at?: string | null;
  ends_at?: string | null;
  audience: Record<string, unknown>;
  creative: Record<string, unknown>;
  frequency: Record<string, unknown>;
}

export interface MobileFeatureFlag {
  id?: string;
  key: string;
  label: string;
  description?: string;
  enabled: boolean;
  default_value: unknown;
  rollout: Record<string, unknown>;
  requires_pro: boolean;
  sort_order: number;
}

export interface WidgetFeed {
  id?: string;
  key: string;
  title: string;
  feed_type: 'opportunities' | 'saved' | 'sponsored' | 'quick_actions';
  placement: 'home' | 'lock_screen' | 'android_home';
  status: 'draft' | 'active' | 'paused' | 'archived';
  priority: number;
  items: Array<Record<string, unknown>>;
  audience: Record<string, unknown>;
}

type ResourceName = 'campaigns' | 'feature-flags' | 'widget-feeds';

async function authHeaders() {
  const { data: { session } } = await supabase.auth.getSession();
  return {
    Authorization: `Bearer ${session?.access_token || ''}`,
    'Content-Type': 'application/json',
  };
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      ...(await authHeaders()),
      ...(init.headers || {}),
    },
  });

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(data?.message || 'Mobile control request failed');
  }
  return data as T;
}

export const mobileControlApi = {
  list<T>(resource: ResourceName) {
    return request<T[]>(`/mobile-control/admin/${resource}`);
  },
  create<T>(resource: ResourceName, payload: Partial<T>) {
    return request<T>(`/mobile-control/admin/${resource}`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
  update<T extends { id?: string }>(resource: ResourceName, payload: Partial<T>) {
    return request<T>(`/mobile-control/admin/${resource}/${payload.id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
  },
  remove(resource: ResourceName, id: string) {
    return request<{ deleted: true }>(`/mobile-control/admin/${resource}/${id}`, {
      method: 'DELETE',
    });
  },
};
