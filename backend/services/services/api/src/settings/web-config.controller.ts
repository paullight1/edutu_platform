import { Controller, Get } from "@nestjs/common";
import { Public } from "../auth";
import { SettingsService } from "./settings.service";
import {
  DEFAULT_ADMIN_SETTINGS,
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
 * settings (webContent announcement/banners + the userContent submission policy); never
 * put secrets in it.
 *
 * Fail-open: if settings can't be read the web app receives an empty banner
 * list (keeps its built-in hardcoded hero carousel) and the default
 * submission policy (review everything, no fee).
 */
@Controller("public")
export class WebConfigController {
  constructor(private readonly settingsService: SettingsService) {}

  @Public()
  @Get("web-config")
  async getWebConfig(): Promise<{
    announcement: WebAnnouncement;
    heroBanners: WebHeroBanner[];
    submissions: WebSubmissionsPolicy;
    serverTime: string;
  }> {
    let heroBanners: WebHeroBanner[] = [];
    let announcement = DEFAULT_ADMIN_SETTINGS.webContent.announcement;
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
      userContent = settings.userContent ?? DEFAULT_ADMIN_SETTINGS.userContent;
    } catch {
      heroBanners = [];
      announcement = DEFAULT_ADMIN_SETTINGS.webContent.announcement;
      userContent = DEFAULT_ADMIN_SETTINGS.userContent;
    }

    return {
      announcement,
      heroBanners,
      submissions: {
        requireApproval: userContent.requireApproval,
        paidSubmissions: userContent.paidSubmissions,
        costCredits: userContent.submissionCostCredits,
      },
      serverTime: new Date().toISOString(),
    };
  }
}
