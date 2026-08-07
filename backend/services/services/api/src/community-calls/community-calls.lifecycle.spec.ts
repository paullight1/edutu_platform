import { CommunityCallsLifecycle } from "./community-calls.lifecycle";
import type { CommunityCallsConfig } from "./community-calls.types";

function setup(enabled = true) {
  const repository = {} as any;
  const calls = {
    processRingDeliveries: jest.fn().mockResolvedValue(undefined),
  } as any;
  const gateway = {} as any;
  const config = { enabled } as CommunityCallsConfig;
  return {
    lifecycle: new CommunityCallsLifecycle(repository, calls, gateway, config),
    calls,
  };
}

describe("CommunityCallsLifecycle ring queue", () => {
  it("drains durable ring jobs on the short lifecycle interval", async () => {
    const { lifecycle, calls } = setup();

    await lifecycle.drainRingQueue();

    expect(calls.processRingDeliveries).toHaveBeenCalledTimes(1);
  });

  it("does not claim ring jobs while the feature is disabled", async () => {
    const { lifecycle, calls } = setup(false);

    await lifecycle.drainRingQueue();

    expect(calls.processRingDeliveries).not.toHaveBeenCalled();
  });
});
