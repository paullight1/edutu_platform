import { Controller, Get } from "@nestjs/common";
import { Public } from "../auth";
import { SettingsService } from "./settings.service";
import {
  DEFAULT_ADMIN_SETTINGS,
  type OpportunityPipelineFeatureFlags,
  type WebAnnouncement,
  type WebHeroBanner,
} from "./settings.dto";

// User-submission policy surfaced to the web app so the submit screen can
// warn about fees/review before the user posts. Enforcement stays server-side.
interface WebSubmissionsPolicy {
  requireApproval: boolean;
  paidSubmissions: boolean;
  costCredits: number;
}

/**
 * Public (unauthenticated) remote config for the edutu.org web app — the web
 * equivalent of GET /mobile-control/config. Serves only admin-curated
 * settings (webContent announcement/banners/flags + the userContent submission
 * policy); never put secrets in it.
 *
 * Content falls back to its built-in defaults. Rollout flags fail closed: a
 * missing setting or settings outage keeps every dark-shipped surface disabled.
 */
@Controller("public")
export class WebConfigController {
  constructor(private readonly settingsService: SettingsService) {}

  @Public()
  @Get("web-config")
  async getWebConfig(): Promise<{
    announcement: WebAnnouncement;
    heroBanners: WebHeroBanner[];
    featureFlags: OpportunityPipelineFeatureFlags;
    submissions: WebSubmissionsPolicy;
    serverTime: string;
  }> {
    let heroBanners: WebHeroBanner[] = [];
    let announcement = DEFAULT_ADMIN_SETTINGS.webContent.announcement;
    let featureFlags = DEFAULT_ADMIN_SETTINGS.webContent.featureFlags;
    let userContent = DEFAULT_ADMIN_SETTINGS.userContent;

    try {
      const { settings } = await this.settingsService.getSettings();
      // Disabled banners are drafts — they stay admin-only.
      heroBanners = (settings.webContent?.heroBanners ?? []).filter(
        (banner) => banner.enabled,
      );
      announcement =
        settings.webContent?.announcement ??
        DEFAULT_ADMIN_SETTINGS.webContent.announcement;
      featureFlags =
        settings.webContent?.featureFlags ??
        DEFAULT_ADMIN_SETTINGS.webContent.featureFlags;
      userContent = settings.userContent ?? DEFAULT_ADMIN_SETTINGS.userContent;
    } catch {
      heroBanners = [];
      announcement = DEFAULT_ADMIN_SETTINGS.webContent.announcement;
      featureFlags = DEFAULT_ADMIN_SETTINGS.webContent.featureFlags;
      userContent = DEFAULT_ADMIN_SETTINGS.userContent;
    }

    return {
      announcement,
      heroBanners,
      featureFlags,
      submissions: {
        requireApproval: userContent.requireApproval,
        paidSubmissions: userContent.paidSubmissions,
        costCredits: userContent.submissionCostCredits,
      },
      serverTime: new Date().toISOString(),
    };
  }
}
