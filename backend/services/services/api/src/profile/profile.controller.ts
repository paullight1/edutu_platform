import { Body, Controller, Get, Patch } from "@nestjs/common";
import { CurrentUser } from "../auth";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { NotificationsService } from "../notifications/notifications.service";
import { OpportunitiesService } from "../opportunities/opportunities.service";
import {
  OpportunityPreferenceSchema,
  type OpportunityPreferenceDto,
} from "../opportunities/dto/personalization.dto";
import {
  ProfileNotificationPreferencesSchema,
  UpdateProfileSchema,
  type ProfileNotificationPreferencesDto,
  type UpdateProfileDto,
} from "./dto/profile.dto";
import {
  type AuthenticatedProfileUser,
  ProfileService,
} from "./profile.service";

@Controller("profile")
export class ProfileController {
  constructor(
    private readonly profileService: ProfileService,
    private readonly opportunitiesService: OpportunitiesService,
    private readonly notificationsService: NotificationsService,
  ) {}

  @Get()
  getProfile(@CurrentUser() user: AuthenticatedProfileUser) {
    return this.profileService.getProfile(user);
  }

  @Patch()
  updateProfile(
    @CurrentUser("id") userId: string,
    @Body(new ZodValidationPipe(UpdateProfileSchema)) body: UpdateProfileDto,
  ) {
    return this.profileService.updateProfile(userId, body);
  }

  @Get("completeness")
  getCompleteness(@CurrentUser() user: AuthenticatedProfileUser) {
    return this.profileService.getCompleteness(user);
  }

  @Get("preferences")
  async getPreferences(@CurrentUser("id") userId: string) {
    const [opportunities, notifications] = await Promise.all([
      this.opportunitiesService.getUserOpportunityPreferences(userId),
      this.notificationsService.getPreferences(userId),
    ]);

    return { opportunities, notifications };
  }

  @Patch("preferences/opportunities")
  updateOpportunityPreferences(
    @CurrentUser("id") userId: string,
    @Body(new ZodValidationPipe(OpportunityPreferenceSchema))
    body: OpportunityPreferenceDto,
  ) {
    return this.opportunitiesService.updateUserOpportunityPreferences(
      userId,
      body,
    );
  }

  @Patch("preferences/notifications")
  updateNotificationPreferences(
    @CurrentUser("id") userId: string,
    @Body(new ZodValidationPipe(ProfileNotificationPreferencesSchema))
    body: ProfileNotificationPreferencesDto,
  ) {
    return this.notificationsService.savePreferences(userId, body);
  }
}
