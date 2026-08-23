import { isSupabaseConfigured, supabase } from "../../lib/supabaseClient";
import type { CommunityMessage } from "./types";

type RealtimeMessageRow = {
  id?: unknown;
  group_id?: unknown;
  user_id?: unknown;
  body?: unknown;
  kind?: unknown;
  opportunity_id?: unknown;
  call_id?: unknown;
  created_at?: unknown;
  deleted_at?: unknown;
  deleted_by?: unknown;
};

function mapRealtimeMessage(row: RealtimeMessageRow): CommunityMessage | null {
  if (
    typeof row.id !== "string" ||
    typeof row.group_id !== "string" ||
    typeof row.user_id !== "string" ||
    typeof row.body !== "string" ||
    typeof row.created_at !== "string"
  ) {
    return null;
  }
  return {
    id: row.id,
    groupId: row.group_id,
    userId: row.user_id,
    body: row.body,
    kind: typeof row.kind === "string" ? row.kind : "text",
    opportunityId: typeof row.opportunity_id === "string" ? row.opportunity_id : null,
    callId: typeof row.call_id === "string" ? row.call_id : null,
    createdAt: row.created_at,
    deletedAt: typeof row.deleted_at === "string" ? row.deleted_at : null,
    deletedBy: typeof row.deleted_by === "string" ? row.deleted_by : null,
  };
}

export function subscribeToGroupMessages(
  groupId: string,
  onInsert: (message: CommunityMessage) => void,
): () => void {
  if (!groupId || !isSupabaseConfigured) return () => undefined;

  const topic = `edutu:web:community:${groupId}`;
  for (const existing of supabase.getChannels()) {
    if (existing.topic === `realtime:${topic}` || existing.topic === topic) {
      void supabase.removeChannel(existing);
    }
  }

  const channel = supabase
    .channel(topic)
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "community_group_messages",
        filter: `group_id=eq.${groupId}`,
      },
      (payload) => {
        const message = mapRealtimeMessage(payload.new as RealtimeMessageRow);
        if (message) onInsert(message);
      },
    );

  try {
    channel.subscribe();
  } catch {
    void supabase.removeChannel(channel);
    return () => undefined;
  }

  return () => {
    void supabase.removeChannel(channel);
  };
}
