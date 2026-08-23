import { installAiRuntimePolicy } from "./ai-runtime-policy";

describe("installAiRuntimePolicy", () => {
  it("caps compact feature routes even when a stored route asks for more", async () => {
    const resolveRoute = jest.fn().mockResolvedValue({
      feature: "opportunities.rerank",
      provider: "deepseek",
      model: "deepseek-chat",
      maxOutputTokens: 4096,
    });
    const service = { resolveRoute } as any;

    const restore = installAiRuntimePolicy(service);
    await expect(
      service.resolveRoute({ feature: "opportunities.rerank", prompt: "x" }),
    ).resolves.toMatchObject({ maxOutputTokens: 768 });
    restore();
  });

  it("caps scraper extraction below the generic completion ceiling", async () => {
    const service = {
      resolveRoute: jest.fn().mockResolvedValue({
        feature: "scraper.extract",
        provider: "deepseek",
        model: "deepseek-chat",
        maxOutputTokens: 4096,
      }),
    } as any;

    const restore = installAiRuntimePolicy(service);
    await expect(
      service.resolveRoute({ feature: "scraper.extract", prompt: "x" }),
    ).resolves.toMatchObject({ maxOutputTokens: 2048 });
    restore();
  });

  it("does not alter features without a compact-task policy", async () => {
    const originalRoute = {
      feature: "docs.sop",
      provider: "deepseek",
      model: "deepseek-chat",
      maxOutputTokens: 2048,
    };
    const original = jest.fn().mockResolvedValue(originalRoute);
    const service = { resolveRoute: original } as any;

    const restore = installAiRuntimePolicy(service);
    await expect(
      service.resolveRoute({ feature: "docs.sop", prompt: "x" }),
    ).resolves.toEqual(originalRoute);
    restore();
  });

  it("is reference-counted and restores the original route resolver", () => {
    const original = jest.fn();
    const service = { resolveRoute: original } as any;

    const restoreFirst = installAiRuntimePolicy(service);
    const wrapped = service.resolveRoute;
    const restoreSecond = installAiRuntimePolicy(service);

    expect(service.resolveRoute).toBe(wrapped);
    restoreSecond();
    expect(service.resolveRoute).toBe(wrapped);
    restoreFirst();
    expect(service.resolveRoute).toBe(original);
  });
});
