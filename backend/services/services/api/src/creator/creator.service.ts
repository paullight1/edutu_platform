import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from "@nestjs/common";
import { db } from "../db";
import {
  creatorApplications,
  profiles,
  marketplaceListings,
  marketplaceEnrollments,
  transactions,
} from "../db/schema";
import { eq, and, desc } from "drizzle-orm";
import { NotificationsService } from "../notifications/notifications.service";

const PLATFORM_FEE_PERCENT = 15; // Platform takes 15%, creator keeps 85%

interface CreatorListingPayload {
  title: string;
  description?: string;
  category: string;
  type?: "free" | "paid" | "credit" | "course";
  price?: number;
  imageUrl?: string;
  tags?: string[];
  eventDate?: string | Date;
  eventEndDate?: string | Date;
  eventLocation?: string;
  capacity?: number;
}

@Injectable()
export class CreatorService {
  private readonly logger = new Logger(CreatorService.name);

  constructor(private readonly notificationsService: NotificationsService) {}

  // ─── Creator Application ───────────────────────────────────────────────────

  async submitApplication(
    userId: string,
    payload: {
      displayName: string;
      bio: string;
      contentType: string;
      experience: string;
      sampleContentUrl?: string;
    },
  ) {
    // Prevent duplicate pending applications
    const existing = await db
      .select()
      .from(creatorApplications)
      .where(
        and(
          eq(creatorApplications.userId, userId),
          eq(creatorApplications.status, "pending"),
        ),
      )
      .execute();

    if (existing.length > 0) {
      throw new BadRequestException(
        "You already have a pending creator application.",
      );
    }

    const [app] = await db
      .insert(creatorApplications)
      .values({
        userId,
        displayName: payload.displayName,
        bio: payload.bio,
        contentType: payload.contentType,
        experience: payload.experience,
        sampleContentUrl: payload.sampleContentUrl,
        status: "pending",
      })
      .returning()
      .execute();

    const [profile] = await db
      .select({
        creatorMetadata: profiles.creatorMetadata,
      })
      .from(profiles)
      .where(eq(profiles.userId, userId))
      .limit(1)
      .execute();

    await db
      .update(profiles)
      .set({
        creatorStatus: "pending",
        creatorRejectionReason: null,
        creatorMetadata: {
          ...this.toRecord(profile?.creatorMetadata),
          lastApplication: {
            applicationId: app.id,
            displayName: payload.displayName,
            bio: payload.bio,
            contentType: payload.contentType,
            experience: payload.experience,
            sampleContentUrl: payload.sampleContentUrl ?? null,
            submittedAt: new Date().toISOString(),
          },
        },
        updatedAt: new Date(),
      })
      .where(eq(profiles.userId, userId))
      .execute();

    return app;
  }

  async getApplicationStatus(userId: string) {
    const [app] = await db
      .select()
      .from(creatorApplications)
      .where(eq(creatorApplications.userId, userId))
      .orderBy(desc(creatorApplications.submittedAt))
      .limit(1)
      .execute();
    return app || null;
  }

  // ─── Admin: Approve / Reject ───────────────────────────────────────────────

  async listApplications(status?: string) {
    const query = db
      .select()
      .from(creatorApplications)
      .orderBy(desc(creatorApplications.submittedAt));
    return status
      ? (await query.execute()).filter((a) => a.status === status)
      : query.execute();
  }

