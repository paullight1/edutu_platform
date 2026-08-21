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
  roadmaps,
} from "../db/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import { NotificationsService } from "../notifications/notifications.service";
import type { CreatorApplicationDto } from "./dto/creator.dto";
import { toDatabaseUserId } from "../common/user-id";
import { isApprovedMentor, deriveMentorStatus } from "../common/mentor-access";
import { computeMentorStats } from "./mentor-stats";
import {
  marketplaceEarningsTotalQuery,
  marketplaceLedgerEntryQuery,
  marketplaceLedgerHistoryQuery,
  rowsFromExecution,
} from "./marketplace-credit-ledger";

const PLATFORM_FEE_PERCENT = 15; // Platform takes 15%, creator keeps 85%

interface CreatorListingPayload {
  title: string;
  description?: string;
  category: string;
  type?: "free" | "paid" | "credit" | "course";
  price?: number;
  imageUrl?: string;
  previewUrl?: string;
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

  // profiles.user_id and creator_applications.user_id both hold either a raw
  // Clerk sub or its safe-uuid form (SQL clerk_id_to_uuid ≡ JS toDatabaseUserId
  // ≡ mobile toSafeUUID), depending on which client wrote the row — always
  // match either representation.
  private userMatch(column: { name: string }, userId: string) {
    return sql`(${sql.identifier(column.name)}::text = ${userId} OR public.clerk_id_to_uuid(${sql.identifier(column.name)}::text) = ${userId})`;
  }

  // The web admin panel reads legacy snake_case names alongside the canonical
  // camelCase ones (and the pre-unification adminNote/submittedAt fields), so
  // API responses carry both.
  private serializeApplication(row: typeof creatorApplications.$inferSelect) {
    return {
      ...row,
      adminNote: row.reviewerNotes ?? null,
      submittedAt: row.appliedAt ?? null,
      full_name: row.displayName ?? null,
      opportunity_type: row.opportunityType ?? null,
      opportunity_name: row.opportunityTitle ?? null,
      linkedin_url: row.linkedinUrl ?? null,
      portfolio_url: row.portfolioUrl ?? null,
      kyc_image_url: row.kycImageUrl ?? null,
      proof_url: row.proofUrl ?? null,
      social_links: row.socialLinks ?? null,
      reviewer_notes: row.reviewerNotes ?? null,
      applied_at: row.appliedAt ?? null,
      reviewed_at: row.reviewedAt ?? null,
    };
  }

  async submitApplication(userId: string, payload: CreatorApplicationDto) {
    const kind = payload.applicationKind ?? "creator";

    // Prevent duplicate pending applications of the same kind
    const existing = await db
      .select({ id: creatorApplications.id })
      .from(creatorApplications)
      .where(
        and(
          this.userMatch(creatorApplications.userId, userId),
          eq(creatorApplications.status, "pending"),
          eq(creatorApplications.applicationKind, kind),
        ),
      )
      .execute();

    if (existing.length > 0) {
      throw new BadRequestException(
        `You already have a pending ${kind} application.`,
      );
    }

    const [app] = await db
      .insert(creatorApplications)
      .values({
        userId,
        applicationKind: kind,
        displayName: payload.displayName,
        bio: payload.bio,
        contentType: payload.contentType,
        experience: payload.experience,
        sampleContentUrl: payload.sampleContentUrl || null,
        motivation: payload.motivation,
        opportunityType: payload.opportunityType,
        opportunityTitle: payload.opportunityTitle,
        linkedinUrl: payload.linkedinUrl,
        portfolioUrl: payload.portfolioUrl,
        socialLinks: payload.socialLinks,
        kycImageUrl: payload.kycImageUrl,
        proofUrl: payload.proofUrl || null,
        proofPath: payload.proofPath,
        proofFileName: payload.proofFileName,
        proofFileType: payload.proofFileType,
        proofFileSize: payload.proofFileSize,
        consentAccepted: payload.consentAccepted ?? false,
        email: payload.email,
        phoneNumber: payload.phoneNumber,
        country: payload.country,
        status: "pending",
      })
      .returning()
      .execute();

    const [profile] = await db
      .select({
        creatorMetadata: profiles.creatorMetadata,
      })
      .from(profiles)
      .where(this.userMatch(profiles.userId, userId))
      .limit(1)
      .execute();

    await db
      .update(profiles)
      .set({
        ...(kind === "mentor"
          ? { mentorStatus: "pending" }
          : { creatorStatus: "pending", creatorRejectionReason: null }),
        creatorMetadata: {
          ...this.toRecord(profile?.creatorMetadata),
          lastApplication: {
            applicationId: app.id,
            applicationKind: kind,
            displayName: payload.displayName ?? null,
            bio: payload.bio ?? null,
            contentType: payload.contentType ?? null,
            experience: payload.experience ?? null,
            sampleContentUrl: payload.sampleContentUrl ?? null,
            submittedAt: new Date().toISOString(),
          },
        },
        updatedAt: new Date(),
      })
      .where(this.userMatch(profiles.userId, userId))
      .execute();

    return this.serializeApplication(app);
  }

