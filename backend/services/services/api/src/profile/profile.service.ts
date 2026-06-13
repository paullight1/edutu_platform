import { Injectable, NotFoundException } from "@nestjs/common";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { profiles } from "../db/schema";
import { toDatabaseUserId } from "../common/user-id";
import type { UpdateProfileDto } from "./dto/profile.dto";

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

    if (Object.prototype.hasOwnProperty.call(dto, "skills")) {
      updateData.skills = dto.skills ?? null;
    }

    return updateData;
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
