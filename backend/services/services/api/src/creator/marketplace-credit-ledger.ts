import { sql, type SQL } from "drizzle-orm";

export interface MarketplaceLedgerEntry {
  userId: string;
  amount: number;
  type: "marketplace_purchase" | "creator_earning";
  listingId: string;
  description: string;
  metadata?: Record<string, unknown>;
}

export function marketplaceLedgerEntryQuery(
  entry: MarketplaceLedgerEntry,
): SQL {
  const metadata = JSON.stringify(entry.metadata ?? {});
  return sql`
    insert into public.credit_transactions (
      user_id,
      type,
      amount,
      description,
      related_id,
      related_type,
      metadata
    )
    values (
      ${entry.userId},
      ${entry.type},
      ${entry.amount},
      ${entry.description},
      ${entry.listingId},
      'marketplace_listing',
      ${metadata}::jsonb
    )
  `;
}

export function marketplaceEarningsTotalQuery(userId: string): SQL {
  return sql`
    select coalesce(sum(amount), 0)::bigint as total
    from public.credit_transactions
    where user_id = ${userId}
      and type = 'creator_earning'
  `;
}

export function marketplaceLedgerHistoryQuery(
  userId: string,
  limit = 30,
  type?: "marketplace_purchase" | "creator_earning",
): SQL {
  const safeLimit = Math.min(Math.max(Math.floor(limit), 1), 100);
  const typePredicate = type ? sql`and type = ${type}` : sql``;
  return sql`
    select
      id,
      user_id as "userId",
      amount,
      type,
      'completed'::text as status,
      related_id as "referenceId",
      description,
      metadata,
      created_at as "createdAt"
    from public.credit_transactions
    where user_id = ${userId}
      ${typePredicate}
    order by created_at desc
    limit ${safeLimit}
  `;
}

export function rowsFromExecution<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  const rows = (result as { rows?: unknown[] } | null)?.rows;
  return Array.isArray(rows) ? (rows as T[]) : [];
}
