import { BadRequestException } from "@nestjs/common";
import { sql, type SQL } from "drizzle-orm";
import type { MarketplaceCatalogQueryDto } from "./dto/marketplace.dto";

export type MarketplaceCursor = {
  v: 1;
  createdAt: string;
  id: string;
};

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function escapeLike(value: string): string {
  return value
    .replaceAll("\\", "\\\\")
    .replaceAll("%", "\\%")
    .replaceAll("_", "\\_");
}

export function encodeMarketplaceCursor(cursor: MarketplaceCursor): string {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

export function decodeMarketplaceCursor(
  encoded?: string,
): MarketplaceCursor | null {
  if (!encoded) return null;
  try {
    const value = JSON.parse(
      Buffer.from(encoded, "base64url").toString("utf8"),
    ) as Partial<MarketplaceCursor>;
    const createdAt =
      typeof value.createdAt === "string" ? new Date(value.createdAt) : null;
    if (
      value.v !== 1 ||
      !createdAt ||
      Number.isNaN(createdAt.getTime()) ||
      typeof value.id !== "string" ||
      !UUID_REGEX.test(value.id)
    ) {
      throw new Error("shape");
    }
    return {
      v: 1,
      createdAt: createdAt.toISOString(),
      id: value.id.toLowerCase(),
    };
  } catch {
    throw new BadRequestException("Invalid marketplace catalogue cursor");
  }
}

function publicMarketplaceProjection(): SQL {
  return sql`
    l.id,
    l.title,
    l.description,
    l.category,
    l.type,
    coalesce(l.price, 0)::integer as "price",
    l.image_url as "imageUrl",
    l.preview_url as "previewUrl",
    l.event_date as "eventDate",
    l.event_end_date as "eventEndDate",
    l.event_location as "eventLocation",
    l.capacity,
    coalesce(l.enrollment_count, 0)::integer as "enrollmentCount",
    coalesce(l.rating, 0)::integer as "rating",
    coalesce(l.review_count, 0)::integer as "reviewCount",
    coalesce(l.is_featured, false) as "isFeatured",
    coalesce(l.tags, '{}') as "tags",
    l.created_at as "createdAt",
    l.updated_at as "updatedAt",
    coalesce(nullif(trim(p.full_name), ''), 'Edutu creator') as "sellerName",
    true as "sellerVerified",
    (l.capacity is not null and coalesce(l.enrollment_count, 0) >= l.capacity) as "soldOut",
    case
      when l.capacity is null then null
      else greatest(l.capacity - coalesce(l.enrollment_count, 0), 0)
    end as "remainingCapacity"
  `;
}

function approvedSellerPredicate(): SQL {
  return sql`(p.creator_status = 'approved' or p.mentor_status = 'approved')`;
}

export function buildPublicMarketplaceCatalogQuery(
  query: MarketplaceCatalogQueryDto,
): SQL {
  const limit = Math.min(Math.max(query.limit ?? 20, 1), 50);
  const cursor = decodeMarketplaceCursor(query.cursor);
  const searchPattern = query.q ? `%${escapeLike(query.q)}%` : null;
  const cursorPredicate = cursor
    ? sql`and (
        l.created_at < ${cursor.createdAt}::timestamptz
        or (l.created_at = ${cursor.createdAt}::timestamptz and l.id < ${cursor.id}::uuid)
      )`
    : sql``;

  return sql`
    select ${publicMarketplaceProjection()}
    from public.marketplace_listings l
    join public.profiles p
      on public.clerk_id_to_uuid(p.user_id::text)::uuid = l.seller_id
    where l.status = 'active'
      and ${approvedSellerPredicate()}
      ${query.category ? sql`and l.category = ${query.category}` : sql``}
      ${query.type ? sql`and l.type = ${query.type}` : sql``}
      ${
        searchPattern
          ? sql`and (
              l.title ilike ${searchPattern} escape '\\'
              or coalesce(l.description, '') ilike ${searchPattern} escape '\\'
              or l.category ilike ${searchPattern} escape '\\'
              or coalesce(p.full_name, '') ilike ${searchPattern} escape '\\'
            )`
          : sql``
      }
      ${cursorPredicate}
    order by l.created_at desc, l.id desc
    limit ${limit + 1}
  `;
}

export function buildPublicMarketplaceDetailQuery(listingId: string): SQL {
  return sql`
    select ${publicMarketplaceProjection()}
    from public.marketplace_listings l
    join public.profiles p
      on public.clerk_id_to_uuid(p.user_id::text)::uuid = l.seller_id
    where l.id = ${listingId}::uuid
      and l.status = 'active'
      and ${approvedSellerPredicate()}
    limit 1
  `;
}

export function buildMarketplaceAdminLookupQuery(listingId: string): SQL {
  return sql`
    select
      l.id,
      l.status,
      l.seller_id as "sellerId",
      (p.creator_status = 'approved' or p.mentor_status = 'approved') as "sellerApproved"
    from public.marketplace_listings l
    left join public.profiles p
      on public.clerk_id_to_uuid(p.user_id::text)::uuid = l.seller_id
    where l.id = ${listingId}::uuid
    limit 1
    for update of l
  `;
}

export function buildMarketplaceReviewUpdateQuery(
  listingId: string,
  status: "active" | "rejected",
): SQL {
  return sql`
    update public.marketplace_listings
    set status = ${status}, updated_at = now()
    where id = ${listingId}::uuid
    returning id, status, title, category, type, price, updated_at as "updatedAt"
  `;
}

export function buildMarketplaceAdminAuditQuery(input: {
  listingId: string;
  adminId: string;
  decision: "approve" | "reject";
  note?: string;
}): SQL {
  const metadata = JSON.stringify({
    decision: input.decision,
    note: input.note ?? null,
  });
  return sql`
    insert into public.admin_audit_logs (
      action,
      actor_user_id,
      resource,
      resource_id,
      metadata
    )
    values (
      'marketplace_listing_review',
      ${input.adminId},
      'marketplace_listing',
      ${input.listingId},
      ${metadata}::jsonb
    )
  `;
}

export function buildMarketplaceEnrollmentListQuery(userId: string): SQL {
  return sql`
    select
      e.id,
      e.listing_id as "listingId",
      e.status,
      e.credits_spent as "creditsSpent",
      e.enrolled_at as "enrolledAt",
      e.completed_at as "completedAt",
      l.title,
      l.category,
      l.type,
      l.image_url as "imageUrl"
    from public.marketplace_enrollments e
    join public.marketplace_listings l on l.id = e.listing_id
    where e.user_id = ${userId}::uuid
    order by e.enrolled_at desc
    limit 100
  `;
}
