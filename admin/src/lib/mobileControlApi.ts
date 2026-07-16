import { getAdminAuthHeaders, getBackendBaseUrl } from './backend';

const API_BASE_URL = getBackendBaseUrl();

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

export interface MobileForceUpdate {
  enabled: boolean;
  minVersion: string;
  title: string;
  message: string;
  iosStoreUrl: string;
  androidStoreUrl: string;
  otaFirst: boolean;
}

export interface MobileMaintenance {
  enabled: boolean;
  title: string;
  message: string;
}

export type ModuleAccess = 'free' | 'pro' | 'disabled';

export interface MobileAppSettings {
  forceUpdate: MobileForceUpdate;
  maintenance: MobileMaintenance;
  moduleLocks: Record<string, ModuleAccess>;
}

export interface BroadcastPayload {
  title: string;
  body: string;
  severity?: 'info' | 'success' | 'warning' | 'critical';
  audience?: 'all' | 'creators' | 'approved_creators';
  channels?: { inApp?: boolean; push?: boolean };
  metadata?: Record<string, unknown>;
  scheduledFor?: string;
}

export interface BroadcastResult {
  queued?: boolean;
  scheduledFor?: string | null;
  inApp?: { sent?: number };
  push?: { sent?: number; skipped?: string };
  recipients?: number;
  [key: string]: unknown;
}

export interface QueuedBroadcast {
  id: string;
  payload?: { title?: string; body?: string };
  scheduledFor?: string | null;
  status?: string;
  createdAt?: string;
}

// Keep in sync with edutumobile/lib/appControl.ts LOCKABLE_MODULES — the app
// only enforces locks for keys it knows about; unknown keys default to free.
export const LOCKABLE_MODULES: Array<{ key: string; label: string; hint: string }> = [
  { key: 'chat', label: 'AI Chat', hint: 'The Edutu coach chat screens.' },
  { key: 'cv', label: 'CV Builder', hint: 'CV editor, AI drafting, and PDF export.' },
  { key: 'copilot', label: 'Application Co-pilot', hint: 'AI application kits.' },
  { key: 'roadmaps', label: 'Goals & Roadmaps', hint: 'Goals, roadmaps, and templates.' },
  { key: 'savedSearches', label: 'Saved-search Alerts', hint: 'Saved searches and their alerts.' },
  { key: 'wallet', label: 'Wallet & Credits', hint: 'Credit balance and purchases.' },
];

export const DEFAULT_MOBILE_APP_SETTINGS: MobileAppSettings = {
  forceUpdate: {
    enabled: false,
    minVersion: '1.0.0',
    title: 'Update required',
    message: 'This version of Edutu is no longer supported. Please update to keep going.',
    iosStoreUrl: '',
    androidStoreUrl: 'https://play.google.com/store/apps/details?id=com.edutu.com',
    otaFirst: true,
  },
  maintenance: {
    enabled: false,
    title: 'Be right back',
    message: 'Edutu is briefly down for maintenance. Please check back shortly.',
  },
  moduleLocks: {},
};

type ResourceName = 'campaigns' | 'feature-flags' | 'widget-feeds';

async function authHeaders() {
  return getAdminAuthHeaders({
    'Content-Type': 'application/json',
  });
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

// App-control gates live in admin_settings.mobileApp (served to the app on
// GET /mobile-control/config). PUT /admin/settings merges at the group level,
// so sending { mobileApp } alone never clobbers pricing/paywall/platform.
export const appControlApi = {
  async getMobileApp(): Promise<MobileAppSettings> {
    const response = await request<{ settings?: { mobileApp?: MobileAppSettings } }>(
      '/admin/settings',
    );
    return response.settings?.mobileApp ?? DEFAULT_MOBILE_APP_SETTINGS;
  },
  async saveMobileApp(mobileApp: MobileAppSettings): Promise<MobileAppSettings> {
    const response = await request<{ settings?: { mobileApp?: MobileAppSettings } }>(
      '/admin/settings',
      { method: 'PUT', body: JSON.stringify({ mobileApp }) },
    );
    return response.settings?.mobileApp ?? mobileApp;
  },
  broadcast(payload: BroadcastPayload) {
    return request<BroadcastResult>('/notifications/admin/broadcast', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
  listQueue() {
    return request<QueuedBroadcast[]>('/notifications/admin/queue?limit=10');
  },
};
