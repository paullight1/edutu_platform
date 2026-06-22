import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { desc, eq } from "drizzle-orm";
import { db } from "../db";
import {
  goals,
  notificationPreferences,
  notifications,
  profiles,
} from "../db/schema";
import { toDatabaseUserId } from "../common/user-id";
import { MeService } from "../me/me.service";
import type {
  UpdateMemberSettingsDto,
  UpdateProfileDto,
} from "./dto/profile.dto";

export interface AuthenticatedProfileUser {
  id: string;
  authId?: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  role?: string;
  authProvider?: string;
}

@Injectable()
export class ProfileService {
  private readonly logger = new Logger(ProfileService.name);

  constructor(private readonly meService: MeService) {}

  async getProfile(user: AuthenticatedProfileUser) {
    const dbUserId = toDatabaseUserId(user.id);
    const profile = await this.findOrCreateProfile(dbUserId, user);

    return this.withCompleteness(profile);
  }

  async updateProfile(userId: string, dto: UpdateProfileDto) {
    const dbUserId = toDatabaseUserId(userId);
    const updateData = this.toProfileUpdate(dto);

    const [updated] = await db
      .update(profiles)
      .set(updateData)
      .where(eq(profiles.userId, dbUserId))
      .returning();

    if (!updated) {
      throw new NotFoundException("Profile not found");
    }

    return this.withCompleteness(updated);
  }

  async getCompleteness(user: AuthenticatedProfileUser) {
    const profile = await this.getProfile(user);
    return profile.completeness;
  }

  async getMemberSettings(user: AuthenticatedProfileUser) {
    const dbUserId = toDatabaseUserId(user.id);
    const profile = await this.findOrCreateProfile(dbUserId, user);
    return this.normalizeSettings(profile.settings);
  }

  async updateMemberSettings(
    user: AuthenticatedProfileUser,
    dto: UpdateMemberSettingsDto,
  ) {
    const dbUserId = toDatabaseUserId(user.id);
    const profile = await this.findOrCreateProfile(dbUserId, user);
    const current = this.normalizeSettings(profile.settings);
    const next = {
      privacy: {
        ...current.privacy,
        ...(dto.privacy || {}),
      },
      security: {
        ...current.security,
        ...(dto.security || {}),
      },
      updatedAt: new Date().toISOString(),
    };

    const [updated] = await db
      .update(profiles)
      .set({
        settings: next,
        updatedAt: new Date(),
      })
      .where(eq(profiles.userId, dbUserId))
      .returning();

    if (!updated) throw new NotFoundException("Profile not found");
    return this.normalizeSettings(updated.settings);
  }

  async requestDeletion(user: AuthenticatedProfileUser) {
    const settings = await this.updateServerSecuritySettings(user, {
      deletionRequested: true,
      deletionRequestedAt: new Date().toISOString(),
    });

    return { success: true, settings };
  }

  async exportAccountData(user: AuthenticatedProfileUser) {
    const dbUserId = toDatabaseUserId(user.id);
    const profile = await this.findOrCreateProfile(dbUserId, user);
    const now = new Date().toISOString();

    const [
      userGoals,
      notificationPreferenceRows,
      notificationRows,
      bookmarks,
      applications,
    ] = await Promise.all([
      db
        .select()
        .from(goals)
        .where(eq(goals.userId, dbUserId))
        .orderBy(desc(goals.createdAt)),
      db
        .select()
        .from(notificationPreferences)
        .where(eq(notificationPreferences.userId, dbUserId)),
      db
        .select()
        .from(notifications)
        .where(eq(notifications.userId, dbUserId))
        .orderBy(desc(notifications.createdAt))
        .limit(500),
      this.safeListBookmarks(dbUserId),
      this.safeListApplications(dbUserId),
    ]);

    const settings = await this.updateServerSecuritySettings(user, {
      lastDataDownload: now,
    });

    return {
      schemaVersion: 1,
      exportedAt: now,
      account: {
        userId: dbUserId,
        authId: user.authId || user.id,
        email: user.email || profile.email || null,
        displayName: profile.fullName || this.inferFullName(user),
      },
      profile: this.mapProfileForExport(profile),
      settings,
      data: {
        goals: userGoals.map((goal) => this.mapGoalForExport(goal)),
        savedOpportunities: bookmarks.map((bookmark) =>
          this.mapBookmarkForExport(bookmark),
        ),
        applications: applications.map((application) =>
          this.mapApplicationForExport(application),
        ),
        notifications: {
          preferences: notificationPreferenceRows[0]
            ? this.mapNotificationPreferencesForExport(
                notificationPreferenceRows[0],
              )
            : null,
          items: notificationRows.map((notification) =>
            this.mapNotificationForExport(notification),
          ),
        },
        analyticsSummary: null,
      },
      limits: {
        notifications: 500,
      },
    };
  }

