import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchWithRetry, fetchWithTimeout, retry } from "./retry";

describe("web request reliability", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("retries a failed GET response and returns the successful response", async () => {
    const unavailable = { status: 503 } as Response;
    const success = { status: 200 } as Response;
    fetchMock.mockResolvedValueOnce(unavailable).mockResolvedValueOnce(success);

    const result = await fetchWithRetry("/opportunities", {
      retryOptions: { maxAttempts: 2, baseDelay: 0, maxDelay: 0 },
    });

    expect(result).toBe(success);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("returns the final HTTP error response like fetch does", async () => {
    const unavailable = { status: 503 } as Response;
    fetchMock.mockResolvedValue(unavailable);

    const result = await fetchWithRetry("/opportunities", {
      retryOptions: { maxAttempts: 2, baseDelay: 0, maxDelay: 0 },
    });

    expect(result).toBe(unavailable);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not repeat failed POST requests or retry non-retriable HTTP statuses", async () => {
    fetchMock.mockResolvedValueOnce({ status: 503 });
    const postResponse = await fetchWithRetry("/support", {
      method: "POST",
      body: JSON.stringify({ message: "help" }),
    });
    expect(postResponse.status).toBe(503);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    fetchMock.mockResolvedValueOnce({ status: 400 });
    const badRequest = await fetchWithRetry("/opportunities");
    expect(badRequest.status).toBe(400);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not retry unrelated application exceptions", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("Invalid form input"));
    await expect(
      retry(fn, { maxAttempts: 3, baseDelay: 0, maxDelay: 0 }),
    ).rejects.toThrow("Invalid form input");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("preserves navigation cancellation and stops retrying", async () => {
    const controller = new AbortController();
    fetchMock.mockImplementation((_url: string, init: RequestInit) => {
      return new Promise<Response>((_resolve, reject) => {
        const signal = init.signal!;
        signal.addEventListener("abort", () => reject(signal.reason), {
          once: true,
        });
      });
    });

    const promise = fetchWithRetry("/opportunities", {
      signal: controller.signal,
      retryOptions: { maxAttempts: 3, baseDelay: 0, maxDelay: 0 },
    });
    controller.abort(new DOMException("navigation", "AbortError"));

    await expect(promise).rejects.toMatchObject({ name: "AbortError" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("aborts stalled requests at the configured timeout", async () => {
    vi.useFakeTimers();
    fetchMock.mockImplementation((_url: string, init: RequestInit) => {
      return new Promise<Response>((_resolve, reject) => {
        init.signal!.addEventListener(
          "abort",
          () => reject(init.signal!.reason),
          { once: true },
        );
      });
    });

    const request = fetchWithTimeout("/opportunities", { timeout: 50 });
    const rejection = expect(request).rejects.toMatchObject({
      name: "TimeoutError",
    });
    await vi.advanceTimersByTimeAsync(50);
    await rejection;
  });
});
