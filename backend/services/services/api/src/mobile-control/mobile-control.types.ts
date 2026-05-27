export type JsonRecord = Record<string, unknown>;

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
  audience: JsonRecord;
  creative: JsonRecord;
  frequency: JsonRecord;
  created_by?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface MobileFeatureFlag {
  id: string;
  key: string;
  label: string;
  description?: string | null;
  enabled: boolean;
  default_value: unknown;
  rollout: JsonRecord;
  requires_pro: boolean;
  sort_order: number;
  created_at?: string;
  updated_at?: string;
}

export interface WidgetFeed {
  id: string;
  key: string;
  title: string;
  feed_type: string;
  placement: string;
  status: string;
  items: JsonRecord[];
  audience: JsonRecord;
  priority: number;
  starts_at?: string | null;
  ends_at?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface MobileControlConfig {
  campaigns: MobileCampaign[];
  featureFlags: MobileFeatureFlag[];
  widgetFeeds: WidgetFeed[];
  serverTime: string;
}

export interface CampaignEventDto {
  campaignId?: string;
  eventType: 'impression' | 'click' | 'dismiss' | 'conversion';
  metadata?: JsonRecord;
}
