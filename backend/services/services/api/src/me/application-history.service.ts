import {
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { toDatabaseUserId } from "../common/user-id";

@Injectable()
export class ApplicationHistoryService {
  private readonly supabase: SupabaseClient | null;

  constructor() {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    this.supabase =
      url && key
        ? createClient(url, key, {
            auth: { persistSession: false, autoRefreshToken: false },
          })
        : null;
  }

  async list(userId: string, applicationId: string) {
    const dbUserId = toDatabaseUserId(userId);
    await this.assertOwnedApplication(dbUserId, applicationId);

    const { data, error } = await this.client
      .from("application_history")
      .select(
        "id,application_id,event_type,previous_status,next_status,note,metadata,actor_user_id,created_at",
      )
      .eq("application_id", applicationId)
      .eq("user_id", dbUserId)
      .order("created_at", { ascending: true });

    if (error) {
      throw new ServiceUnavailableException("Could not load application history");
    }
    return data ?? [];
  }

  async addReflection(
    userId: string,
    applicationId: string,
    reflection: string,
  ) {
    const dbUserId = toDatabaseUserId(userId);
    const application = await this.assertOwnedApplication(
      dbUserId,
      applicationId,
    );

    const { data, error } = await this.client
      .from("application_history")
      .insert({
        application_id: applicationId,
        user_id: dbUserId,
        event_type: "reflection",
        previous_status: application.status ?? null,
        next_status: application.status ?? null,
        note: reflection,
        actor_user_id: dbUserId,
        metadata: {},
      })
      .select(
        "id,application_id,event_type,previous_status,next_status,note,metadata,actor_user_id,created_at",
      )
      .single();

    if (error) {
      throw new ServiceUnavailableException("Could not save application reflection");
    }
    return data;
  }

  private async assertOwnedApplication(userId: string, applicationId: string) {
    const { data, error } = await this.client
      .from("opportunity_applications")
      .select("id,status,user_id")
      .eq("id", applicationId)
      .eq("user_id", userId)
      .maybeSingle();

    if (error) {
      throw new ServiceUnavailableException("Could not verify application ownership");
    }
    if (!data) {
      throw new NotFoundException("Application not found");
    }
    return data;
  }

  private get client(): SupabaseClient {
    if (!this.supabase) {
      throw new ServiceUnavailableException("Application storage is unavailable");
    }
    return this.supabase;
  }
}
