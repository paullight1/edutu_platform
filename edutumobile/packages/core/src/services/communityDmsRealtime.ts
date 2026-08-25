import { supabase } from '../../../../lib/supabase';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface DmRealtimeMessage {
  id: string;
  conversationId: string;
  senderId: string;
  body: string;
  createdAt: string;
}

type RealtimeDmRow = {
  id?: unknown;
  conversation_id?: unknown;
  sender_id?: unknown;
  body?: unknown;
  created_at?: unknown;
};

function mapRealtimeDmMessage(row: RealtimeDmRow): DmRealtimeMessage | null {
  if (
    typeof row.id !== 'string' ||
    typeof row.conversation_id !== 'string' ||
    typeof row.sender_id !== 'string' ||
    typeof row.body !== 'string' ||
    typeof row.created_at !== 'string'
  ) {
    return null;
  }
  return {
    id: row.id,
    conversationId: row.conversation_id,
    senderId: row.sender_id,
    body: row.body,
    createdAt: row.created_at,
  };
}

/** One focused Realtime channel for the DM conversation currently on screen. */
export function subscribeToDmMessages(
  conversationId: string,
  onMessage: (message: DmRealtimeMessage) => void,
): () => void {
  if (!UUID_PATTERN.test(conversationId)) return () => undefined;

  const topic = `edutu:mobile:community-dm:${conversationId}`;
  for (const existing of supabase.getChannels()) {
    if (existing.topic === topic || existing.topic === `realtime:${topic}`) {
      void supabase.removeChannel(existing);
    }
  }

  const channel = supabase
    .channel(topic)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'community_dm_messages',
        filter: `conversation_id=eq.${conversationId}`,
      },
      (payload) => {
        const message = mapRealtimeDmMessage(payload.new as RealtimeDmRow);
        if (message?.conversationId === conversationId) onMessage(message);
      },
    );

  try {
    channel.subscribe();
  } catch {
    void supabase.removeChannel(channel);
    return () => undefined;
  }

  let removed = false;
  return () => {
    if (removed) return;
    removed = true;
    void supabase.removeChannel(channel);
  };
}