  async reviewApplication(
    applicationId: string,
    adminId: string,
    decision: "approved" | "rejected",
    adminNote?: string,
  ) {
    const [app] = await db
      .select()
      .from(creatorApplications)
      .where(eq(creatorApplications.id, applicationId))
      .execute();
    if (!app) throw new NotFoundException("Application not found");

    const [profile] = await db
      .select({
        creatorMetadata: profiles.creatorMetadata,
      })
      .from(profiles)
      .where(eq(profiles.userId, app.userId))
      .limit(1)
      .execute();

    // Update the application
    await db
      .update(creatorApplications)
      .set({
        status: decision,
        adminNote,
        reviewedBy: adminId,
        reviewedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(creatorApplications.id, applicationId))
      .execute();

    // Update the user's creatorStatus in their profile
    await db
      .update(profiles)
      .set({
        creatorStatus: decision,
        creatorRejectionReason:
          decision === "rejected" ? (adminNote ?? null) : null,
        creatorMetadata: {
          ...this.toRecord(profile?.creatorMetadata),
          lastReview: {
            applicationId,
            decision,
            adminNote: adminNote ?? null,
            reviewedBy: adminId,
            reviewedAt: new Date().toISOString(),
          },
        },
        updatedAt: new Date(),
      })
      .where(eq(profiles.userId, app.userId))
      .execute();

    try {
      await this.notificationsService.broadcast(adminId, {
        title:
          decision === "approved"
            ? "Creator application approved"
            : "Creator application update",
        body:
          decision === "approved"
            ? `Your creator application for ${app.displayName} has been approved.`
            : adminNote ||
              "Your creator application was not approved at this time.",
        kind: "admin-broadcast",
        severity: decision === "approved" ? "success" : "warning",
        audience: "specific",
        targetUserIds: [app.userId],
        channels: {
          inApp: true,
          push: false,
          email: false,
        },
        metadata: {
          applicationId,
          creatorStatus: decision,
          adminNote: adminNote ?? null,
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Creator notification broadcast failed: ${message}`);
    }

    this.logger.log(
      `Creator application ${applicationId} → ${decision} by admin ${adminId}`,
    );
    return { success: true, decision };
  }

  // ─── Creator Dashboard ────────────────────────────────────────────────────

  async getCreatorDashboard(userId: string) {
    // Guard: only approved creators
    const [profile] = await db
      .select()
      .from(profiles)
      .where(eq(profiles.userId, userId))
      .execute();
    if (!profile || profile.creatorStatus !== "approved") {
      throw new ForbiddenException("Creator access not granted.");
    }

    const myListings = await db
      .select()
      .from(marketplaceListings)
      .where(eq(marketplaceListings.sellerId, userId))
      .orderBy(desc(marketplaceListings.createdAt))
      .execute();

    // Aggregate enrollments across all creator's listings
    const totalEnrollments = myListings.reduce(
      (sum, l) => sum + (l.enrollmentCount || 0),
      0,
    );

    // Fetch their earnings from transactions
    const earningsTx = await db
      .select()
      .from(transactions)
      .where(
        and(
          eq(transactions.userId, userId),
          eq(transactions.type, "creator_earning"),
        ),
      )
      .orderBy(desc(transactions.createdAt))
      .limit(20)
      .execute();

    const totalEarnings = earningsTx.reduce((sum, tx) => sum + tx.amount, 0);

    return {
      listings: myListings,
      totalListings: myListings.length,
      totalEnrollments,
      totalEarnings,
      recentEarnings: earningsTx,
      platformFeePercent: PLATFORM_FEE_PERCENT,
      creatorCutPercent: 100 - PLATFORM_FEE_PERCENT,
    };
  }

  // ─── Create Listing ────────────────────────────────────────────────────────

  async createListing(userId: string, payload: CreatorListingPayload) {
    const [profile] = await db
      .select()
      .from(profiles)
      .where(eq(profiles.userId, userId))
      .execute();
    if (!profile || profile.creatorStatus !== "approved") {
      throw new ForbiddenException("Only approved creators can list items.");
    }

    const price = payload.price ?? 0;

    const [listing] = await db
      .insert(marketplaceListings)
      .values({
        sellerId: userId,
        title: payload.title,
        description: payload.description,
        category: payload.category,
        type: payload.type || (price > 0 ? "paid" : "free"),
        price,
        imageUrl: payload.imageUrl,
        tags: payload.tags || [],
        eventDate: payload.eventDate ? new Date(payload.eventDate) : null,
        eventEndDate: payload.eventEndDate
          ? new Date(payload.eventEndDate)
          : null,
        eventLocation: payload.eventLocation,
        capacity: payload.capacity,
        status: "pending", // Requires admin approval before going live
      })
      .returning()
      .execute();

    return listing;
  }

  // ─── Enroll / Purchase ────────────────────────────────────────────────────

  async enrollInListing(userId: string, listingId: string) {
    const [listing] = await db
      .select()
      .from(marketplaceListings)
      .where(eq(marketplaceListings.id, listingId))
      .execute();
    if (!listing) throw new NotFoundException("Listing not found");
    if (listing.status !== "active")
      throw new BadRequestException("This listing is not currently available.");

    const [userProfile] = await db
      .select()
      .from(profiles)
      .where(eq(profiles.userId, userId))
      .execute();
    if (!userProfile) throw new NotFoundException("User profile not found");

    if (
      (listing.price ?? 0) > 0 &&
      (userProfile.creditsBalance ?? 0) < (listing.price ?? 0)
    ) {
      throw new BadRequestException(
        `Insufficient credits. Need ${listing.price}, have ${userProfile.creditsBalance}.`,
      );
    }

    // Check not already enrolled
    const existing = await db
      .select()
      .from(marketplaceEnrollments)
      .where(
        and(
          eq(marketplaceEnrollments.userId, userId),
          eq(marketplaceEnrollments.listingId, listingId),
        ),
      )
      .execute();
    if (existing.length > 0) throw new BadRequestException("Already enrolled.");

    // Deduct credits from buyer
    if ((listing.price ?? 0) > 0) {
      await db
        .update(profiles)
        .set({
          creditsBalance:
            (userProfile.creditsBalance ?? 0) - (listing.price ?? 0),
          updatedAt: new Date(),
        })
        .where(eq(profiles.userId, userId))
        .execute();

      // Log buyer's payment transaction
      await db
        .insert(transactions)
        .values({
          userId,
          amount: -(listing.price ?? 0),
          type: "marketplace_purchase",
          status: "completed",
          referenceId: listingId,
          description: `Purchased: ${listing.title}`,
        })
        .execute();

      // Credit creator their 85% cut
      const creatorCut = Math.floor(
        ((listing.price ?? 0) * (100 - PLATFORM_FEE_PERCENT)) / 100,
      );
      const [sellerProfile] = await db
        .select()
        .from(profiles)
        .where(eq(profiles.userId, listing.sellerId))
        .execute();
      if (sellerProfile) {
        await db
          .update(profiles)
          .set({
            creditsBalance: (sellerProfile.creditsBalance ?? 0) + creatorCut,
            updatedAt: new Date(),
          })
          .where(eq(profiles.userId, listing.sellerId))
          .execute();

        // Log seller earning transaction
        await db
          .insert(transactions)
          .values({
            userId: listing.sellerId,
            amount: creatorCut,
            type: "creator_earning",
            status: "completed",
            referenceId: listingId,
            description: `Earning from: ${listing.title}`,
          })
          .execute();
      }
    }

    // Create enrollment record
    const [enrollment] = await db
      .insert(marketplaceEnrollments)
      .values({
        userId,
        listingId,
        status: "active",
        creditsSpent: listing.price,
      })
      .returning()
      .execute();

    // Increment enrollment count
    await db
      .update(marketplaceListings)
      .set({
        enrollmentCount: (listing.enrollmentCount || 0) + 1,
        updatedAt: new Date(),
      })
      .where(eq(marketplaceListings.id, listingId))
      .execute();

    return enrollment;
  }

  // ─── Wallet ────────────────────────────────────────────────────────────────

  async getWallet(userId: string) {
    const [profile] = await db
      .select()
      .from(profiles)
      .where(eq(profiles.userId, userId))
      .execute();
    const txHistory = await db
      .select()
      .from(transactions)
      .where(eq(transactions.userId, userId))
      .orderBy(desc(transactions.createdAt))
      .limit(30)
      .execute();

    return {
      balance: profile?.creditsBalance ?? 0,
      transactions: txHistory,
    };
  }

  private toRecord(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return {};
    }

    return value as Record<string, unknown>;
  }
}
