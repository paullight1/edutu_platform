import { Controller, Delete, Get, Post, Query, Res } from "@nestjs/common";
import type { Response } from "express";
import { GoogleCalendarService } from "./google-calendar.service";
import { CurrentUser } from "../auth/current-user.decorator";
import { Public } from "../auth/public.decorator";

@Controller("calendar/google")
export class CalendarController {
  constructor(private readonly service: GoogleCalendarService) {}

  @Get("connect")
  connect(@CurrentUser("id") userId: string) {
    const url = this.service.getAuthUrl(userId);
    return { url, configured: Boolean(url) };
  }

  // Google redirects the browser here (no auth header); the user is carried in state.
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
      ok = Boolean(code && state) && (await this.service.handleCallback(code, state));
    } catch {
      ok = false;
    }
    return res.redirect(`${appUrl}/goals?calendar=${ok ? "connected" : "error"}`);
  }

  @Get("status")
  status(@CurrentUser("id") userId: string) {
    return this.service.getStatus(userId);
  }

  @Delete("disconnect")
  disconnect(@CurrentUser("id") userId: string) {
    return this.service.disconnect(userId);
  }

  @Post("sync")
  sync(@CurrentUser("id") userId: string) {
    return this.service.syncNow(userId);
  }
}
