import { beforeEach, describe, expect, it, vi } from "vitest";

const realtime = vi.hoisted(() => {
  const handlers = new Map<string, (payload: { new?: unknown }) => void>();
  const channel = {
    topic: "edutu:web:community-dm:11111111-1111-4111-8111-111111111111",
    on: vi.fn(
      (
        _kind: string,
        config: { event: string },
        handler: (payload: { new?: unknown }) => void,
      ) => {
        handlers.set(config.event, handler);
        return channel;
      },
    ),
    subscribe: vi.fn(),
  };
  return {
    handlers,
    channel,
    existing: { topic: `realtime:${channel.topic}` },
    getChannels: vi.fn(),
    removeChannel: vi.fn(),
    createChannel: vi.fn(() => channel),
  };
});

vi.mock("../../lib/supabaseClient", () => ({
  isSupabaseConfigured: true,
  supabase: {
    getChannels: realtime.getChannels,
    removeChannel: realtime.removeChannel,
    channel: realtime.createChannel,
  },
}));

import { subscribeToDmMessages } from "../../features/community/dmRealtime";

const CONVERSATION_ID = "11111111-1111-4111-8111-111111111111";

describe("web community DM realtime", () => {
  beforeEach(() => {
    realtime.handlers.clear();
    realtime.channel.on.mockClear();
    realtime.channel.subscribe.mockClear();
    realtime.getChannels.mockReset().mockReturnValue([]);
    realtime.removeChannel.mockClear();
    realtime.createChannel.mockClear();
  });

  it("subscribes to one conversation and maps snake_case inserts", () => {
    const onMessage = vi.fn();
    const unsubscribe = subscribeToDmMessages(CONVERSATION_ID, onMessage);

    expect(realtime.createChannel).toHaveBeenCalledWith(
      `edutu:web:community-dm:${CONVERSATION_ID}`,
    );
    expect(realtime.channel.on).toHaveBeenCalledWith(
      "postgres_changes",
      expect.objectContaining({
        event: "INSERT",
        schema: "public",
        table: "community_dm_messages",
        filter: `conversation_id=eq.${CONVERSATION_ID}`,
      }),
      expect.any(Function),
    );

    realtime.handlers.get("INSERT")?.({
      new: {
        id: "22222222-2222-4222-8222-222222222222",
        conversation_id: CONVERSATION_ID,
        sender_id: "user_sender",
        body: "Hello from mobile",
        created_at: "2026-08-23T20:00:00.000Z",
      },
    });

    expect(onMessage).toHaveBeenCalledWith({
      id: "22222222-2222-4222-8222-222222222222",
      conversationId: CONVERSATION_ID,
      senderId: "user_sender",
      body: "Hello from mobile",
      createdAt: "2026-08-23T20:00:00.000Z",
    });

    unsubscribe();
    unsubscribe();
    expect(realtime.removeChannel).toHaveBeenCalledTimes(1);
  });

  it("removes a duplicate channel before subscribing", () => {
    realtime.getChannels.mockReturnValue([realtime.existing]);
    const unsubscribe = subscribeToDmMessages(CONVERSATION_ID, vi.fn());
    expect(realtime.removeChannel).toHaveBeenCalledWith(realtime.existing);
    unsubscribe();
  });

  it.each(["", "not-a-uuid", "../escape"])(
    "does not subscribe for an invalid conversation id: %s",
    (conversationId) => {
      const unsubscribe = subscribeToDmMessages(conversationId, vi.fn());
      unsubscribe();
      expect(realtime.createChannel).not.toHaveBeenCalled();
    },
  );
});
