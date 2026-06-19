import { beforeEach, describe, expect, it, vi } from "vitest";

const query = vi.hoisted(() => {
  const state = {
    eq: vi.fn(),
    lt: vi.fn(),
    limit: vi.fn(),
    order: vi.fn(),
    select: vi.fn(),
  };

  state.select.mockReturnValue(state);
  state.eq.mockReturnValue(state);
  state.order.mockReturnValue(state);
  state.limit.mockResolvedValue({ data: [], error: null });
  state.lt.mockReturnValue(state);

  return state;
});

const supabaseFrom = vi.hoisted(() => vi.fn(() => query));

vi.mock("../../lib/supabaseClient", () => ({
  supabase: {
    from: supabaseFrom,
  },
}));

import { fetchNotifications } from "../../services/notifications";
import { toDatabaseUserId } from "../../lib/userId";

describe("notification service", () => {
  beforeEach(() => {
    supabaseFrom.mockClear();
    query.select.mockClear();
    query.eq.mockClear();
    query.order.mockClear();
    query.limit.mockClear();
    query.lt.mockClear();
    query.select.mockReturnValue(query);
    query.eq.mockReturnValue(query);
    query.order.mockReturnValue(query);
    query.limit.mockResolvedValue({ data: [], error: null });
    query.lt.mockReturnValue(query);
  });

  it("requires a user id when using the Supabase fallback", async () => {
    await expect(fetchNotifications()).rejects.toThrow(
      "User must be signed in to load notifications.",
    );

    expect(supabaseFrom).not.toHaveBeenCalled();
  });

  it("filters Supabase fallback notifications to the current member", async () => {
    const userId = "user_123";

    await fetchNotifications({ userId });

    expect(supabaseFrom).toHaveBeenCalledWith("notifications");
    expect(query.eq).toHaveBeenCalledWith("user_id", toDatabaseUserId(userId));
  });
});
