import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  UseGuards,
} from "@nestjs/common";
import { AdminGuard, CurrentUser } from "../auth";
import { MobileControlService, TABLES } from "./mobile-control.service";
import type {
  MobileCampaign,
  MobileFeatureFlag,
  WidgetFeed,
} from "./mobile-control.types";

@Controller("admin")
@UseGuards(AdminGuard)
export class MobileControlAdminController {
  constructor(private readonly mobileControlService: MobileControlService) {}

  @Get("mobile-campaigns")
  listCampaigns() {
    return this.mobileControlService.listAdmin<MobileCampaign>(
      TABLES.campaigns,
    );
  }

  @Post("mobile-campaigns")
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

  @Put("mobile-campaigns/:id")
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

  @Delete("mobile-campaigns/:id")
  deleteCampaign(@Param("id") id: string) {
    return this.mobileControlService.deleteAdmin(TABLES.campaigns, id);
  }

  @Get("mobile-feature-flags")
  listFeatureFlags() {
    return this.mobileControlService.listAdmin<MobileFeatureFlag>(
      TABLES.featureFlags,
    );
  }

  @Post("mobile-feature-flags")
  createFeatureFlag(@Body() body: Partial<MobileFeatureFlag>) {
    return this.mobileControlService.createAdmin<MobileFeatureFlag>(
      TABLES.featureFlags,
      body,
    );
  }

  @Put("mobile-feature-flags/:id")
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

  @Delete("mobile-feature-flags/:id")
  deleteFeatureFlag(@Param("id") id: string) {
    return this.mobileControlService.deleteAdmin(TABLES.featureFlags, id);
  }

  @Get("widget-feeds")
  listWidgetFeeds() {
    return this.mobileControlService.listAdmin<WidgetFeed>(TABLES.widgetFeeds);
  }

  @Post("widget-feeds")
  createWidgetFeed(@Body() body: Partial<WidgetFeed>) {
    return this.mobileControlService.createAdmin<WidgetFeed>(
      TABLES.widgetFeeds,
      body,
    );
  }

  @Put("widget-feeds/:id")
  updateWidgetFeed(@Param("id") id: string, @Body() body: Partial<WidgetFeed>) {
    return this.mobileControlService.updateAdmin<WidgetFeed>(
      TABLES.widgetFeeds,
      id,
      body,
    );
  }

  @Delete("widget-feeds/:id")
  deleteWidgetFeed(@Param("id") id: string) {
    return this.mobileControlService.deleteAdmin(TABLES.widgetFeeds, id);
  }
}
