import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type {
  CampaignEventDto,
  JsonRecord,
  MobileCampaign,
  MobileControlConfig,
  MobileFeatureFlag,
  WidgetFeed,
} from './mobile-control.types';

type ControlTable =
  | 'mobile_app_campaigns'
  | 'mobile_feature_flags'
  | 'widget_feeds';
type ControlRow = MobileCampaign | MobileFeatureFlag | WidgetFeed;

const TABLES = {
  campaigns: 'mobile_app_campaigns',
  featureFlags: 'mobile_feature_flags',
  widgetFeeds: 'widget_feeds',
} as const satisfies Record<string, ControlTable>;

const SELECT_LIMIT = 500;

@Injectable()
export class MobileControlService {
  private readonly supabase: SupabaseClient | null;

  constructor() {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

    this.supabase =
      url && key
        ? createClient(url, key, { auth: { persistSession: false } })
        : null;
  }

  async getConfig(): Promise<MobileControlConfig> {
    const [campaigns, featureFlags, widgetFeeds] = await Promise.all([
      this.listActive<MobileCampaign>(TABLES.campaigns),
      this.listActiveFeatureFlags(),
      this.listActive<WidgetFeed>(TABLES.widgetFeeds),
    ]);

    return {
      campaigns: this.sortByPriority(campaigns),
      featureFlags: featureFlags.sort(
        (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0),
      ),
      widgetFeeds: this.sortByPriority(widgetFeeds),
      serverTime: new Date().toISOString(),
    };
  }

  async listAdmin<T extends ControlRow>(table: ControlTable): Promise<T[]> {
    const supabase = this.requireSupabase();
    const { data, error } = await supabase
      .from(table)
      .select('*')
      .order('updated_at', { ascending: false })
      .limit(SELECT_LIMIT);

    if (error) throw new BadRequestException(error.message);
    return (data ?? []) as T[];
  }

  async createAdmin<T extends ControlRow>(
    table: ControlTable,
    payload: Partial<T>,
    userId?: string,
  ): Promise<T> {
    const supabase = this.requireSupabase();
    const row = this.withTimestamps(table, payload, userId);
    const { data, error } = await supabase
      .from(table)
      .insert(row)
      .select('*')
      .single();

    if (error) throw new BadRequestException(error.message);
    return data as T;
  }

  async updateAdmin<T extends ControlRow>(
    table: ControlTable,
    id: string,
    payload: Partial<T>,
  ): Promise<T> {
    const supabase = this.requireSupabase();
    const { data, error } = await supabase
      .from(table)
      .update({ ...payload, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select('*')
      .single();

    if (error) throw new BadRequestException(error.message);
    return data as T;
  }

  async deleteAdmin(
    table: ControlTable,
    id: string,
  ): Promise<{ id: string; deleted: true }> {
    const supabase = this.requireSupabase();
    const { error } = await supabase.from(table).delete().eq('id', id);
    if (error) throw new BadRequestException(error.message);
    return { id, deleted: true };
  }

  async recordCampaignEvent(
    userId: string,
    body: CampaignEventDto,
  ): Promise<{ recorded: true }> {
    if (!body?.eventType) {
      throw new BadRequestException('eventType is required');
    }

    const supabase = this.requireSupabase();
    const { error } = await supabase.from('mobile_campaign_events').insert({
      campaign_id: body.campaignId || null,
      user_id: userId,
      event_type: body.eventType,
      metadata: body.metadata ?? {},
    });

    if (error) throw new BadRequestException(error.message);
    return { recorded: true };
  }

  private async listActive<
    T extends {
      status: string;
      starts_at?: string | null;
      ends_at?: string | null;
    },
  >(table: ControlTable): Promise<T[]> {
    const supabase = this.requireSupabase();
    const { data, error } = await supabase
      .from(table)
      .select('*')
      .eq('status', 'active')
      .limit(SELECT_LIMIT);

    if (error) throw new BadRequestException(error.message);
    return ((data ?? []) as T[]).filter((row) => this.isInActiveWindow(row));
  }

  private async listActiveFeatureFlags(): Promise<MobileFeatureFlag[]> {
    const supabase = this.requireSupabase();
    const { data, error } = await supabase
      .from(TABLES.featureFlags)
      .select('*')
      .eq('enabled', true)
      .order('sort_order', { ascending: true })
      .limit(SELECT_LIMIT);

    if (error) throw new BadRequestException(error.message);
    return (data ?? []) as MobileFeatureFlag[];
  }

  private sortByPriority<T extends { priority?: number }>(rows: T[]): T[] {
    return [...rows].sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
  }

  private isInActiveWindow(row: {
    starts_at?: string | null;
    ends_at?: string | null;
  }): boolean {
    const now = Date.now();
    const startsAt = row.starts_at ? Date.parse(row.starts_at) : null;
    const endsAt = row.ends_at ? Date.parse(row.ends_at) : null;

    return (
      (startsAt === null || startsAt <= now) &&
      (endsAt === null || endsAt >= now)
    );
  }

  private withTimestamps<T extends JsonRecord>(
    table: ControlTable,
    payload: Partial<T>,
    userId?: string,
  ): Partial<T> {
    const now = new Date().toISOString();
    const base: JsonRecord = {
      ...payload,
      updated_at: now,
    };

    if (table === TABLES.campaigns) {
      if (!base.status) base.status = 'draft';
      if (base.priority === undefined) base.priority = 0;
      if (!base.campaign_type) base.campaign_type = 'popup';
      if (!base.placement) base.placement = 'global';
      if (!base.audience) base.audience = {};
      if (!base.creative) base.creative = {};
      if (!base.frequency) base.frequency = {};
      if (userId && !base.created_by) base.created_by = userId;
    }

    if (table === TABLES.featureFlags) {
      if (base.enabled === undefined) base.enabled = false;
      if (base.default_value === undefined) base.default_value = false;
      if (!base.rollout) base.rollout = {};
      if (base.requires_pro === undefined) base.requires_pro = false;
      if (base.sort_order === undefined) base.sort_order = 0;
    }

    if (table === TABLES.widgetFeeds) {
      if (!base.status) base.status = 'draft';
      if (base.priority === undefined) base.priority = 0;
      if (!base.feed_type) base.feed_type = 'opportunities';
      if (!base.placement) base.placement = 'home';
      if (!base.items) base.items = [];
      if (!base.audience) base.audience = {};
    }

    return base as Partial<T>;
  }

  private requireSupabase(): SupabaseClient {
    if (!this.supabase) {
      throw new InternalServerErrorException('Supabase is not configured');
    }
    return this.supabase;
  }
}

export { TABLES };
