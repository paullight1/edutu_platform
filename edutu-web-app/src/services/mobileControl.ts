import { getApiBaseUrl } from "../lib/apiBaseUrl";
import { getLocalDevAuthHeaders } from "../lib/localDevAuthHeaders";

export interface MobileCampaign {
  id: string;
  key: string;
  title: string;
  body?: string | null;
  campaign_type: string;
  placement: string;
  status: string;
  priority: number;
  starts_at?: string | null;
  ends_at?: string | null;
  audience?: Record<string, unknown>;
  creative?: Record<string, unknown>;
  frequency?: Record<string, unknown>;
  created_at?: string;
  updated_at?: string;
}

export interface MobileControlConfig {
  campaigns: MobileCampaign[];
  featureFlags: Array<Record<string, unknown>>;
  widgetFeeds: Array<Record<string, unknown>>;
  serverTime: string;
}

async function mobileControlRequest<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const apiBaseUrl = getApiBaseUrl("Mobile Control API");
  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...getLocalDevAuthHeaders(),
      ...(options.headers || {}),
    },
  });

  if (!response.ok) {
    let message = `Mobile Control API request failed with ${response.status}`;
    try {
      const body = await response.json();
      message = body?.message || body?.error || message;
    } catch {
      const text = await response.text();
      if (text) message = text;
    }
    throw new Error(Array.isArray(message) ? message.join(", ") : message);
  }

  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export function fetchMobileControlConfig(): Promise<MobileControlConfig> {
  return mobileControlRequest<MobileControlConfig>("/mobile-control/config");
}

export async function recordMobileCampaignEvent(
  campaignId: string,
  eventType: "impression" | "click" | "dismiss" | "conversion",
  token?: string | null,
  metadata: Record<string, unknown> = {},
) {
  if (!campaignId) return;
  await mobileControlRequest("/mobile-control/events", {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    body: JSON.stringify({ campaignId, eventType, metadata }),
  });
}
