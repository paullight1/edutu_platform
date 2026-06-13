import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from "@nestjs/common";
import { AdminGuard, CurrentUser, Public } from "../auth";
import { MobileControlService, TABLES } from "./mobile-control.service";
import type {
  CampaignEventDto,
  MobileCampaign,
  MobileFeatureFlag,
  WidgetFeed,
} from "./mobile-control.types";

@Controller("mobile-control")
export class MobileControlController {
  constructor(private readonly mobileControlService: MobileControlService) {}

  @Public()
  @Get("config")
  getConfig() {
    return this.mobileControlService.getConfig();
  }

  @Post("events")
  recordEvent(
    @CurrentUser("id") userId: string,
    @Body() body: CampaignEventDto,
  ) {
    return this.mobileControlService.recordCampaignEvent(userId, body);
  }

  @Get("admin/campaigns")
  @UseGuards(AdminGuard)
  listCampaigns() {
    return this.mobileControlService.listAdmin<MobileCampaign>(
      TABLES.campaigns,
    );
  }

  @Post("admin/campaigns")
  @UseGuards(AdminGuard)
  createCampaign(
    @CurrentUser("id") userId: string,
    @Body() body: Partial<MobileCampaign>,
  ) {
    return this.mobileControlService.createAdmin<MobileCampaign>(
      TABLES.campaigns,
      body,
      userId,
    );
  }

  @Patch("admin/campaigns/:id")
  @UseGuards(AdminGuard)
  updateCampaign(
    @Param("id") id: string,
    @Body() body: Partial<MobileCampaign>,
  ) {
    return this.mobileControlService.updateAdmin<MobileCampaign>(
      TABLES.campaigns,
      id,
      body,
    );
  }

  @Delete("admin/campaigns/:id")
  @UseGuards(AdminGuard)
  deleteCampaign(@Param("id") id: string) {
    return this.mobileControlService.deleteAdmin(TABLES.campaigns, id);
  }

  @Get("admin/feature-flags")
  @UseGuards(AdminGuard)
  listFeatureFlags() {
    return this.mobileControlService.listAdmin<MobileFeatureFlag>(
      TABLES.featureFlags,
    );
  }

  @Post("admin/feature-flags")
  @UseGuards(AdminGuard)
  createFeatureFlag(@Body() body: Partial<MobileFeatureFlag>) {
    return this.mobileControlService.createAdmin<MobileFeatureFlag>(
      TABLES.featureFlags,
      body,
    );
  }

  @Patch("admin/feature-flags/:id")
  @UseGuards(AdminGuard)
  updateFeatureFlag(
    @Param("id") id: string,
    @Body() body: Partial<MobileFeatureFlag>,
  ) {
    return this.mobileControlService.updateAdmin<MobileFeatureFlag>(
      TABLES.featureFlags,
      id,
      body,
    );
  }

  @Delete("admin/feature-flags/:id")
  @UseGuards(AdminGuard)
  deleteFeatureFlag(@Param("id") id: string) {
    return this.mobileControlService.deleteAdmin(TABLES.featureFlags, id);
  }

  @Get("admin/widget-feeds")
  @UseGuards(AdminGuard)
  listWidgetFeeds() {
    return this.mobileControlService.listAdmin<WidgetFeed>(TABLES.widgetFeeds);
  }

  @Post("admin/widget-feeds")
  @UseGuards(AdminGuard)
  createWidgetFeed(@Body() body: Partial<WidgetFeed>) {
    return this.mobileControlService.createAdmin<WidgetFeed>(
      TABLES.widgetFeeds,
      body,
    );
  }

  @Patch("admin/widget-feeds/:id")
  @UseGuards(AdminGuard)
  updateWidgetFeed(@Param("id") id: string, @Body() body: Partial<WidgetFeed>) {
    return this.mobileControlService.updateAdmin<WidgetFeed>(
      TABLES.widgetFeeds,
      id,
      body,
    );
  }

  @Delete("admin/widget-feeds/:id")
  @UseGuards(AdminGuard)
  deleteWidgetFeed(@Param("id") id: string) {
    return this.mobileControlService.deleteAdmin(TABLES.widgetFeeds, id);
  }
}
