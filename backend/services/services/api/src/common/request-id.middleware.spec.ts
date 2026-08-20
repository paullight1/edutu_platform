import { normalizeRequestId, requestIdMiddleware } from "./request-id.middleware";

describe("requestIdMiddleware", () => {
  it("preserves a valid caller request id and exposes it on the response", () => {
    const request = { headers: { "x-request-id": "client-request-123" } } as any;
    const response = { setHeader: jest.fn() } as any;
    const next = jest.fn();

    requestIdMiddleware(request, response, next);

    expect(request.requestId).toBe("client-request-123");
    expect(request.headers["x-request-id"]).toBe("client-request-123");
    expect(response.setHeader).toHaveBeenCalledWith(
      "X-Edutu-Request-Id",
      "client-request-123",
    );
    expect(next).toHaveBeenCalledTimes(1);
  });

  it("replaces unsafe values with an opaque generated id", () => {
    const value = normalizeRequestId("<script>");
    expect(value).toMatch(/^[0-9a-f-]{36}$/i);
  });
});
