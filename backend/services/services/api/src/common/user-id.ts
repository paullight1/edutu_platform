import { sql, type SQL, type AnyColumn } from "drizzle-orm";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function hashHex(input: string, seed: number) {
  let hash = seed;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function toDatabaseUserId(userId: string | null | undefined): string {
  if (!userId) return "";
  if (UUID_REGEX.test(userId)) return userId.toLowerCase();

  const hash = [
    hashHex(userId, 0x811c9dc5),
    hashHex(userId, 0x9e3779b9),
    hashHex(userId, 0x85ebca6b),
    hashHex(userId, 0xc2b2ae35),
  ].join("");

  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}

export function isUuid(value: string | null | undefined): value is string {
  return Boolean(value && UUID_REGEX.test(value));
}

/**
 * Dual-key match for the `profiles`-family tables, whose `user_id` is `text`
 * and may hold EITHER the raw auth subject (Clerk `user_…` / Supabase uuid,
 * written by the mobile app + web `authService`) OR the derived uuid produced
 * by {@link toDatabaseUserId} (written by older backend paths). Pass the
 * derived id (`request.user.id`) and this matches both representations, since
 * `clerk_id_to_uuid(rawId) === derivedId`. The canonical write key is now the
 * raw auth subject; this keeps reads resilient across the transition and any
 * rows a client wrote directly.
 */
export function matchProfileUserId(column: AnyColumn, derivedUserId: string): SQL {
  return sql`(${column}::text = ${derivedUserId} OR public.clerk_id_to_uuid(${column}::text) = ${derivedUserId})`;
}
