const handlers = new Map<string, (payload: { new?: unknown }) => void>();
const channel: any = {
  topic: "edutu:mobile:community-dm:11111111-1111-4111-8111-111111111111",
  on: jest.fn(
    (
      _kind: string,
      config: { event: string },
      handler: (payload: { new?: unknown }) => void,
    ) => {
      handlers.set(config.event, handler);
      return channel;
    },
  ),
  subscribe: jest.fn(),
};
const getChannels = jest.fn();
const removeChannel = jest.fn();
const createChannel = jest.fn(() => channel);

jest.mock("../lib/supabase", () => ({
  supabase: {
    getChannels,
    removeChannel,
    channel: createChannel,
  },
}));

import { subscribeToDmMessages } from "../packages/core/src/services/communityDmsRealtime";

const CONVERSATION_ID = "11111111-1111-4111-8111-111111111111";

describe("mobile community DM realtime", () => {
  beforeEach(() => {
    handlers.clear();
    channel.on.mockClear();
    channel.subscribe.mockClear();
    getChannels.mockReset().mockReturnValue([]);
    removeChannel.mockClear();
    createChannel.mockClear();
  });

  it("subscribes to one conversation, maps inserts, and cleans up once", () => {
    const onMessage = jest.fn();
    const unsubscribe = subscribeToDmMessages(CONVERSATION_ID, onMessage);

    expect(createChannel).toHaveBeenCalledWith(
      `edutu:mobile:community-dm:${CONVERSATION_ID}`,
    );
    expect(channel.on).toHaveBeenCalledWith(
      "postgres_changes",
      expect.objectContaining({
        event: "INSERT",
        schema: "public",
        table: "community_dm_messages",
        filter: `conversation_id=eq.${CONVERSATION_ID}`,
      }),
      expect.any(Function),
    );

    handlers.get("INSERT")?.({
      new: {
        id: "22222222-2222-4222-8222-222222222222",
        conversation_id: CONVERSATION_ID,
        sender_id: "user_sender",
        body: "Hello from web",
        created_at: "2026-08-23T20:00:00.000Z",
      },
    });

    expect(onMessage).toHaveBeenCalledWith({
      id: "22222222-2222-4222-8222-222222222222",
      conversationId: CONVERSATION_ID,
      senderId: "user_sender",
      body: "Hello from web",
      createdAt: "2026-08-23T20:00:00.000Z",
    });

    unsubscribe();
    unsubscribe();
    expect(removeChannel).toHaveBeenCalledTimes(1);
  });

  it("does not create a channel for an invalid conversation id", () => {
    const unsubscribe = subscribeToDmMessages("not-a-uuid", jest.fn());
    unsubscribe();
    expect(createChannel).not.toHaveBeenCalled();
  });
});
