import { describe, expect, it, vi } from "vitest";
import {
  clerkFrontendApiOrigin,
  preconnectAuthOrigins,
  scheduleAuthChunkPrefetch,
} from "./authWarmup";

describe("auth warmup", () => {
  it("decodes the Clerk frontend API origin from test and live keys", () => {
    expect(
      clerkFrontendApiOrigin("pk_test_Y2xlcmsuZWR1dHUub3JnJA"),
    ).toBe("https://clerk.edutu.org");
    expect(clerkFrontendApiOrigin("not-a-clerk-key")).toBeNull();
  });

  it("preconnects each valid auth origin once", () => {
    preconnectAuthOrigins({
      clerkPublishableKey: "pk_live_Y2xlcmsuZWR1dHUub3JnJA",
      supabaseUrl: "https://example.supabase.co/rest/v1",
    });
    preconnectAuthOrigins({
      clerkPublishableKey: "pk_live_Y2xlcmsuZWR1dHUub3JnJA",
      supabaseUrl: "https://example.supabase.co/rest/v1",
    });

    const origins = Array.from(
      document.head.querySelectorAll<HTMLLinkElement>('link[rel="preconnect"]'),
      (link) => link.href,
    );
    expect(origins.filter((origin) => origin === "https://clerk.edutu.org/")).toHaveLength(1);
    expect(origins.filter((origin) => origin === "https://example.supabase.co/")).toHaveLength(1);
    expect(origins.filter((origin) => origin === "https://challenges.cloudflare.com/")).toHaveLength(1);
  });

  it("uses idle time to prefetch and returns a cancellation function", () => {
    const prefetch = vi.fn();
    const cancelIdleCallback = vi.fn();
    const requestIdleCallback = vi.fn((callback: () => void) => {
      callback();
      return 42;
    });

    const cancel = scheduleAuthChunkPrefetch(prefetch, {
      requestIdleCallback,
      cancelIdleCallback,
    });

    expect(prefetch).toHaveBeenCalledOnce();
    cancel();
    expect(cancelIdleCallback).toHaveBeenCalledWith(42);
  });
});
