import { AuthThrottleGuard } from "./auth-throttle.guard";

describe("AuthThrottleGuard lifecycle", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("unrefs the cleanup timer so it cannot keep the process alive", () => {
    const unref = jest.fn();
    const timer = { unref } as unknown as ReturnType<typeof setInterval>;
    const setIntervalSpy = jest
      .spyOn(global, "setInterval")
      .mockReturnValue(timer);

    new AuthThrottleGuard();

    expect(setIntervalSpy).toHaveBeenCalledTimes(1);
    expect(unref).toHaveBeenCalledTimes(1);
  });

  it("clears the cleanup timer exactly once when the module is destroyed", () => {
    const timer = {
      unref: jest.fn(),
    } as unknown as ReturnType<typeof setInterval>;
    jest.spyOn(global, "setInterval").mockReturnValue(timer);
    const clearIntervalSpy = jest
      .spyOn(global, "clearInterval")
      .mockImplementation(() => undefined);
    const guard = new AuthThrottleGuard();

    guard.onModuleDestroy();
    guard.onModuleDestroy();

    expect(clearIntervalSpy).toHaveBeenCalledTimes(1);
    expect(clearIntervalSpy).toHaveBeenCalledWith(timer);
  });
});
