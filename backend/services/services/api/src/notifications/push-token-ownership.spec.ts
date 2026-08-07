import { NotificationsService } from "./notifications.service";
import type { PushTokenStore } from "./push-token.store";

describe("push-token account ownership", () => {
  it("reassigns the same provider token to the latest signed-in account", async () => {
    const owners = new Map<string, string>();
    const claim = jest.fn().mockImplementation(async (userId, token, dto) => {
      const key = `${dto.provider || "expo"}:${token}`;
      owners.set(key, userId);
      return { userId, token, provider: dto.provider || "expo" };
    });
    const store: PushTokenStore = {
      claim,
      listForUsers: jest.fn().mockResolvedValue([]),
      deleteByIds: jest.fn().mockResolvedValue(undefined),
    };
    const service = new NotificationsService(store);

    const first = await service.registerPushToken("clerk_account_a", {
      provider: "apns-voip",
      token: "physical-device-token",
    });
    const second = await service.registerPushToken("clerk_account_b", {
      provider: "apns-voip",
      token: "physical-device-token",
    });

    expect(owners.size).toBe(1);
    expect(owners.get("apns-voip:physical-device-token")).toBe(second.userId);
    expect(second.userId).not.toBe(first.userId);
    expect(claim).toHaveBeenCalledTimes(2);
  });
});
