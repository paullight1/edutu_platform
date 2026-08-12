import { supabase } from '../../../../lib/supabase';
import type { CommunityMessage } from './communities';

/**
 * Realtime for the group discussion currently on screen.
 *
 * ONE CHANNEL, FOR ONE GROUP — never one per joined group. Supabase's Realtime
 * connection budget is per project, and a client that opens a channel for every
 * group a user belongs to multiplies that user's footprint by their membership
 * count: the project's own sizing puts that pattern's ceiling at roughly 25
 * simultaneous users against a 12k–25k DAU target. It also keeps a websocket
 * awake per group, which is a battery cost the mid-range Androids this product
 * targets cannot absorb. The on-screen group is the only one whose messages
 * anybody is looking at, so it is the only one worth a socket.
 *
 * SUBSCRIBE ON FOCUS, UNSUBSCRIBE ON BLUR — not on unmount. A navigator keeps
 * screens mounted behind the one on top, so an unmount-only teardown leaves a
 * backgrounded chat holding its socket open indefinitely. With React Navigation
 * that is `useFocusEffect(useCallback(() => subscribeToGroupMessages(...), []))`
 * — the returned function is the blur cleanup.
 */

/** The raw `community_group_messages` row as Postgres changes deliver it. */
type RawMessageRow = {
  id?: string;
  group_id?: string;
  user_id?: string;
  body?: string;
  kind?: string;
  opportunity_id?: string | null;
  created_at?: string;
  deleted_at?: string | null;
  deleted_by?: string | null;
};

/**
 * Realtime hands back the database row verbatim, in snake_case. Every other
 * `CommunityMessage` in the app arrives through the REST API, which serializes
 * Drizzle's camelCase field names — so casting a Realtime payload straight to
 * `CommunityMessage` would type-check and then give the UI a message whose
 * `groupId`, `createdAt` and `deletedAt` are all `undefined`. Hence an explicit
 * mapping rather than a cast.
 */
function toCommunityMessage(row: RawMessageRow): CommunityMessage | null {
  if (!row || typeof row.id !== 'string') return null;
  return {
    id: row.id,
    groupId: row.group_id ?? '',
    userId: row.user_id ?? '',
    body: row.body ?? '',
    kind: row.kind ?? 'text',
    opportunityId: row.opportunity_id ?? null,
    createdAt: row.created_at ?? new Date().toISOString(),
    deletedAt: row.deleted_at ?? null,
    deletedBy: row.deleted_by ?? null,
  };
}

/**
 * Stream live changes to one group's messages.
 *
 * `onMessage` fires for INSERTs **and** for UPDATEs. Both are needed:
 * moderation is a soft delete — the server blanks `body` and stamps
 * `deleted_at`, deliberately keeping the row so the tombstone can propagate. An
 * INSERT-only subscription would leave the deleted text sitting on every other
 * member's screen until they reloaded, which is the exact opposite of what a
 * delete is for. Callers upsert by `id`: an INSERT appends, an UPDATE replaces
 * in place, and a message with `deletedAt` set renders as a tombstone.
 *
 * The returned function is idempotent — calling it twice removes the channel
 * once — because focus/blur cleanups do occasionally fire more than once
 * (a blur followed by an unmount).
 */
export function subscribeToGroupMessages(
  groupId: string,
  onMessage: (message: CommunityMessage) => void,
): () => void {
  const handle = (payload: { new?: RawMessageRow | null }) => {
    const message = toCommunityMessage((payload?.new ?? {}) as RawMessageRow);
    if (message) onMessage(message);
  };

  const filter = {
    schema: 'public',
    table: 'community_group_messages',
    filter: `group_id=eq.${groupId}`,
  };

  const channel = supabase
    .channel(`community_group:${groupId}`)
    .on('postgres_changes', { event: 'INSERT', ...filter }, handle)
    // The moderator tombstone. See the doc comment above.
    .on('postgres_changes', { event: 'UPDATE', ...filter }, handle)
    .subscribe();

  let removed = false;
  return () => {
    if (removed) return;
    removed = true;
    void supabase.removeChannel(channel);
  };
}

/**
 * One app-level group-message listener used by unread badges. It deliberately
 * does not open one channel per joined group; the callback only schedules a
 * fresh authorized API read, which keeps the badge data subject to the same
 * membership rules as the Groups screen.
 */
export function subscribeToCommunityGroupInbox(onChange: () => void): () => void {
  const channel = supabase
    .channel('community:group-inbox')
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'community_group_messages' },
      onChange,
    )
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'community_group_messages' },
      onChange,
    )
    .subscribe();

  let removed = false;
  return () => {
    if (removed) return;
    removed = true;
    void supabase.removeChannel(channel);
  };
}
