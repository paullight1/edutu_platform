import { beforeEach, describe, expect, it, vi } from "vitest";

const realtime = vi.hoisted(() => {
  const handlers = new Map<string, (payload: { new?: unknown }) => void>();
  const channel = {
    topic: "edutu:web:community:group-1",
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
    getChannels: vi.fn(() => []),
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

import { subscribeToGroupMessages } from "../../features/community/realtime";

describe("community group realtime", () => {
  beforeEach(() => {
    realtime.handlers.clear();
    realtime.channel.on.mockClear();
    realtime.channel.subscribe.mockClear();
    realtime.getChannels.mockClear();
    realtime.removeChannel.mockClear();
    realtime.createChannel.mockClear();
  });

  it("subscribes to INSERT and UPDATE so moderator tombstones replace visible text", () => {
    const onChange = vi.fn();
    const unsubscribe = subscribeToGroupMessages("group-1", onChange);

    expect(realtime.handlers.has("INSERT")).toBe(true);
    expect(realtime.handlers.has("UPDATE")).toBe(true);

    realtime.handlers.get("UPDATE")?.({
      new: {
        id: "11111111-1111-4111-8111-111111111111",
        group_id: "group-1",
        user_id: "user_1",
        body: "",
        kind: "text",
        opportunity_id: null,
        call_id: null,
        created_at: "2026-08-23T10:00:00.000Z",
        deleted_at: "2026-08-23T10:02:00.000Z",
        deleted_by: "user_mod",
      },
    });

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "11111111-1111-4111-8111-111111111111",
        body: "",
        deletedAt: "2026-08-23T10:02:00.000Z",
      }),
    );

    unsubscribe();
    expect(realtime.removeChannel).toHaveBeenCalledWith(realtime.channel);
  });

  it("is a no-op for an empty group id", () => {
    const unsubscribe = subscribeToGroupMessages("", vi.fn());
    unsubscribe();
    expect(realtime.createChannel).not.toHaveBeenCalled();
  });
});