  async getApplicationStatus(
    userId: string,
    applicationKind: "creator" | "mentor" = "mentor",
  ) {
    const [app] = await db
      .select()
      .from(creatorApplications)
      .where(
        and(
          this.userMatch(creatorApplications.userId, userId),
          eq(creatorApplications.applicationKind, applicationKind),
        ),
      )
      .orderBy(desc(creatorApplications.appliedAt))
      .limit(1)
      .execute();

    // The SQL predicate above is the source of truth. Keep this guard as a
    // fail-closed boundary so a future query refactor can never expose a
    // creator application through the mentor status endpoint (or vice versa).
    return app?.applicationKind === applicationKind
      ? this.serializeApplication(app)
      : null;
  }

  // ─── Admin: Approve / Reject ───────────────────────────────────────────────

  async listApplications(status?: string) {
    const rows = await db
      .select()
      .from(creatorApplications)
      .where(status ? eq(creatorApplications.status, status) : undefined)
      .orderBy(desc(creatorApplications.appliedAt))
      .execute();
    return rows.map((row) => this.serializeApplication(row));
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

    const kind = app.applicationKind === "mentor" ? "mentor" : "creator";

    const [profile] = await db
      .select({
        creatorMetadata: profiles.creatorMetadata,
      })
      .from(profiles)
      .where(this.userMatch(profiles.userId, app.userId))
      .limit(1)
      .execute();

    // Update the application (reviewer_notes is the canonical note column —
    // the same one the mobile admin's review_creator_application RPC writes)
    await db
      .update(creatorApplications)
      .set({
        status: decision,
        reviewerNotes: adminNote,
        reviewedBy: adminId,
        reviewedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(creatorApplications.id, applicationId))
      .execute();

    // Grant/deny the profile-level status the clients actually read,
    // routed by application kind like the mobile RPC.
    await db
      .update(profiles)
      .set({
        ...(kind === "mentor"
          ? { mentorStatus: decision }
          : {
              creatorStatus: decision,
              creatorRejectionReason:
                decision === "rejected" ? (adminNote ?? null) : null,
            }),
        creatorMetadata: {
          ...this.toRecord(profile?.creatorMetadata),
          lastReview: {
            applicationId,
            applicationKind: kind,
            decision,
            adminNote: adminNote ?? null,
            reviewedBy: adminId,
            reviewedAt: new Date().toISOString(),
          },
        },
        updatedAt: new Date(),
      })
      .where(this.userMatch(profiles.userId, app.userId))
      .execute();

    const applicantLabel =
      app.displayName || app.opportunityTitle || "your application";

    try {
      await this.notificationsService.broadcast(adminId, {
        title:
          decision === "approved"
            ? `${kind === "mentor" ? "Mentor" : "Creator"} application approved`
            : `${kind === "mentor" ? "Mentor" : "Creator"} application update`,
        body:
          decision === "approved"
            ? `Your ${kind} application for ${applicantLabel} has been approved.`
            : adminNote ||
              `Your ${kind} application was not approved at this time.`,
        kind: "application-status",
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
          applicationKind: kind,
          creatorStatus: decision,
          adminNote: adminNote ?? null,
        },
        dedupeKey: `creator-application-status:${applicationId}:${decision}`,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Creator notification broadcast failed: ${message}`);
    }

    this.logger.log(
      `${kind} application ${applicationId} → ${decision} by admin ${adminId}`,
    );
    return { success: true, decision };
  }

  // ─── Creator Dashboard ────────────────────────────────────────────────────

  async getCreatorDashboard(userId: string) {
    const dbUserId = toDatabaseUserId(userId);

    // Guard: approved creators OR approved mentors
    const [profile] = await db
      .select()
      .from(profiles)
      .where(this.userMatch(profiles.userId, userId))
      .execute();
    if (!isApprovedMentor(profile)) {
      throw new ForbiddenException("Creator access not granted.");
    }

    const myListings = await db
      .select()
      .from(marketplaceListings)
      .where(eq(marketplaceListings.sellerId, dbUserId))
      .orderBy(desc(marketplaceListings.createdAt))
      .execute();

    // Aggregate enrollments across all creator's listings
    const totalEnrollments = myListings.reduce(
      (sum, l) => sum + (l.enrollmentCount || 0),
      0,
    );
    const activeListings = myListings.filter(
      (l) => l.status === "active",
    ).length;

    const earningsTotalResult = await db.execute(
      marketplaceEarningsTotalQuery(dbUserId),
    );
    const totalEarnings = Number(
      rowsFromExecution<{ total: number | string }>(earningsTotalResult)[0]
        ?.total ?? 0,
    );

    const recentEarningsResult = await db.execute(
      marketplaceLedgerHistoryQuery(dbUserId, 20, "creator_earning"),
    );
    const recentEarnings =
      rowsFromExecution<Record<string, unknown>>(recentEarningsResult);

    // Roadmap aggregates — roadmaps are keyed by the derived uuid.
    const myRoadmaps = await db
      .select()
      .from(roadmaps)
      .where(eq(roadmaps.createdBy, dbUserId))
      .execute();

    // Only "published" roadmaps count toward the mentor's reach: a "draft"/
    // "personal"/"archived" roadmap isn't public content, so its enrollment
    // and rating figures (which should always be 0 in practice, since only
    // published roadmaps are enrollable/rateable) don't belong in the impact
    // stats — mirrors the publishedRoadmaps filter below.
    const publishedRoadmapRows = myRoadmaps.filter(
      (r) => r.status === "published",
    );
    const publishedRoadmaps = publishedRoadmapRows.length;
    const roadmapEnrollments = publishedRoadmapRows.reduce(
      (s, r) => s + (r.enrollmentCount ?? 0),
      0,
    );
    const ratingCount = publishedRoadmapRows.reduce(
      (s, r) => s + (r.ratingCount ?? 0),
      0,
    );
    const ratingSum = publishedRoadmapRows.reduce(
      (s, r) => s + Number(r.ratingAvg ?? 0) * (r.ratingCount ?? 0),
      0,
    );

    const stats = computeMentorStats({
      publishedRoadmaps,
      activeListings,
      roadmapEnrollments,
      listingEnrollments: totalEnrollments,
      totalCreditsEarned: totalEarnings,
      walletBalance: profile?.creditsBalance ?? 0,
      ratingSum,
      ratingCount,
      mentorStatus: deriveMentorStatus(profile),
    });

    return {
      listings: myListings,
      totalListings: myListings.length,
      totalEnrollments,
      totalEarnings,
      recentEarnings,
      platformFeePercent: PLATFORM_FEE_PERCENT,
      creatorCutPercent: 100 - PLATFORM_FEE_PERCENT,
      stats,
    };
  }

  // ─── Create Listing ────────────────────────────────────────────────────────

  async createListing(userId: string, payload: CreatorListingPayload) {
    const [profile] = await db
      .select()
      .from(profiles)
      .where(this.userMatch(profiles.userId, userId))
      .execute();
    if (!profile || !isApprovedMentor(profile)) {
      throw new ForbiddenException("Only approved creators can list items.");
    }

    const price = payload.price ?? 0;
    const dbUserId = toDatabaseUserId(userId);

    const [listing] = await db
      .insert(marketplaceListings)
      .values({
        sellerId: dbUserId,
        title: payload.title,
        description: payload.description,
        category: payload.category,
        type: payload.type || (price > 0 ? "paid" : "free"),
        price,
        imageUrl: payload.imageUrl,
        previewUrl: payload.previewUrl,
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
    const dbUserId = toDatabaseUserId(userId);

    return db.transaction(async (tx) => {
      // Lock the listing first. This serializes capacity checks and protects the
      // denormalized enrollment counter from concurrent purchases.
      const [listing] = await tx
        .select()
        .from(marketplaceListings)
        .where(eq(marketplaceListings.id, listingId))
        .limit(1)
        .for("update")
        .execute();
      if (!listing) throw new NotFoundException("Listing not found");
      if (listing.status !== "active") {
        throw new BadRequestException(
          "This listing is not currently available.",
        );
      }

      // Idempotent retry: if the enrollment is already committed, return it
      // without charging the buyer or crediting the seller a second time.
      const [existing] = await tx
        .select()
        .from(marketplaceEnrollments)
        .where(
          and(
            eq(marketplaceEnrollments.userId, dbUserId),
            eq(marketplaceEnrollments.listingId, listingId),
          ),
        )
        .limit(1)
        .execute();
      if (existing) return existing;

      const price = listing.price ?? 0;
      if (price > 0 && String(listing.sellerId) === dbUserId) {
        throw new BadRequestException("You cannot purchase your own listing.");
      }

      // Capacity is checked from the enrollment table while the listing row is
      // locked, before any wallet or enrollment write occurs.
      if (listing.capacity != null) {
        const [capacityRow] = await tx
          .select({ count: sql<number>`count(*)` })
          .from(marketplaceEnrollments)
          .where(eq(marketplaceEnrollments.listingId, listingId))
          .execute();
        const currentEnrollments = Number(capacityRow?.count ?? 0);
        if (currentEnrollments >= listing.capacity) {
          throw new BadRequestException("Listing capacity has been reached.");
        }
      }

      const [userProfile] = await tx
        .select()
        .from(profiles)
        .where(this.userMatch(profiles.userId, dbUserId))
        .limit(1)
        .for("update")
        .execute();
      if (!userProfile) throw new NotFoundException("User profile not found");

      if (price > 0 && (userProfile.creditsBalance ?? 0) < price) {
        throw new BadRequestException(
          `Insufficient credits. Need ${price}, have ${userProfile.creditsBalance}.`,
        );
      }

      if (price > 0) {
        const [sellerProfile] = await tx
          .select()
          .from(profiles)
          .where(this.userMatch(profiles.userId, String(listing.sellerId)))
          .limit(1)
          .for("update")
          .execute();
        if (!sellerProfile) {
          throw new NotFoundException("Marketplace seller profile not found");
        }

        const creatorCut = Math.floor(
          (price * (100 - PLATFORM_FEE_PERCENT)) / 100,
        );

        await tx
          .update(profiles)
          .set({
            creditsBalance: (userProfile.creditsBalance ?? 0) - price,
            updatedAt: new Date(),
          })
          .where(this.userMatch(profiles.userId, dbUserId))
          .execute();

        await tx.execute(
          marketplaceLedgerEntryQuery({
            userId: dbUserId,
            amount: -price,
            type: "marketplace_purchase",
            listingId,
            description: `Purchased: ${listing.title}`,
            metadata: {
              sellerId: String(listing.sellerId),
              grossCredits: price,
            },
          }),
        );

        await tx
          .update(profiles)
          .set({
            creditsBalance: (sellerProfile.creditsBalance ?? 0) + creatorCut,
            updatedAt: new Date(),
          })
          .where(this.userMatch(profiles.userId, String(listing.sellerId)))
          .execute();

        await tx.execute(
          marketplaceLedgerEntryQuery({
            userId: String(listing.sellerId),
            amount: creatorCut,
            type: "creator_earning",
            listingId,
            description: `Earning from: ${listing.title}`,
            metadata: {
              buyerUserId: dbUserId,
              grossCredits: price,
              platformFeePercent: PLATFORM_FEE_PERCENT,
            },
          }),
        );
      }

      const [enrollment] = await tx
        .insert(marketplaceEnrollments)
        .values({
          userId: dbUserId,
          listingId,
          status: "active",
          creditsSpent: price,
        })
        .returning()
        .execute();

      await tx
        .update(marketplaceListings)
        .set({
          enrollmentCount: (listing.enrollmentCount || 0) + 1,
          updatedAt: new Date(),
        })
        .where(eq(marketplaceListings.id, listingId))
        .execute();

      return enrollment;
    });
  }

  // ─── Wallet ────────────────────────────────────────────────────────────────

  async getWallet(userId: string) {
    const dbUserId = toDatabaseUserId(userId);
    const [profile] = await db
      .select()
      .from(profiles)
      .where(this.userMatch(profiles.userId, userId))
      .execute();
    const txHistoryResult = await db.execute(
      marketplaceLedgerHistoryQuery(dbUserId, 30),
    );
    const txHistory =
      rowsFromExecution<Record<string, unknown>>(txHistoryResult);

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