  private async findOrCreateProfile(
    userId: string,
    user: AuthenticatedProfileUser,
  ) {
    const [existing] = await db
      .select()
      .from(profiles)
      .where(eq(profiles.userId, userId))
      .limit(1);

    if (existing) return existing;

    const [created] = await db
      .insert(profiles)
      .values({
        userId,
        email: user.email || null,
        fullName: this.inferFullName(user),
        role: user.role || "user",
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: profiles.userId,
        set: {
          email: user.email || null,
          updatedAt: new Date(),
        },
      })
      .returning();

    return created;
  }

  private inferFullName(user: AuthenticatedProfileUser) {
    const fullName = [user.firstName, user.lastName].filter(Boolean).join(" ");
    return fullName || null;
  }

  private toProfileUpdate(dto: UpdateProfileDto) {
    const updateData: Partial<typeof profiles.$inferInsert> = {
      updatedAt: new Date(),
    };

    if (Object.prototype.hasOwnProperty.call(dto, "fullName")) {
      updateData.fullName = dto.fullName ?? null;
    }

    if (Object.prototype.hasOwnProperty.call(dto, "email")) {
      updateData.email = dto.email ?? null;
    }

    if (Object.prototype.hasOwnProperty.call(dto, "country")) {
      updateData.country = dto.country ?? null;
    }

    if (Object.prototype.hasOwnProperty.call(dto, "school")) {
      updateData.school = dto.school ?? null;
    }

    if (
      Object.prototype.hasOwnProperty.call(dto, "courseOfStudy") ||
      Object.prototype.hasOwnProperty.call(dto, "major")
    ) {
      updateData.major = dto.courseOfStudy ?? dto.major ?? null;
    }

    if (Object.prototype.hasOwnProperty.call(dto, "degree")) {
      updateData.degree = dto.degree ?? null;
    }

    if (Object.prototype.hasOwnProperty.call(dto, "cgpa")) {
      updateData.cgpa = dto.cgpa == null ? null : String(dto.cgpa);
    }

    if (Object.prototype.hasOwnProperty.call(dto, "gradYear")) {
      updateData.gradYear = dto.gradYear ?? null;
    }

    if (Object.prototype.hasOwnProperty.call(dto, "dateOfBirth")) {
      updateData.dateOfBirth = dto.dateOfBirth ?? null;
      updateData.age = this.calculateAge(dto.dateOfBirth);
    }

    if (Object.prototype.hasOwnProperty.call(dto, "interestedCountries")) {
      updateData.interestedCountries = dto.interestedCountries ?? null;
    }

    if (Object.prototype.hasOwnProperty.call(dto, "interests")) {
      updateData.interests = dto.interests ?? null;
    }

    if (Object.prototype.hasOwnProperty.call(dto, "skills")) {
      updateData.skills = dto.skills ?? null;
    }

    return updateData;
  }

  private calculateAge(dateOfBirth?: string | null) {
    if (!dateOfBirth) return null;

    const birthDate = new Date(`${dateOfBirth}T00:00:00.000Z`);
    if (Number.isNaN(birthDate.getTime())) return null;

    const today = new Date();
    let age = today.getUTCFullYear() - birthDate.getUTCFullYear();
    const monthDelta = today.getUTCMonth() - birthDate.getUTCMonth();
    const hasBirthdayPassed =
      monthDelta > 0 ||
      (monthDelta === 0 && today.getUTCDate() >= birthDate.getUTCDate());

    if (!hasBirthdayPassed) {
      age -= 1;
    }

    return age >= 0 && age <= 130 ? age : null;
  }

