import { subscribeToDmMessages } from "../packages/core/src/services/communityDmsRealtime";

jest.mock("../lib/supabase", () => {
  const handlers = new Map<
    string,
    (mockPayload: { new?: unknown }) => void
  >();
  const channel: any = {
    topic: "edutu:mobile:community-dm:11111111-1111-4111-8111-111111111111",
    on: jest.fn(
      (
        _kind: string,
        config: { event: string },
        handler: (mockPayload: { new?: unknown }) => void,
      ) => {
        handlers.set(config.event, handler);
        return channel;
      },
    ),
    subscribe: jest.fn(),
  };
  const getChannels = jest.fn(() => []);
  const removeChannel = jest.fn();
  const createChannel = jest.fn(() => channel);

  return {
    supabase: {
      getChannels,
      removeChannel,
      channel: createChannel,
    },
    __communityDmRealtimeTest: {
      handlers,
      channel,
      getChannels,
      removeChannel,
      createChannel,
    },
  };
});

type RealtimeTestControls = {
  handlers: Map<string, (payload: { new?: unknown }) => void>;
  channel: {
    topic: string;
    on: jest.Mock;
    subscribe: jest.Mock;
  };
  getChannels: jest.Mock;
  removeChannel: jest.Mock;
  createChannel: jest.Mock;
};

const realtime = (
  jest.requireMock("../lib/supabase") as {
    __communityDmRealtimeTest: RealtimeTestControls;
  }
).__communityDmRealtimeTest;

const CONVERSATION_ID = "11111111-1111-4111-8111-111111111111";

describe("mobile community DM realtime", () => {
  beforeEach(() => {
    realtime.handlers.clear();
    realtime.channel.on.mockClear();
    realtime.channel.subscribe.mockClear();
    realtime.getChannels.mockReset().mockReturnValue([]);
    realtime.removeChannel.mockClear();
    realtime.createChannel.mockClear();
  });

  it("subscribes to one conversation, maps inserts, and cleans up once", () => {
    const onMessage = jest.fn();
    const unsubscribe = subscribeToDmMessages(CONVERSATION_ID, onMessage);

    expect(realtime.createChannel).toHaveBeenCalledWith(
      `edutu:mobile:community-dm:${CONVERSATION_ID}`,
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
    expect(realtime.removeChannel).toHaveBeenCalledTimes(1);
  });

  it("does not create a channel for an invalid conversation id", () => {
    const unsubscribe = subscribeToDmMessages("not-a-uuid", jest.fn());
    unsubscribe();
    expect(realtime.createChannel).not.toHaveBeenCalled();
  });
});