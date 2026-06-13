import { Injectable, Logger } from "@nestjs/common";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { adminSettings } from "../db/schema";
import { AuditService } from "../common/audit";
import {
  DEFAULT_ADMIN_SETTINGS,
  mergeAdminSettings,
  type AdminSettingsResponse,
  type AdminSettingsDto,
} from "./settings.dto";

const GLOBAL_SETTINGS_KEY = "global";

type AdminSettingsRow = typeof adminSettings.$inferSelect;

@Injectable()
export class SettingsService {
  private readonly logger = new Logger(SettingsService.name);

  constructor(private readonly auditService: AuditService) {}

  private async ensureRow(): Promise<AdminSettingsRow> {
    const existing = await db
      .select()
      .from(adminSettings)
      .where(eq(adminSettings.key, GLOBAL_SETTINGS_KEY))
      .limit(1);

    if (existing.length > 0) {
      return existing[0];
    }

    await db
      .insert(adminSettings)
      .values({
        key: GLOBAL_SETTINGS_KEY,
        settings: DEFAULT_ADMIN_SETTINGS,
      })
      .onConflictDoNothing({ target: adminSettings.key });

    const inserted = await db
      .select()
      .from(adminSettings)
      .where(eq(adminSettings.key, GLOBAL_SETTINGS_KEY))
      .limit(1);

    if (inserted.length === 0) {
      return {
        key: GLOBAL_SETTINGS_KEY,
        settings: DEFAULT_ADMIN_SETTINGS,
        updatedBy: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as AdminSettingsRow;
    }

    return inserted[0];
  }

  async getSettings(): Promise<AdminSettingsResponse> {
    try {
      const row = await this.ensureRow();
      return {
        success: true,
        source: "database",
        settings: mergeAdminSettings(row.settings),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Using fallback admin settings: ${message}`);
      return {
        success: false,
        source: "fallback",
        settings: DEFAULT_ADMIN_SETTINGS,
        error: "Settings data is temporarily unavailable.",
      };
    }
  }

  async updateSettings(
    userId: string,
    payload: AdminSettingsDto,
  ): Promise<AdminSettingsResponse> {
    const current = (await this.getSettings()).settings;
    const normalized = mergeAdminSettings(payload);

    try {
      const updated = await db
        .update(adminSettings)
        .set({
          settings: normalized,
          updatedBy: userId,
          updatedAt: new Date(),
        })
        .where(eq(adminSettings.key, GLOBAL_SETTINGS_KEY))
        .returning();

      if (updated.length === 0) {
        await db.insert(adminSettings).values({
          key: GLOBAL_SETTINGS_KEY,
          settings: normalized,
          updatedBy: userId,
        });
      }

      await this.auditService.logSettingChange(
        userId,
        "admin_settings",
        current,
        normalized,
      );

      return {
        success: true,
        source: "database",
        settings: normalized,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Failed to persist admin settings: ${message}`);
      return {
        success: false,
        source: "fallback",
        settings: normalized,
        error: "Settings could not be saved right now.",
      };
    }
  }
}
