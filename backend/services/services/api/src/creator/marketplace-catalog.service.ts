import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { sql } from "drizzle-orm";
import { db } from "../db";
import { toDatabaseUserId } from "../common/user-id";
import type {
  MarketplaceCatalogQueryDto,
  MarketplaceReviewDto,
} from "./dto/marketplace.dto";
import {
  buildMarketplaceAdminAuditQuery,
  buildMarketplaceAdminLookupQuery,
  buildMarketplaceEnrollmentListQuery,
  buildMarketplaceReviewUpdateQuery,
  buildPublicMarketplaceCatalogQuery,
  buildPublicMarketplaceDetailQuery,
  encodeMarketplaceCursor,
} from "./marketplace-catalog.query";
import { rowsFromExecution } from "./marketplace-credit-ledger";

export type PublicMarketplaceListing = {
  id: string;
  title: string;
  description: string | null;
  category: string;
  type: string;
  price: number;
  imageUrl: string | null;
  previewUrl: string | null;
  eventDate: string | Date | null;
  eventEndDate: string | Date | null;
  eventLocation: string | null;
  capacity: number | null;
  enrollmentCount: number;
  rating: number;
  reviewCount: number;
  isFeatured: boolean;
  tags: string[] | null;
  createdAt: string | Date;
  updatedAt: string | Date;
  sellerName: string;
  sellerVerified: true;
  soldOut: boolean;
  remainingCapacity: number | null;
};

@Injectable()
export class MarketplaceCatalogService {
  async listPublic(query: MarketplaceCatalogQueryDto) {
    const limit = Math.min(Math.max(query.limit ?? 20, 1), 50);
    const result = await db.execute(buildPublicMarketplaceCatalogQuery(query));
    const rows = rowsFromExecution<PublicMarketplaceListing>(result);
    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    const last = items.at(-1);
    const nextCursor =
      hasMore && last
        ? encodeMarketplaceCursor({
            v: 1,
            createdAt: new Date(last.createdAt).toISOString(),
            id: last.id,
          })
        : null;

    return { items, nextCursor, hasMore };
  }

  async getPublic(listingId: string): Promise<PublicMarketplaceListing> {
    const result = await db.execute(
      buildPublicMarketplaceDetailQuery(listingId),
    );
    const listing = rowsFromExecution<PublicMarketplaceListing>(result)[0];
    if (!listing) {
      throw new NotFoundException("Marketplace listing not found");
    }
    return listing;
  }

  async listEnrollments(userId: string) {
    const result = await db.execute(
      buildMarketplaceEnrollmentListQuery(toDatabaseUserId(userId)),
    );
    return rowsFromExecution<Record<string, unknown>>(result);
  }

  async listAdmin(status?: string) {
    const allowedStatuses = new Set([
      "pending",
      "active",
      "paused",
      "rejected",
    ]);
    if (status && !allowedStatuses.has(status)) {
      throw new BadRequestException("Invalid marketplace listing status");
    }

    const result = await db.execute(sql`
      select
        l.id,
        l.title,
        l.description,
        l.category,
        l.type,
        coalesce(l.price, 0)::integer as "price",
        l.capacity,
        coalesce(l.enrollment_count, 0)::integer as "enrollmentCount",
        l.status,
        l.created_at as "createdAt",
        l.updated_at as "updatedAt",
        coalesce(nullif(trim(p.full_name), ''), 'Edutu creator') as "sellerName",
        (p.creator_status = 'approved' or p.mentor_status = 'approved') as "sellerApproved"
      from public.marketplace_listings l
      left join public.profiles p
        on public.clerk_id_to_uuid(p.user_id::text)::uuid = l.seller_id
      ${status ? sql`where l.status = ${status}` : sql``}
      order by l.created_at desc, l.id desc
      limit 200
    `);
    return rowsFromExecution<Record<string, unknown>>(result);
  }

  async reviewListing(
    listingId: string,
    adminId: string,
    review: MarketplaceReviewDto,
  ) {
    return db.transaction(async (tx) => {
      const lookupResult = await tx.execute(
        buildMarketplaceAdminLookupQuery(listingId),
      );
      const listing = rowsFromExecution<{
        id: string;
        status: string;
        sellerApproved: boolean;
      }>(lookupResult)[0];
      if (!listing) {
        throw new NotFoundException("Marketplace listing not found");
      }
      if (review.decision === "approve" && !listing.sellerApproved) {
        throw new BadRequestException(
          "Marketplace listing seller must be an approved creator or mentor",
        );
      }

      const nextStatus =
        review.decision === "approve" ? "active" : "rejected";
      const updateResult = await tx.execute(
        buildMarketplaceReviewUpdateQuery(listingId, nextStatus),
      );
      const updated = rowsFromExecution<Record<string, unknown>>(updateResult)[0];
      if (!updated) {
        throw new NotFoundException("Marketplace listing not found");
      }

      await tx.execute(
        buildMarketplaceAdminAuditQuery({
          listingId,
          adminId,
          decision: review.decision,
          note: review.note,
        }),
      );
      return updated;
    });
  }
}