  private defaultSettings() {
    return {
      privacy: {
        profileVisibility: "public" as const,
        dataSharing: false,
        analyticsTracking: true,
        personalizedAds: false,
        activityStatus: true,
        searchVisibility: true,
      },
      security: {
        twoFactorEnabled: false,
        lastPasswordUpdate: null as string | null,
        lastDataDownload: null as string | null,
        deletionRequested: false,
        deletionRequestedAt: null as string | null,
      },
      updatedAt: new Date(0).toISOString(),
    };
  }

  private normalizeSettings(value: unknown) {
    const defaults = this.defaultSettings();
    const raw =
      value && typeof value === "object"
        ? (value as Record<string, unknown>)
        : {};
    const privacy =
      raw.privacy && typeof raw.privacy === "object"
        ? (raw.privacy as Record<string, unknown>)
        : {};
    const security =
      raw.security && typeof raw.security === "object"
        ? (raw.security as Record<string, unknown>)
        : {};

    return {
      privacy: {
        ...defaults.privacy,
        ...privacy,
      },
      security: {
        ...defaults.security,
        ...security,
      },
      updatedAt:
        typeof raw.updatedAt === "string" ? raw.updatedAt : defaults.updatedAt,
    };
  }

  private async updateServerSecuritySettings(
    user: AuthenticatedProfileUser,
    securityUpdates: Partial<
      ReturnType<ProfileService["defaultSettings"]>["security"]
    >,
  ) {
    const dbUserId = toDatabaseUserId(user.id);
    const profile = await this.findOrCreateProfile(dbUserId, user);
    const current = this.normalizeSettings(profile.settings);
    const next = {
      ...current,
      security: {
        ...current.security,
        ...securityUpdates,
      },
      updatedAt: new Date().toISOString(),
    };

    const [updated] = await db
      .update(profiles)
      .set({
        settings: next,
        updatedAt: new Date(),
      })
      .where(eq(profiles.userId, dbUserId))
      .returning();

    if (!updated) throw new NotFoundException("Profile not found");
    return this.normalizeSettings(updated.settings);
  }

  private mapProfileForExport(profile: typeof profiles.$inferSelect) {
    const completeness = this.withCompleteness(profile).completeness;

    return {
      fullName: profile.fullName,
      country: profile.country,
      school: profile.school,
      courseOfStudy: profile.major,
      degree: profile.degree,
      cgpa: profile.cgpa,
      gradYear: profile.gradYear,
      dateOfBirth: profile.dateOfBirth,
      age: profile.age,
      interestedCountries: profile.interestedCountries ?? [],
      interests: profile.interests ?? [],
      skills: profile.skills ?? [],
      createdAt: profile.createdAt,
      updatedAt: profile.updatedAt,
      completeness,
    };
  }

  private mapGoalForExport(goal: typeof goals.$inferSelect) {
    return {
      id: goal.id,
      title: goal.title,
      description: goal.description,
      category: goal.category,
      progress: goal.progress,
      status: goal.status,
      deadline: goal.deadline,
      targetDate: goal.targetDate,
      priority: goal.priority,
      source: goal.source,
      templateId: goal.templateId,
      createdAt: goal.createdAt,
      updatedAt: goal.updatedAt,
      completedAt: goal.completedAt,
    };
  }

  private mapNotificationPreferencesForExport(
    preferences: typeof notificationPreferences.$inferSelect,
  ) {
    return {
      pushNotifications: preferences.pushNotifications,
      emailNotifications: preferences.emailNotifications,
      opportunityAlerts: preferences.opportunityAlerts,
      deadlineReminders: preferences.deadlineReminders,
      goalReminders: preferences.goalReminders,
      achievementCelebrations: preferences.achievementCelebrations,
      weeklyDigest: preferences.weeklyDigest,
      marketingEmails: preferences.marketingEmails,
      quietHours: preferences.quietHours,
      updatedAt: preferences.updatedAt,
    };
  }

