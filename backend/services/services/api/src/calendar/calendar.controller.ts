import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  Res,
} from "@nestjs/common";
import type { Response } from "express";
import {
  CalendarSyncService,
  type CalendarProvider,
} from "./calendar-sync.service";
import { CurrentUser } from "../auth/current-user.decorator";
import { Public } from "../auth/public.decorator";

const OAUTH_PROVIDERS = new Set(["google", "outlook"]);

@Controller("calendar")
export class CalendarController {
  constructor(private readonly service: CalendarSyncService) {}

  @Get("status")
  status(@CurrentUser("id") userId: string) {
    return this.service.getStatus(userId);
  }

  @Get("connect/:provider")
  connect(
    @CurrentUser("id") userId: string,
    @Param("provider") provider: string,
  ) {
    if (!OAUTH_PROVIDERS.has(provider)) {
      throw new BadRequestException("Unsupported OAuth provider");
    }
    const url = this.service.getAuthUrl(userId, provider as CalendarProvider);
    return { url, configured: Boolean(url) };
  }

  // OAuth redirect target — user carried in state as "<provider>:<userId>".
  @Public()
  @Get("callback")
  async callback(
    @Query("code") code: string,
    @Query("state") state: string,
    @Res() res: Response,
  ) {
    const appUrl =
      process.env.APP_URL || process.env.WEB_APP_URL || "https://www.edutu.org";
    let ok = false;
    try {
      const separator = state ? state.indexOf(":") : -1;
      if (code && separator > 0) {
        const provider = state.slice(0, separator) as CalendarProvider;
        const userId = state.slice(separator + 1);
        ok = await this.service.handleOAuthCallback(provider, code, userId);
      }
    } catch {
      ok = false;
    }
    return res.redirect(`${appUrl}/goals?calendar=${ok ? "connected" : "error"}`);
  }

  @Post("caldav/connect")
  async connectCaldav(
    @CurrentUser("id") userId: string,
    @Body() body: { username?: string; appPassword?: string; calendarUrl?: string },
  ) {
    if (!body?.username || !body?.appPassword) {
      throw new BadRequestException("Apple ID and app-specific password required");
    }
    const ok = await this.service.connectCaldav(
      userId,
      body.username,
      body.appPassword,
      body.calendarUrl,
    );
    return { success: ok };
  }

  @Post("feed")
  ensureFeed(@CurrentUser("id") userId: string) {
    return this.service.ensureFeedUrl(userId);
  }

  @Delete("disconnect/:provider")
  disconnect(
    @CurrentUser("id") userId: string,
    @Param("provider") provider: string,
  ) {
    return this.service.disconnect(userId, provider as CalendarProvider);
  }

  @Post("sync")
  sync(@CurrentUser("id") userId: string) {
    return this.service.syncNow(userId);
  }

  // Subscribable webcal feed (Apple/Google/Outlook). Public, token-authed.
  @Public()
  @Get("feed/:file")
  async feed(@Param("file") file: string, @Res() res: Response) {
    const token = file.replace(/\.ics$/i, "");
    const ics = await this.service.getFeedIcs(token, new Date());
    if (!ics) {
      res.status(404).send("Not found");
      return;
    }
    res.set("Content-Type", "text/calendar; charset=utf-8");
    res.send(ics);
  }
}
