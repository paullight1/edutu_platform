describe("Node WebSocket bootstrap", () => {
  const originalEnvironment = { ...process.env };
  const originalWebSocket = Object.getOwnPropertyDescriptor(
    globalThis,
    "WebSocket",
  );

  afterEach(() => {
    process.env = { ...originalEnvironment };
    if (originalWebSocket) {
      Object.defineProperty(globalThis, "WebSocket", originalWebSocket);
    } else {
      delete (globalThis as { WebSocket?: unknown }).WebSocket;
    }
    jest.resetModules();
  });

  it("loads the application graph when Node has no native WebSocket", () => {
    delete (globalThis as { WebSocket?: unknown }).WebSocket;
    process.env.SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key";

    expect(() => {
      jest.isolateModules(() => {
        require("./main");
      });
    }).not.toThrow();

    expect(globalThis.WebSocket).toBeDefined();
  });
});