  private mapNotificationForExport(
    notification: typeof notifications.$inferSelect,
  ) {
    return {
      id: notification.id,
      kind: notification.kind,
      title: notification.title,
      body: notification.body,
      severity: notification.severity,
      metadata: notification.metadata ?? {},
      createdAt: notification.createdAt,
      readAt: notification.readAt,
    };
  }

  private mapBookmarkForExport(bookmark: unknown) {
    const row = this.asRecord(bookmark);
    return {
      opportunityId: this.asNullableString(row.opportunity_id),
      savedAt: row.saved_at ?? row.created_at ?? null,
      priority: row.priority ?? null,
      notes: row.notes ?? null,
      opportunity: this.mapOpportunityForExport(row.opportunity),
    };
  }

  private mapApplicationForExport(application: unknown) {
    const row = this.asRecord(application);
    return {
      id: this.asNullableString(row.id),
      opportunityId: this.asNullableString(row.opportunity_id),
      status: this.asNullableString(row.status),
      notes: row.notes ?? null,
      metadata: this.asRecord(row.metadata),
      submittedAt: row.submitted_at ?? null,
      createdAt: row.created_at ?? null,
      updatedAt: row.updated_at ?? null,
      opportunity: this.mapOpportunityForExport(row.opportunity),
    };
  }

  private mapOpportunityForExport(opportunity: unknown) {
    const row = this.asRecord(opportunity);
    if (!Object.keys(row).length) return null;

    return {
      id: this.asNullableString(row.id),
      title: this.asNullableString(row.title),
      category: this.asNullableString(row.category),
      organization: this.asNullableString(row.organization),
      location: this.asNullableString(row.location),
      deadline: row.deadline ?? row.close_date ?? null,
      imageUrl: row.image_url ?? null,
      matchScore: row.match_score ?? null,
      qualityScore: row.quality_score ?? null,
    };
  }

  private asRecord(value: unknown): Record<string, unknown> {
    return value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : {};
  }

  private asNullableString(value: unknown) {
    return typeof value === "string" && value.length > 0 ? value : null;
  }

  private async safeListBookmarks(userId: string) {
    try {
      return await this.meService.listBookmarks(userId);
    } catch (error) {
      this.logger.warn(
        `Could not include bookmarks in account export: ${error instanceof Error ? error.message : String(error)}`,
      );
      return [];
    }
  }

  private async safeListApplications(userId: string) {
    try {
      return await this.meService.listApplications(userId);
    } catch (error) {
      this.logger.warn(
        `Could not include applications in account export: ${error instanceof Error ? error.message : String(error)}`,
      );
      return [];
    }
  }

  private withCompleteness(profile: typeof profiles.$inferSelect) {
    const checks = [
      {
        key: "fullName",
        label: "Full name",
        complete: Boolean(profile.fullName?.trim()),
      },
      {
        key: "email",
        label: "Email",
        complete: Boolean(profile.email?.trim()),
      },
      {
        key: "country",
        label: "Country",
        complete: Boolean(profile.country?.trim()),
      },
      {
        key: "school",
        label: "School",
        complete: Boolean(profile.school?.trim()),
      },
      {
        key: "courseOfStudy",
        label: "Course of study",
        complete: Boolean(profile.major?.trim()),
      },
      {
        key: "cgpa",
        label: "CGPA",
        complete: Boolean(profile.cgpa),
      },
      {
        key: "dateOfBirth",
        label: "Date of birth",
        complete: Boolean(profile.dateOfBirth),
      },
      {
        key: "interestedCountries",
        label: "Interested countries",
        complete: Boolean(profile.interestedCountries?.length),
      },
      {
        key: "interests",
        label: "Interest tags",
        complete: Boolean(profile.interests?.length),
      },
      {
        key: "skills",
        label: "Skills",
        complete: Boolean(profile.skills?.length),
      },
    ];
    const completed = checks.filter((check) => check.complete).length;
    const missing = checks
      .filter((check) => !check.complete)
      .map((check) => ({ key: check.key, label: check.label }));

    return {
      ...profile,
      completeness: {
        percent: Math.round((completed / checks.length) * 100),
        completed,
        total: checks.length,
        missing,
      },
    };
  }
}
